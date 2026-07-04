import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

import type { Booking, BookingStatus } from '@/lib/booking/types';
import {
  bookingEligibleForStaffAlert,
  isPendingBookingStatus,
  loadScopedShopBookings,
  mergeBookingList,
  resolvePendingBookingsForStaff,
  subscribeMerchantBookingRealtime,
  triggerMerchantOrderAlert,
} from '@/lib/notifications/notificationService';
import type { ShopStaffUser } from '@/lib/shop/shopStaffUser';

export type MerchantOrderNotifierState = {
  pendingBookings: Booking[];
  pendingCount: number;
  allBookings: Booking[];
  loading: boolean;
  refresh: () => Promise<void>;
  removePendingLocally: (bookingId: string) => void;
  patchBookingLocally: (bookingId: string, status: BookingStatus) => void;
  setAllBookings: Dispatch<SetStateAction<Booking[]>>;
};

type UseMerchantOrderNotifierOptions = {
  shopId: string | undefined;
  staff: ShopStaffUser | null;
  activeBranchId?: string;
  locale: 'en' | 'ar';
  enabled?: boolean;
  alertOnFocus?: boolean;
};

export function useMerchantOrderNotifier({
  shopId,
  staff,
  activeBranchId,
  locale,
  enabled = true,
  alertOnFocus = false,
}: UseMerchantOrderNotifierOptions): MerchantOrderNotifierState {
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [pendingBookings, setPendingBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const alertedIdsRef = useRef<Set<string>>(new Set());
  const staffRef = useRef(staff);
  const localeRef = useRef(locale);
  staffRef.current = staff;
  localeRef.current = locale;

  const recomputePending = useCallback(
    async (bookings: Booking[]) => {
      const pending = await resolvePendingBookingsForStaff(staff, bookings, activeBranchId);
      setPendingBookings(pending);
      return pending;
    },
    [staff, activeBranchId],
  );

  const refresh = useCallback(async () => {
    if (!shopId || !enabled) {
      setAllBookings([]);
      setPendingBookings([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const scoped = await loadScopedShopBookings(shopId, staff);
      setAllBookings(scoped);
      await recomputePending(scoped);
    } finally {
      setLoading(false);
    }
  }, [shopId, staff, enabled, recomputePending]);

  const removePendingLocally = useCallback((bookingId: string) => {
    setPendingBookings((prev) => prev.filter((row) => row.id !== bookingId));
  }, []);

  const patchBookingLocally = useCallback((bookingId: string, status: BookingStatus) => {
    setAllBookings((prev) => prev.map((row) => (row.id === bookingId ? { ...row, status } : row)));
    if (!isPendingBookingStatus(status)) {
      setPendingBookings((prev) => prev.filter((row) => row.id !== bookingId));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  useEffect(() => {
    if (!shopId || !enabled) return;

    const unsubscribe = subscribeMerchantBookingRealtime(
      { shopId, staff: staffRef.current, activeBranchId },
      {
        onPendingInsert: (booking) => {
          if (alertedIdsRef.current.has(booking.id)) return;
          alertedIdsRef.current.add(booking.id);
          setAllBookings((prev) => mergeBookingList(prev, booking));
          setPendingBookings((prev) => {
            if (prev.some((row) => row.id === booking.id)) return prev;
            return [...prev, booking].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
          });
          if (!alertOnFocus) {
            void triggerMerchantOrderAlert(booking, localeRef.current);
          }
        },
        onBookingUpdate: (booking, previousStatus) => {
          setAllBookings((prev) => mergeBookingList(prev, booking));
          if (isPendingBookingStatus(booking.status)) {
            void bookingEligibleForStaffAlert(staffRef.current, booking, activeBranchId).then((eligible) => {
              if (!eligible) {
                setPendingBookings((prev) => prev.filter((row) => row.id !== booking.id));
                return;
              }
              setPendingBookings((prev) => {
                if (prev.some((row) => row.id === booking.id)) return prev;
                return [...prev, booking].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
              });
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
    alertedIdsRef.current.clear();
  }, [shopId, activeBranchId]);

  return {
    pendingBookings,
    pendingCount: pendingBookings.length,
    allBookings,
    loading,
    refresh,
    removePendingLocally,
    patchBookingLocally,
    setAllBookings,
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
