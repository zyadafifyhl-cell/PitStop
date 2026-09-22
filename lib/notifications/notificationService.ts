import { Platform, Vibration } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { formatBookingDateTime, formatMerchantCancellationBody } from '@/lib/booking/format';
import {
  applyVirtualBookingLifecycle,
  applyVirtualBookingLifecycleBatch,
  listBookingsForShop,
  sortBookingsByScheduledAtDesc,
} from '@/lib/booking/storage';
import type { Booking, BookingStatus } from '@/lib/booking/types';
import {
  filterOperationalBookingsForStaff,
  filterPendingQueueBookingsForStaff,
} from '@/lib/booking/wash/bookingDispatch';
import { pushWashCenterNotification } from '@/lib/booking/wash/washNotificationCenter';
import { formatEgp } from '@/lib/booking/reporting';
import { sendShopPushForStoreOrder } from '@/lib/push/shopPush';
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
  is_hidden_by_merchant?: boolean | null;
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
    isHiddenByMerchant: Boolean(row.is_hidden_by_merchant),
  };
}

export function isPendingBookingStatus(status: string): boolean {
  return status === 'pending';
}

/** Inbox/badge only keep pending bookings whose slot is still in the future. */
export function isActionablePendingBooking(booking: Booking, now = Date.now()): boolean {
  const effective = applyVirtualBookingLifecycle(booking, now);
  if (!isPendingBookingStatus(effective.status)) return false;
  const scheduledMs = new Date(booking.scheduledAt).getTime();
  if (!Number.isFinite(scheduledMs)) return false;
  return scheduledMs > now;
}

/** Sync branch-manager scope (async owner fallback handled in loadScopedShopBookings). */
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
  pending = pending.filter((row) => isActionablePendingBooking(row));
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
  if (!isActionablePendingBooking(booking)) return false;
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
  const next = existing.some((row) => row.id === normalized.id)
    ? existing.map((row) => (row.id === normalized.id ? normalized : row))
    : [normalized, ...existing];
  return sortBookingsByScheduledAtDesc(
    applyVirtualBookingLifecycleBatch(next).filter((row) => isActionablePendingBooking(row)),
  );
}

export function removePendingBookingLocally(bookings: Booking[], bookingId: string): Booking[] {
  return bookings.filter((row) => row.id !== bookingId || !isPendingBookingStatus(row.status));
}

export async function resolveAuditPendingBookingsForStaff(
  staff: ShopStaffUser | null,
  bookings: Booking[],
  activeBranchId?: string,
): Promise<Booking[]> {
  let scoped = bookings;
  if (staff?.role === 'branch_manager') {
    scoped = scopeBookingsForStaffView(bookings, staff);
  }
  let pending = scoped.filter((row) => isPendingBookingStatus(row.status));
  if (activeBranchId) {
    pending = pending.filter((row) => !row.branchId || row.branchId === activeBranchId);
  }
  return sortBookingsByScheduledAtDesc(pending);
}

export async function loadAuditPendingBookingsForStaff(
  shopId: string,
  staff: ShopStaffUser | null,
  activeBranchId?: string,
): Promise<Booking[]> {
  const rows = await listBookingsForShop(shopId);
  return resolveAuditPendingBookingsForStaff(staff, rows, activeBranchId);
}

export async function bookingEligibleForCancellationAlert(
  staff: ShopStaffUser | null,
  booking: Booking,
  activeBranchId?: string,
): Promise<boolean> {
  if (!staff || booking.status !== 'cancelled') return false;
  if (activeBranchId && booking.branchId && booking.branchId !== activeBranchId) return false;

  if (staff.role === 'owner') return true;

  if (staff.role === 'branch_manager') {
    if (!staff.branchId) return false;
    if (!booking.branchId) return true;
    return booking.branchId === staff.branchId;
  }

  return false;
}

