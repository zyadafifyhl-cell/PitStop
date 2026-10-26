import type { Booking, BookingStatus, ShopDayHours, ShopExtras } from '@/lib/booking/types';
import {
  clampSlotDuration,
  clampTotalBays,
  DEFAULT_CLOSING_TIME,
  DEFAULT_OPENING_TIME,
  DEFAULT_SLOT_DURATION_MINUTES,
  DEFAULT_TOTAL_BAYS,
  formatPgTime,
  SLOT_DURATION_OPTIONS,
  SLOT_GRID_MINUTES,
  toServiceDurationMinutes,
  type SlotDurationOption,
} from '@/lib/booking/bayCapacityConfig';
import { getShopExtras, persistShopCapacityLocal } from '@/lib/booking/shopExtrasStorage';
import { peakOccupancy } from '@/lib/booking/slotOccupancy';
import { getSupabase } from '@/lib/supabase/client';
import {
  resolveDefaultBranchIdForShop,
  resolveRemoteBranchId,
  updateBranchRemote,
} from '@/lib/booking/wash/branchRepository';

export {
  clampSlotDuration,
  clampTotalBays,
  DEFAULT_CLOSING_TIME,
  DEFAULT_OPENING_TIME,
  DEFAULT_SLOT_DURATION_MINUTES,
  DEFAULT_TOTAL_BAYS,
  formatPgTime,
  SLOT_DURATION_OPTIONS,
  SLOT_GRID_MINUTES,
  toServiceDurationMinutes,
};
export type { SlotDurationOption };

export const SLOT_FULL_ERROR = 'SLOT_FULL';

export class SlotFullError extends Error {
  constructor(message = SLOT_FULL_ERROR) {
    super(message);
    this.name = 'SlotFullError';
  }
}

export type SlotAvailabilityResult = {
  is_available: boolean;
  remaining_bays: number;
  total_bays: number;
  occupied_bays: number;
};

export type BayOccupancyTone = 'green' | 'orange' | 'red';

export type BranchCapacityConfig = {
  totalBays: number;
  slotDurationMinutes: SlotDurationOption;
  openingTime: string;
  closingTime: string;
};

const OCCUPYING_STATUSES: BookingStatus[] = ['pending', 'confirmed', 'in_progress'];

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function isOccupyingBookingStatus(status: BookingStatus | undefined): boolean {
  return !!status && OCCUPYING_STATUSES.includes(status);
}

export function isSlotFullError(error: unknown): boolean {
  if (error instanceof SlotFullError) return true;
  if (!error || typeof error !== 'object') return false;
  const row = error as { message?: string; code?: string };
  const message = String(row.message ?? '');
  return message.includes(SLOT_FULL_ERROR) || row.code === 'P0001';
}

export function bayOccupancyTone(occupied: number, total: number): BayOccupancyTone {
  const remaining = Math.max(total - occupied, 0);
  if (remaining <= 0) return 'red';
  if (remaining === 1) return 'orange';
  return 'green';
}

export function occupancyFromCounts(occupied: number, totalBays: number): SlotAvailabilityResult {
  const total = clampTotalBays(totalBays);
  const taken = Math.max(0, occupied);
  const remaining = Math.max(total - taken, 0);
  return {
    is_available: remaining > 0,
    remaining_bays: remaining,
    total_bays: total,
    occupied_bays: Math.min(taken, total),
  };
}

export function totalBaysFromExtras(extras: ShopExtras | null | undefined): number {
  return clampTotalBays(extras?.totalBays ?? DEFAULT_TOTAL_BAYS);
}

export function slotDurationFromExtras(extras: ShopExtras | null | undefined): SlotDurationOption {
  return clampSlotDuration(extras?.slotDurationMinutes ?? extras?.serviceDurationMinutes);
}

export { appointmentBlockStarts, countBookingsInSlot, occupancyForSlot, peakOccupancy } from '@/lib/booking/slotOccupancy';

function parseAvailabilityPayload(raw: unknown): SlotAvailabilityResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const total = clampTotalBays(Number(row.total_bays ?? DEFAULT_TOTAL_BAYS));
  const occupied = Math.max(0, Number(row.occupied_bays ?? 0));
  const remaining =
    row.remaining_bays != null ? Math.max(0, Number(row.remaining_bays)) : Math.max(total - occupied, 0);
  return {
    is_available: row.is_available === true || remaining > 0,
    remaining_bays: remaining,
    total_bays: total,
    occupied_bays: Math.min(occupied, total),
  };
}

