import { clampTotalBays, SLOT_GRID_MINUTES } from '@/lib/booking/bayCapacityConfig';
import { slotStartLocalMs } from '@/lib/booking/format';
import type { Booking, BookingStatus } from '@/lib/booking/types';

const OCCUPYING_STATUSES: BookingStatus[] = ['pending', 'confirmed', 'in_progress'];

export type SlotOccupancy = {
  is_available: boolean;
  remaining_bays: number;
  total_bays: number;
  occupied_bays: number;
};

type OccupyingBooking = Pick<Booking, 'scheduledAt' | 'status' | 'serviceDurationMinutes' | 'branchId'>;

export function bookingDurationMinutes(booking: Pick<Booking, 'serviceDurationMinutes'>): number {
  const duration = booking.serviceDurationMinutes;
  if (duration != null && duration > 0) return Math.round(duration);
  return SLOT_GRID_MINUTES;
}

/** 30-minute block starts covered by an appointment of `durationMinutes` beginning at `startMs`. */
export function appointmentBlockStarts(startMs: number, durationMinutes: number): number[] {
  const duration = Math.max(1, Math.round(durationMinutes));
  const endMs = startMs + duration * 60_000;
  const step = SLOT_GRID_MINUTES * 60_000;
  const blocks: number[] = [];
  for (let cursor = startMs; cursor < endMs; cursor += step) {
    blocks.push(cursor);
    if (blocks.length > 48 * 14) break;
  }
  return blocks;
}

function bookingOverlapsBlock(booking: OccupyingBooking, blockStartMs: number, branchId?: string): boolean {
  if (!booking.status || !OCCUPYING_STATUSES.includes(booking.status)) return false;
  if (branchId && booking.branchId && booking.branchId !== branchId) return false;
  const bookedMs = new Date(booking.scheduledAt).getTime();
  if (Number.isNaN(bookedMs)) return false;
  const bookedEndMs = bookedMs + bookingDurationMinutes(booking) * 60_000;
  const blockEndMs = blockStartMs + SLOT_GRID_MINUTES * 60_000;
  return bookedMs < blockEndMs && bookedEndMs > blockStartMs;
}

/** Highest number of active bookings sharing any 30-minute block inside the appointment. */
export function peakOccupancy(input: {
  bookings: OccupyingBooking[];
  startMs: number;
  durationMinutes: number;
  branchId?: string;
}): number {
  const blocks = appointmentBlockStarts(input.startMs, input.durationMinutes);
  let peak = 0;
  for (const blockStartMs of blocks) {
    let occupied = 0;
    for (const booking of input.bookings) {
      if (bookingOverlapsBlock(booking, blockStartMs, input.branchId)) occupied += 1;
    }
    if (occupied > peak) peak = occupied;
  }
  return peak;
}

export function occupancyFromPeak(occupied: number, totalBays: number): SlotOccupancy {
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

export function countBookingsInSlot(input: {
  bookings: OccupyingBooking[];
  dateYmd: string;
  timeHm: string;
  durationMinutes: number;
  branchId?: string;
}): number {
  const slotMs = slotStartLocalMs(input.dateYmd, input.timeHm);
  if (slotMs == null) return 0;
  return peakOccupancy({
    bookings: input.bookings,
    startMs: slotMs,
    durationMinutes: input.durationMinutes,
    branchId: input.branchId,
  });
}

export function occupancyForSlot(input: {
  bookings: OccupyingBooking[];
  dateYmd: string;
  timeHm: string;
  durationMinutes: number;
  totalBays: number;
  branchId?: string;
}): SlotOccupancy {
  return occupancyFromPeak(countBookingsInSlot(input), input.totalBays);
}