export async function loadScopedShopBookings(shopId: string, staff: ShopStaffUser | null): Promise<Booking[]> {
  const rows = await listBookingsForShop(shopId);
  const operational = await filterOperationalBookingsForStaff(staff, rows);
  return sortBookingsByScheduledAtDesc(operational);
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

export async function triggerMerchantCancellationAlert(booking: Booking, locale: 'en' | 'ar'): Promise<void> {
  if (Platform.OS !== 'web') {
    Vibration.vibrate([0, 200, 100, 200]);
  }
  userAlert(
    locale === 'ar' ? 'تم إلغاء الحجز' : 'Booking cancelled',
    formatMerchantCancellationBody(booking, locale),
  );
}

/** Merchant-side realtime handler: in-app notification center + alert popup. */
export async function handleMerchantBookingCancelledRealtime(
  booking: Booking,
  staff: ShopStaffUser | null,
  locale: 'en' | 'ar',
  activeBranchId?: string,
): Promise<void> {
  const eligible = await bookingEligibleForCancellationAlert(staff, booking, activeBranchId);
  if (!eligible) return;

  if (booking.shopType === 'wash') {
    await pushWashCenterNotification({
      shopId: booking.shopId,
      branchId: booking.branchId,
      kind: 'cancelled_booking',
      title: locale === 'ar' ? 'تم إلغاء الحجز' : 'Booking cancelled',
      body: formatMerchantCancellationBody(booking, locale),
      bookingId: booking.id,
    });
  }

  await triggerMerchantCancellationAlert(booking, locale);
}

export type MerchantBookingRealtimeHandlers = {
  onPendingInsert?: (booking: Booking) => void;
  onBookingUpdate?: (booking: Booking, previousStatus?: BookingStatus) => void;
};

type MerchantBookingListener = {
  id: string;
  input: {
    shopId: string;
    staff: ShopStaffUser | null;
    activeBranchId?: string;
  };
  handlers: MerchantBookingRealtimeHandlers;
};

type MerchantBookingChannelState = {
  channel: RealtimeChannel;
  listeners: Map<string, MerchantBookingListener>;
};

const activeMerchantBookingChannels = new Map<string, MerchantBookingChannelState>();
let merchantBookingListenerSeq = 0;

function merchantBookingChannelName(shopId: string): string {
  return `public:bookings:${shopId}`;
}

async function dispatchMerchantBookingRow(
  shopId: string,
  listener: MerchantBookingListener,
  row: BookingRow,
  previousStatus?: BookingStatus,
): Promise<void> {
  const booking = mapBookingRowFromRemote(row);
  if (booking.shopId !== shopId) return;

  const { input, handlers } = listener;

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
  const listenerId = `listener-${++merchantBookingListenerSeq}`;

  let state = activeMerchantBookingChannels.get(channelName);
  if (!state) {
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
          const current = activeMerchantBookingChannels.get(channelName);
          if (!current) return;
          for (const listener of current.listeners.values()) {
            void dispatchMerchantBookingRow(input.shopId, listener, payload.new as BookingRow);
          }
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
          const current = activeMerchantBookingChannels.get(channelName);
          if (!current) return;
          const previous = payload.old as Partial<BookingRow> | undefined;
          for (const listener of current.listeners.values()) {
            void dispatchMerchantBookingRow(
              input.shopId,
              listener,
              payload.new as BookingRow,
              previous?.status,
            );
          }
        },
      );

    channel.subscribe((status) => {
      if (__DEV__) {
        console.log('Realtime subscription status:', status, channelName);
      }
    });

    state = { channel, listeners: new Map() };
    activeMerchantBookingChannels.set(channelName, state);
  }

  state.listeners.set(listenerId, { id: listenerId, input, handlers });

  return () => {
    const current = activeMerchantBookingChannels.get(channelName);
    if (!current) return;
    current.listeners.delete(listenerId);
    if (current.listeners.size === 0) {
      void supabase.removeChannel(current.channel);
      activeMerchantBookingChannels.delete(channelName);
    }
  };
}

// ---------------------------------------------------------------------------
// Store orders (retail) — web + native realtime alerts
// ---------------------------------------------------------------------------