export async function checkSlotAvailability(
  branchId: string,
  targetTime: Date | string,
  durationMinutes = SLOT_GRID_MINUTES,
): Promise<SlotAvailabilityResult> {
  const supabase = getSupabase();
  const iso = typeof targetTime === 'string' ? targetTime : targetTime.toISOString();
  const duration = Math.max(1, Math.round(durationMinutes) || SLOT_GRID_MINUTES);
  if (!branchId.trim()) {
    return occupancyFromCounts(0, DEFAULT_TOTAL_BAYS);
  }

  if (supabase && isUuid(branchId)) {
    const { data, error } = await supabase.rpc('check_slot_availability', {
      p_branch_id: branchId,
      p_target_time: iso,
      p_duration_minutes: duration,
    });
    const parsed = !error ? parseAvailabilityPayload(data) : null;
    if (parsed) return parsed;
    if (error) console.warn('checkSlotAvailability:', error.message);
  }

  return fallbackCheckSlotAvailability(branchId, iso, duration);
}

async function fallbackCheckSlotAvailability(
  branchId: string,
  targetIso: string,
  durationMinutes: number,
): Promise<SlotAvailabilityResult> {
  const supabase = getSupabase();
  if (!supabase || !isUuid(branchId)) {
    return occupancyFromCounts(0, DEFAULT_TOTAL_BAYS);
  }

  const startMs = new Date(targetIso).getTime();
  if (Number.isNaN(startMs)) return occupancyFromCounts(0, DEFAULT_TOTAL_BAYS);
  const lookbackMs = startMs - 14 * 24 * 60 * 60_000;
  const horizonMs = startMs + Math.max(1, durationMinutes) * 60_000;

  const [{ data: branch, error: branchError }, { data: bookings, error: bookingError }] = await Promise.all([
    supabase.from('shop_branches').select('total_bays').eq('id', branchId).maybeSingle(),
    supabase
      .from('bookings')
      .select('scheduled_at, status, service_duration_minutes, branch_id')
      .eq('branch_id', branchId)
      .in('status', OCCUPYING_STATUSES)
      .gte('scheduled_at', new Date(lookbackMs).toISOString())
      .lt('scheduled_at', new Date(horizonMs).toISOString()),
  ]);

  if (branchError) console.warn('checkSlotAvailability branch:', branchError.message);
  if (bookingError) console.warn('checkSlotAvailability bookings:', bookingError.message);

  const totalBays = clampTotalBays(Number(branch?.total_bays ?? DEFAULT_TOTAL_BAYS));
  const rows = (bookings ?? []).map((row) => ({
    scheduledAt: String(row.scheduled_at),
    status: row.status as Booking['status'],
    serviceDurationMinutes:
      row.service_duration_minutes != null ? Number(row.service_duration_minutes) : undefined,
    branchId: row.branch_id ? String(row.branch_id) : undefined,
  }));
  return occupancyFromCounts(
    peakOccupancy({ bookings: rows, startMs, durationMinutes, branchId }),
    totalBays,
  );
}

export function applyCapacityToWeeklyHours(
  weeklyHours: ShopDayHours[] | undefined,
  openingTime: string,
  closingTime: string,
): ShopDayHours[] {
  const source = weeklyHours?.length ? weeklyHours : [];
  return source.map((row) =>
    row.closed
      ? row
      : {
          ...row,
          openTime: openingTime,
          closeTime: closingTime,
        },
  );
}

export async function saveShopCapacity(input: {
  shopId: string;
  branchId?: string;
  totalBays: number;
  openingTime: string;
  closingTime: string;
  weeklyHours?: ShopDayHours[];
}): Promise<ShopExtras> {
  const totalBays = clampTotalBays(input.totalBays);
  const weeklyHours = applyCapacityToWeeklyHours(
    input.weeklyHours,
    input.openingTime,
    input.closingTime,
  );

  let branchId = input.branchId?.trim() || undefined;
  if (branchId && !isUuid(branchId)) {
    branchId = (await resolveRemoteBranchId(input.shopId, branchId)) ?? undefined;
  }
  if (!branchId) {
    branchId = (await resolveDefaultBranchIdForShop(input.shopId)) ?? undefined;
  }

  if (branchId) {
    await updateBranchRemote(
      branchId,
      {
        totalBays,
        openingTime: input.openingTime,
        closingTime: input.closingTime,
        workOpenTime: input.openingTime,
        workCloseTime: input.closingTime,
        weeklyHours: weeklyHours.length ? weeklyHours : undefined,
      },
      input.shopId,
    );
  }

  return persistShopCapacityLocal(input.shopId, {
    totalBays,
    workOpenTime: input.openingTime,
    workCloseTime: input.closingTime,
    weeklyHours: weeklyHours.length ? weeklyHours : undefined,
    activeBranchId: branchId,
  });
}

export async function loadShopCapacitySnapshot(shopId: string): Promise<ShopExtras> {
  return getShopExtras(shopId);
}

export function capacityConfigFromExtras(extras: ShopExtras | null | undefined): BranchCapacityConfig {
  return {
    totalBays: totalBaysFromExtras(extras),
    slotDurationMinutes: SLOT_GRID_MINUTES,
    openingTime: extras?.workOpenTime?.trim() || DEFAULT_OPENING_TIME,
    closingTime: extras?.workCloseTime?.trim() || DEFAULT_CLOSING_TIME,
  };
}
