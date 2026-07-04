import { Platform, Vibration } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { formatBookingDateTime } from '@/lib/booking/format';
import {
  applyVirtualBookingLifecycle,
  applyVirtualBookingLifecycleBatch,
  listBookingsForShop,
  sortBookingsByScheduledAtDesc,
} from '@/lib/booking/storage';
import type { Booking, BookingStatus } from '@/lib/booking/types';
import { filterPendingQueueBookingsForStaff } from '@/lib/booking/wash/bookingDispatch';
import type { ShopStaffUser } from '@/lib/shop/shopStaffUser';
import { getSupabase } from '@/lib/supabase/client';
import { userAlert } from '@/lib/ui/userAlert';

type BookingRow = {
  id: string;
  shop_id: string;
  branch_id?: string | null;
  shop_type: Booking['shopType'];
  customer_id?: string | null;
  customer_phone?: string | null;
  customer_name?: string | null;
  car_type: string;
  car_color: string | null;
  service_id?: string | null;
  service_name?: string | null;
  service_name_ar?: string | null;
  service_price_egp: number | string | null;
  platform_fee_egp: number | string | null;
  original_price_egp?: number | string | null;
  points_redeemed?: number | null;
  discount_applied_egp?: number | string | null;
  final_amount_paid_egp?: number | string | null;
  offer_id?: string | null;
  customer_notes?: string | null;
  owner_rejection_note?: string | null;
  booking_type?: Booking['bookingType'] | null;
  scheduled_at: string;
  status: BookingStatus;
  created_at: string;
};

export function mapBookingRowFromRemote(row: BookingRow): Booking {
  return {
    id: row.id,
    shopId: row.shop_id,
    branchId: row.branch_id ?? undefined,
    shopType: row.shop_type,
    customerId: row.customer_id ?? undefined,
    customerPhone: row.customer_phone ?? '',
    customerName: row.customer_name ?? undefined,
    carType: row.car_type,
    carColor: row.car_color ?? '',
    serviceId: row.service_id ?? undefined,
    serviceName: row.service_name ?? undefined,
    serviceNameAr: row.service_name_ar ?? undefined,
    servicePriceEgp: Number(row.service_price_egp ?? 0),
    platformFeeEgp: Number(row.platform_fee_egp ?? 0),
    originalPriceEgp: row.original_price_egp != null ? Number(row.original_price_egp) : undefined,
    pointsRedeemed: row.points_redeemed ?? undefined,
    discountAppliedEgp: row.discount_applied_egp != null ? Number(row.discount_applied_egp) : undefined,
    finalAmountPaidEgp: row.final_amount_paid_egp != null ? Number(row.final_amount_paid_egp) : undefined,
    offerId: row.offer_id ?? undefined,
    customerNotes: row.customer_notes ?? undefined,
    ownerRejectionNote: row.owner_rejection_note ?? undefined,
    bookingType: row.booking_type ?? undefined,
    scheduledAt: row.scheduled_at,
    status: row.status,
    createdAt: row.created_at,
  };
}

export function isPendingBookingStatus(status: string): boolean {
  return status === 'pending';
}

/** Branch-manager scope before pending dispatch rules. */
export function scopeBookingsForStaffView(bookings: Booking[], staff: ShopStaffUser | null): Booking[] {
  if (!staff || staff.role !== 'branch_manager' || !staff.branchId) return bookings;
  return bookings.filter((booking) => booking.branchId === staff.branchId);
}

export async function resolvePendingBookingsForStaff(
  staff: ShopStaffUser | null,
  bookings: Booking[],
  activeBranchId?: string,
): Promise<Booking[]> {
  const scoped = scopeBookingsForStaffView(bookings, staff);
  let pending = await filterPendingQueueBookingsForStaff(staff, scoped);
  if (activeBranchId) {
    pending = pending.filter((row) => !row.branchId || row.branchId === activeBranchId);
  }
  return sortBookingsByScheduledAtDesc(pending);
}

export async function countPendingBookingsForStaff(
  staff: ShopStaffUser | null,
  bookings: Booking[],
  activeBranchId?: string,
): Promise<number> {
  const pending = await resolvePendingBookingsForStaff(staff, bookings, activeBranchId);
  return pending.length;
}

export async function bookingEligibleForStaffAlert(
  staff: ShopStaffUser | null,
  booking: Booking,
  activeBranchId?: string,
): Promise<boolean> {
  if (!isPendingBookingStatus(booking.status)) return false;
  if (activeBranchId && booking.branchId && booking.branchId !== activeBranchId) return false;
  const [match] = await filterPendingQueueBookingsForStaff(staff, [booking]);
  return !!match;
}