export type MerchantStoreOrderRealtimeRow = {
  id: string;
  shop_id: string;
  total_price: number | string;
  status?: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  fulfillment_method?: string | null;
  created_at?: string | null;
};

export type MerchantStoreOrderRealtimeHandlers = {
  onInsert?: (order: MerchantStoreOrderRealtimeRow) => void;
  onUpdate?: (order: MerchantStoreOrderRealtimeRow) => void;
};

type MerchantStoreOrderListener = {
  id: string;
  handlers: MerchantStoreOrderRealtimeHandlers;
};

type MerchantStoreOrderChannelState = {
  channel: RealtimeChannel;
  listeners: Map<string, MerchantStoreOrderListener>;
};

const activeMerchantStoreOrderChannels = new Map<string, MerchantStoreOrderChannelState>();
let merchantStoreOrderListenerSeq = 0;

function merchantStoreOrderChannelName(shopId: string): string {
  return `store-orders:${shopId}`;
}

export async function triggerMerchantStoreOrderAlert(
  order: MerchantStoreOrderRealtimeRow,
  locale: 'en' | 'ar',
): Promise<void> {
  if (Platform.OS !== 'web') {
    Vibration.vibrate([0, 500, 200, 500]);
  }

  const shortId = order.id.replace(/-/g, '').slice(0, 8).toUpperCase();
  const total = formatEgp(Number(order.total_price) || 0, locale);
  userAlert(
    locale === 'ar' ? 'طلب جديد' : 'New Store Order',
    locale === 'ar'
      ? `طلب #${shortId} وصل — ${total}`
      : `Order #${shortId} received — ${total}`,
  );

  if (order.shop_id) {
    void sendShopPushForStoreOrder({
      shopId: order.shop_id,
      orderId: order.id,
      totalEgp: Number(order.total_price) || 0,
    });
  }
}

/**
 * Shared realtime subscription for `public.store_orders` INSERT/UPDATE.
 * Works on web and native (Supabase Realtime WebSocket).
 */
export function subscribeMerchantStoreOrderRealtime(
  shopId: string,
  handlers: MerchantStoreOrderRealtimeHandlers,
): () => void {
  const supabase = getSupabase();
  if (!supabase || !shopId) return () => {};

  const channelName = merchantStoreOrderChannelName(shopId);
  const listenerId = `store-order-listener-${++merchantStoreOrderListenerSeq}`;

  let state = activeMerchantStoreOrderChannels.get(channelName);
  if (!state) {
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'store_orders',
          filter: `shop_id=eq.${shopId}`,
        },
        (payload) => {
          const current = activeMerchantStoreOrderChannels.get(channelName);
          if (!current) return;
          const row = payload.new as MerchantStoreOrderRealtimeRow;
          if (!row?.id || row.shop_id !== shopId) return;
          for (const listener of current.listeners.values()) {
            listener.handlers.onInsert?.(row);
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'store_orders',
          filter: `shop_id=eq.${shopId}`,
        },
        (payload) => {
          const current = activeMerchantStoreOrderChannels.get(channelName);
          if (!current) return;
          const row = payload.new as MerchantStoreOrderRealtimeRow;
          if (!row?.id || row.shop_id !== shopId) return;
          for (const listener of current.listeners.values()) {
            listener.handlers.onUpdate?.(row);
          }
        },
      );

    channel.subscribe((status) => {
      if (__DEV__) {
        console.log('Realtime subscription status:', status, channelName);
      }
    });

    state = { channel, listeners: new Map() };
    activeMerchantStoreOrderChannels.set(channelName, state);
  }

  state.listeners.set(listenerId, { id: listenerId, handlers });

  return () => {
    const current = activeMerchantStoreOrderChannels.get(channelName);
    if (!current) return;
    current.listeners.delete(listenerId);
    if (current.listeners.size === 0) {
      void supabase.removeChannel(current.channel);
      activeMerchantStoreOrderChannels.delete(channelName);
    }
  };
}
