import { getShopById } from '@/lib/booking/catalogRepository';
import { formatBookingDateTime } from '@/lib/booking/format';
import type { CustomerNotification } from '@/lib/booking/types';

type Locale = 'en' | 'ar';

type NotificationMessages = {
  bookingApproved: string;
  bookingDeclined: string;
  partsConfirmed: string;
  partsDeclined: string;
};

export function formatCustomerNotificationLine(
  notification: CustomerNotification,
  locale: Locale,
  messages: NotificationMessages,
): string {
  const shop = getShopById(notification.shopId);
  const shopName = shop ? (locale === 'ar' ? shop.nameAr : shop.name) : notification.shopId;
  const when = notification.scheduledAt
    ? formatBookingDateTime(notification.scheduledAt, locale)
    : new Date(notification.createdAt).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-EG');

  if (notification.kind === 'booking_approved') {
    return messages.bookingApproved.replace('{shop}', shopName).replace('{when}', when);
  }
  if (notification.kind === 'booking_declined') {
    return messages.bookingDeclined.replace('{shop}', shopName).replace('{when}', when);
  }
  if (notification.kind === 'parts_order_confirmed') {
    return messages.partsConfirmed.replace('{shop}', shopName);
  }
  return messages.partsDeclined.replace('{shop}', shopName);
}

export function customerNotificationIsApproved(notification: CustomerNotification): boolean {
  return notification.kind === 'booking_approved' || notification.kind === 'parts_order_confirmed';
}
