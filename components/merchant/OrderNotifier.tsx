import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Booking, BookingStatus } from '@/lib/booking/types';
import {
  bookingEligibleForStaffAlert,
  isPendingBookingStatus,
  loadScopedShopBookings,
  mergeBookingList,
  resolvePendingBookingsForStaff,
  upsertPendingBookingSorted,
  subscribeMerchantBookingRealtime,
  subscribeMerchantStoreOrderRealtime,
  triggerMerchantOrderAlert,
  triggerMerchantStoreOrderAlert,
  handleMerchantBookingCancelledRealtime,
  type MerchantStoreOrderRealtimeRow,
} from '@/lib/notifications/notificationService';
import type { ShopStaffUser } from '@/lib/shop/shopStaffUser';
import { listPendingStoreOrders, type StoreOrderWithItems } from '@/lib/store/orderRepository';

function merchantInboxSeenKey(shopId: string): string {
  return `@pitstop/merchant-inbox-seen/${shopId}`;
}

async function readMerchantInboxSeenIds(shopId: string): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(merchantInboxSeenKey(shopId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

async function writeMerchantInboxSeenIds(shopId: string, ids: Set<string>): Promise<void> {
  await AsyncStorage.setItem(merchantInboxSeenKey(shopId), JSON.stringify([...ids]));
}

function mapRealtimeStoreOrder(row: MerchantStoreOrderRealtimeRow): StoreOrderWithItems {
  return {
    id: row.id,
    userId: '',
    shopId: row.shop_id,
    subtotal: 0,
    deliveryFee: 0,
    totalPrice: Number(row.total_price) || 0,
    fulfillmentMethod: (row.fulfillment_method as StoreOrderWithItems['fulfillmentMethod']) || 'cod',
    status: (row.status as StoreOrderWithItems['status']) || 'pending',
    customerName: row.customer_name ?? undefined,
    customerPhone: row.customer_phone ?? undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    items: [],
  };
}

function upsertPendingStoreOrder(
  prev: StoreOrderWithItems[],
  order: StoreOrderWithItems,
): StoreOrderWithItems[] {
  if (order.status !== 'pending') {
    return prev.filter((row) => row.id !== order.id);
  }
  const without = prev.filter((row) => row.id !== order.id);
  return [order, ...without].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export type MerchantOrderNotifierState = {
  pendingBookings: Booking[];
  pendingCount: number;
  pendingStoreOrders: StoreOrderWithItems[];
  pendingStoreOrderCount: number;
  notificationBadgeCount: number;
  /** Unread inbox count — clears when the merchant opens notifications. */
  unseenBadgeCount: number;
  markInboxSeen: () => Promise<void>;
  allBookings: Booking[];
  loading: boolean;
  refresh: () => Promise<void>;
  refreshStoreOrders: () => Promise<void>;
  removePendingLocally: (bookingId: string) => void;
  patchBookingLocally: (bookingId: string, status: BookingStatus) => void;
  setAllBookings: Dispatch<SetStateAction<Booking[]>>;
  /** Bumps when a store_orders row arrives or leaves pending. */
  storeOrdersRevision: number;
};

type UseMerchantOrderNotifierOptions = {
  shopId: string | undefined;
  staff: ShopStaffUser | null;
  activeBranchId?: string;
  locale: 'en' | 'ar';
  enabled?: boolean;
  alertOnFocus?: boolean;
  /** Also listen for retail store_orders (default true when shopId set). */
  enableStoreOrders?: boolean;
  onStoreOrderInsert?: () => void;
};

export function useMerchantOrderNotifier({
  shopId,
  staff,
  activeBranchId,
  locale,
  enabled = true,
  alertOnFocus = false,
  enableStoreOrders = true,
  onStoreOrderInsert,
}: UseMerchantOrderNotifierOptions): MerchantOrderNotifierState {
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [pendingBookings, setPendingBookings] = useState<Booking[]>([]);
  const [pendingStoreOrders, setPendingStoreOrders] = useState<StoreOrderWithItems[]>([]);
  const [seenInboxIds, setSeenInboxIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [storeOrdersRevision, setStoreOrdersRevision] = useState(0);
  const alertedIdsRef = useRef<Set<string>>(new Set());
  const storeOrderAlertedIdsRef = useRef<Set<string>>(new Set());
  const cancellationAlertedIdsRef = useRef<Set<string>>(new Set());
  const staffRef = useRef(staff);
  const localeRef = useRef(locale);
  const onStoreOrderInsertRef = useRef(onStoreOrderInsert);
  staffRef.current = staff;
  localeRef.current = locale;
  onStoreOrderInsertRef.current = onStoreOrderInsert;

  const recomputePending = useCallback(
    async (bookings: Booking[]) => {
      const pending = await resolvePendingBookingsForStaff(staff, bookings, activeBranchId);
      setPendingBookings(pending);
      return pending;
    },
    [staff, activeBranchId],
  );

  const refreshStoreOrders = useCallback(async () => {
    if (!shopId || !enabled || !enableStoreOrders) {
      setPendingStoreOrders([]);
      return;
    }
    const rows = await listPendingStoreOrders(shopId);
    setPendingStoreOrders(rows);
  }, [shopId, enabled, enableStoreOrders]);

  const refresh = useCallback(async () => {
    if (!shopId || !enabled) {
      setAllBookings([]);
      setPendingBookings([]);
      setPendingStoreOrders([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Store orders first — must not be blocked by booking fetch failures.
      if (enableStoreOrders) {
        await refreshStoreOrders();
      }
      const scoped = await loadScopedShopBookings(shopId, staff);
      setAllBookings(scoped);
      await recomputePending(scoped);
    } catch (error) {
      console.warn('[OrderNotifier] refresh:', error);
      if (enableStoreOrders) {
        await refreshStoreOrders();
      }
    } finally {
      setLoading(false);
    }
  }, [shopId, staff, enabled, enableStoreOrders, recomputePending, refreshStoreOrders]);

  const removePendingLocally = useCallback((bookingId: string) => {
    setPendingBookings((prev) => prev.filter((row) => row.id !== bookingId));
  }, []);

  const patchBookingLocally = useCallback((bookingId: string, status: BookingStatus) => {
    setAllBookings((prev) =>
      prev.map((row) =>
        row.id === bookingId ? { ...row, status, lifecycleAutoCompleted: undefined } : row,
      ),
    );
    if (!isPendingBookingStatus(status)) {
      setPendingBookings((prev) => prev.filter((row) => row.id !== bookingId));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  // Refresh when shop auth finishes loading (useFocusEffect alone misses this).
  useEffect(() => {
    if (!shopId || !enabled) return;
    void refresh();
  }, [shopId, enabled, refresh]);

  useEffect(() => {
    if (!shopId || !enabled) return;

    const unsubscribe = subscribeMerchantBookingRealtime(
      { shopId, staff: staffRef.current, activeBranchId },
      {
        onPendingInsert: (booking) => {
          if (alertedIdsRef.current.has(booking.id)) return;
          alertedIdsRef.current.add(booking.id);
          setAllBookings((prev) => mergeBookingList(prev, booking));
          setPendingBookings((prev) => upsertPendingBookingSorted(prev, booking));
          if (!alertOnFocus) {
            void triggerMerchantOrderAlert(booking, localeRef.current);
          }
        },
        onBookingUpdate: (booking, previousStatus) => {
          setAllBookings((prev) => mergeBookingList(prev, booking));
          if (
            booking.status === 'cancelled' &&
            previousStatus &&
            previousStatus !== 'cancelled'
          ) {
            setPendingBookings((prev) => prev.filter((row) => row.id !== booking.id));
            if (!cancellationAlertedIdsRef.current.has(booking.id)) {
              cancellationAlertedIdsRef.current.add(booking.id);
              void handleMerchantBookingCancelledRealtime(
                booking,
                staffRef.current,
                localeRef.current,
                activeBranchId,
              );
            }
            return;
          }
          if (isPendingBookingStatus(booking.status)) {
            void bookingEligibleForStaffAlert(staffRef.current, booking, activeBranchId).then((eligible) => {
              if (!eligible) {
                setPendingBookings((prev) => prev.filter((row) => row.id !== booking.id));
                return;
              }
              setPendingBookings((prev) => upsertPendingBookingSorted(prev, booking));
              if (
                previousStatus &&
                !isPendingBookingStatus(previousStatus) &&
                !alertedIdsRef.current.has(booking.id)
              ) {
                alertedIdsRef.current.add(booking.id);
                void triggerMerchantOrderAlert(booking, localeRef.current);
              }
            });
            return;
          }
          setPendingBookings((prev) => prev.filter((row) => row.id !== booking.id));
        },
      },
    );

    return unsubscribe;
  }, [shopId, activeBranchId, enabled, alertOnFocus]);

  useEffect(() => {
    if (!shopId || !enabled || !enableStoreOrders) return;

    const unsubscribe = subscribeMerchantStoreOrderRealtime(shopId, {
      onInsert: (order) => {
        const mapped = mapRealtimeStoreOrder(order);
        const createdAt =
          typeof order.created_at === 'string' && order.created_at
            ? order.created_at
            : mapped.createdAt;
        const next = { ...mapped, createdAt, status: 'pending' as const };
        setPendingStoreOrders((prev) => upsertPendingStoreOrder(prev, next));
        setStoreOrdersRevision((n) => n + 1);
        onStoreOrderInsertRef.current?.();
        if (storeOrderAlertedIdsRef.current.has(order.id)) return;
        storeOrderAlertedIdsRef.current.add(order.id);
        if (!alertOnFocus) {
          void triggerMerchantStoreOrderAlert(order, localeRef.current);
        }
      },
      onUpdate: (order) => {
        const mapped = mapRealtimeStoreOrder(order);
        setPendingStoreOrders((prev) => {
          const existing = prev.find((row) => row.id === order.id);
          const next = {
            ...mapped,
            createdAt: existing?.createdAt ?? mapped.createdAt,
          };
          return upsertPendingStoreOrder(prev, next);
        });
        setStoreOrdersRevision((n) => n + 1);
      },
    });

    return unsubscribe;
  }, [shopId, enabled, enableStoreOrders, alertOnFocus]);

  useEffect(() => {
    if (!shopId) {
      setSeenInboxIds(new Set());
      return;
    }
    let cancelled = false;
    void readMerchantInboxSeenIds(shopId).then((ids) => {
      if (!cancelled) setSeenInboxIds(ids);
    });
    return () => {
      cancelled = true;
    };
  }, [shopId]);

  const markInboxSeen = useCallback(async () => {
    if (!shopId) return;
    const next = new Set(seenInboxIds);
    for (const row of pendingBookings) next.add(row.id);
    for (const row of pendingStoreOrders) next.add(row.id);
    const liveIds = new Set([...pendingBookings.map((row) => row.id), ...pendingStoreOrders.map((row) => row.id)]);
    for (const id of [...next]) {
      if (!liveIds.has(id)) next.delete(id);
    }
    setSeenInboxIds(next);
    await writeMerchantInboxSeenIds(shopId, next);
  }, [shopId, seenInboxIds, pendingBookings, pendingStoreOrders]);

  useEffect(() => {
    alertedIdsRef.current.clear();
    cancellationAlertedIdsRef.current.clear();
    storeOrderAlertedIdsRef.current.clear();
  }, [shopId, activeBranchId]);

  const pendingStoreOrderCount = pendingStoreOrders.length;
  const pendingCount = pendingBookings.length;
  const unseenBadgeCount =
    pendingBookings.filter((row) => !seenInboxIds.has(row.id)).length +
    pendingStoreOrders.filter((row) => !seenInboxIds.has(row.id)).length;

  return {
    pendingBookings,
    pendingCount,
    pendingStoreOrders,
    pendingStoreOrderCount,
    notificationBadgeCount: unseenBadgeCount,
    unseenBadgeCount,
    markInboxSeen,
    allBookings,
    loading,
    refresh,
    refreshStoreOrders,
    removePendingLocally,
    patchBookingLocally,
    setAllBookings,
    storeOrdersRevision,
  };
}

type MerchantOrderNotifierProps = UseMerchantOrderNotifierOptions & {
  children: (state: MerchantOrderNotifierState) => React.ReactNode;
};

/** Headless notifier wrapper — mounts realtime listeners and exposes pending order state. */
export function MerchantOrderNotifier({ children, ...options }: MerchantOrderNotifierProps) {
  const state = useMerchantOrderNotifier(options);
  return <>{children(state)}</>;
}