export function mergeBookingList(existing: Booking[], incoming: Booking): Booking[] {
  const next = existing.some((row) => row.id === incoming.id)
    ? existing.map((row) => (row.id === incoming.id ? incoming : row))
    : [incoming, ...existing];
  return sortBookingsByScheduledAtDesc(applyVirtualBookingLifecycleBatch(next));
}

export function upsertPendingBookingSorted(existing: Booking[], incoming: Booking): Booking[] {
  const normalized = applyVirtualBookingLifecycle(incoming);
  if (existing.some((row) => row.id === normalized.id)) {
    return sortBookingsByScheduledAtDesc(
      applyVirtualBookingLifecycleBatch(
        existing.map((row) => (row.id === normalized.id ? normalized : row)),
      ),
    );
  }
  return sortBookingsByScheduledAtDesc(applyVirtualBookingLifecycleBatch([normalized, ...existing]));
}

export function removePendingBookingLocally(bookings: Booking[], bookingId: string): Booking[] {
  return bookings.filter((row) => row.id !== bookingId || !isPendingBookingStatus(row.status));
}

export async function loadScopedShopBookings(shopId: string, staff: ShopStaffUser | null): Promise<Booking[]> {
  const rows = await listBookingsForShop(shopId);
  return sortBookingsByScheduledAtDesc(scopeBookingsForStaffView(rows, staff));
}

export async function triggerMerchantOrderAlert(booking: Booking, locale: 'en' | 'ar'): Promise<void> {
  if (Platform.OS !== 'web') {
    Vibration.vibrate([0, 280, 120, 280]);
  }
  const when = formatBookingDateTime(booking.scheduledAt, locale);
  userAlert(
    locale === 'ar' ? 'طلب حجز جديد!' : 'New booking request!',
    `${booking.customerPhone} · ${booking.carType} · ${when}`,
  );
}

export type MerchantBookingRealtimeHandlers = {
  onPendingInsert?: (booking: Booking) => void;
  onBookingUpdate?: (booking: Booking, previousStatus?: BookingStatus) => void;
};

const activeMerchantBookingChannels = new Map<string, RealtimeChannel>();

function merchantBookingChannelName(shopId: string): string {
  return `public:bookings:${shopId}`;
}

function teardownMerchantBookingChannel(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  channelName: string,
): void {
  const tracked = activeMerchantBookingChannels.get(channelName);
  if (tracked) {
    void supabase.removeChannel(tracked);
    activeMerchantBookingChannels.delete(channelName);
  }

  for (const existing of supabase.getChannels()) {
    if (existing.topic === channelName) {
      void supabase.removeChannel(existing);
    }
  }
}

export function subscribeMerchantBookingRealtime(
  input: {
    shopId: string;
    staff: ShopStaffUser | null;
    activeBranchId?: string;
  },
  handlers: MerchantBookingRealtimeHandlers,
): () => void {
  const supabase = getSupabase();
  if (!supabase || !input.shopId) return () => {};

  const channelName = merchantBookingChannelName(input.shopId);

  // Prevent double-registration when React remounts, tabs blur, or hot-reload reuses the topic.
  teardownMerchantBookingChannel(supabase, channelName);

  const handleRow = async (row: BookingRow, previousStatus?: BookingStatus) => {
    const booking = mapBookingRowFromRemote(row);
    if (booking.shopId !== input.shopId) return;

    if (isPendingBookingStatus(booking.status)) {
      const eligible = await bookingEligibleForStaffAlert(input.staff, booking, input.activeBranchId);
      if (!eligible) return;
      if (!previousStatus || !isPendingBookingStatus(previousStatus)) {
        handlers.onPendingInsert?.(booking);
      } else {
        handlers.onBookingUpdate?.(booking, previousStatus);
      }
      return;
    }

    handlers.onBookingUpdate?.(booking, previousStatus);
  };

  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'bookings',
        filter: `shop_id=eq.${input.shopId}`,
      },
      (payload) => {
        void handleRow(payload.new as BookingRow);
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'bookings',
        filter: `shop_id=eq.${input.shopId}`,
      },
      (payload) => {
        const previous = payload.old as Partial<BookingRow> | undefined;
        void handleRow(payload.new as BookingRow, previous?.status);
      },
    );

  // CRITICAL: subscribe only after every postgres_changes listener is registered.
  channel.subscribe((status) => {
    if (__DEV__) {
      console.log('Realtime subscription status:', status, channelName);
    }
  });

  activeMerchantBookingChannels.set(channelName, channel);

  return () => {
    teardownMerchantBookingChannel(supabase, channelName);
  };
}
