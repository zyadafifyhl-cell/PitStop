import { pushCustomerNotification } from '@/lib/booking/commerceEvents';
import {
  inferLocaleFromPhone,
  resolveCustomerLocalesBatch,
} from '@/lib/booking/customerLocaleRepository';
import { getShopById } from '@/lib/booking/catalogRepository';
import { formatBookingDateTime } from '@/lib/booking/format';
import { mapBookingRowFromRemote } from '@/lib/notifications/notificationService';
import { syncLocalBookingsFromRemote } from '@/lib/booking/storage';
import type { Booking } from '@/lib/booking/types';
import type { WashShopStatus } from '@/lib/booking/wash/types';
import { tp, translate, type Locale } from '@/lib/i18n/strings';
import { getSupabase } from '@/lib/supabase/client';

type BookingClosureRow = {
  id: string;
  shop_id: string;
  branch_id?: string | null;
  customer_id?: string | null;
  customer_phone?: string | null;
  scheduled_at: string;
  status: Booking['status'];
  shop_type: Booking['shopType'];
  car_type: string;
  car_color: string | null;
  service_id?: string | null;
  service_name?: string | null;
  service_name_ar?: string | null;
  service_price_egp: number | string | null;
  platform_fee_egp: number | string | null;
  booking_type?: Booking['bookingType'] | null;
  created_at: string;
};

function mapClosureRow(row: BookingClosureRow): Booking {
  return mapBookingRowFromRemote(row);
}

function customerLookupKey(booking: Booking): string {
  return booking.customerId?.trim() || `phone:${booking.customerPhone.trim()}`;
}

function buildShopReopenedNotificationContent(booking: Booking, locale: Locale) {
  const shop = getShopById(booking.shopId);
  const shopName = shop ? (locale === 'ar' ? shop.nameAr : shop.name) : booking.shopId;
  const when = formatBookingDateTime(booking.scheduledAt, locale);

  return {
    locale,
    message: tp(locale, 'customer_notification_booking_shop_reopened', {
      shop: shopName,
      when,
    }),
    statusLabel: translate(locale, 'customer_notification_status_reopened'),
  };
}

/** Suspend future confirmed bookings for a branch entering closed/vacation. */
export async function suspendFutureConfirmedBookingsForBranch(
  shopId: string,
  branchId: string,
): Promise<Booking[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'suspended_by_shop' })
    .eq('shop_id', shopId)
    .eq('branch_id', branchId)
    .eq('status', 'confirmed')
    .gt('scheduled_at', nowIso)
    .select('*');

  if (error) {
    console.warn('suspendFutureConfirmedBookingsForBranch:', error.message);
    return [];
  }

  const bookings = (data ?? []).map((row) => mapClosureRow(row as BookingClosureRow));
  if (bookings.length) {
    await syncLocalBookingsFromRemote(bookings);
  }
  return bookings;
}

/** Restore branch bookings suspended during closure when the branch re-opens. */
export async function restoreSuspendedBookingsForBranch(
  shopId: string,
  branchId: string,
): Promise<Booking[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'confirmed' })
    .eq('shop_id', shopId)
    .eq('branch_id', branchId)
    .eq('status', 'suspended_by_shop')
    .gt('scheduled_at', nowIso)
    .select('*');

  if (error) {
    console.warn('restoreSuspendedBookingsForBranch:', error.message);
    return [];
  }

  const bookings = (data ?? []).map((row) => mapClosureRow(row as BookingClosureRow));
  if (bookings.length) {
    await syncLocalBookingsFromRemote(bookings);
  }
  return bookings;
}

export async function notifyCustomersShopReopened(bookings: Booking[]): Promise<void> {
  if (!bookings.length) return;

  const deduped = new Map<string, Booking>();
  for (const booking of bookings) {
    const key = customerLookupKey(booking);
    if (!key || key === 'phone:') continue;
    if (!deduped.has(key)) deduped.set(key, booking);
  }

  const localeMap = await resolveCustomerLocalesBatch(
    [...deduped.values()].map((booking) => ({
      customerId: booking.customerId,
      customerPhone: booking.customerPhone,
    })),
  );

  await Promise.all(
    [...deduped.values()].map((booking) => {
      const key = customerLookupKey(booking);
      const locale = localeMap.get(key) ?? inferLocaleFromPhone(booking.customerPhone);
      const content = buildShopReopenedNotificationContent(booking, locale);

      return pushCustomerNotification({
        customerId: booking.customerId,
        customerPhone: booking.customerPhone,
        kind: 'booking_shop_reopened',
        shopId: booking.shopId,
        bookingId: booking.id,
        scheduledAt: booking.scheduledAt,
        highPriority: true,
        locale: content.locale,
        message: content.message,
        statusLabel: content.statusLabel,
      });
    }),
  );
}

export async function applyShopOperationalBookingExceptionFlow(input: {
  shopId: string;
  branchId: string;
  previousStatus: WashShopStatus;
  nextStatus: WashShopStatus;
}): Promise<void> {
  const { shopId, branchId, previousStatus, nextStatus } = input;

  if (nextStatus === 'closed' || nextStatus === 'vacation') {
    await suspendFutureConfirmedBookingsForBranch(shopId, branchId);
    return;
  }

  if (
    nextStatus === 'open' &&
    (previousStatus === 'closed' || previousStatus === 'vacation')
  ) {
    const restored = await restoreSuspendedBookingsForBranch(shopId, branchId);
    await notifyCustomersShopReopened(restored);
  }
}
