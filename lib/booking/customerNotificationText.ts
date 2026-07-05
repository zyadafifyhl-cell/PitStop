import { getShopById } from '@/lib/booking/catalogRepository';
import { formatBookingDateTime } from '@/lib/booking/format';
import type { CustomerNotification } from '@/lib/booking/types';

type Locale = 'en' | 'ar';

type NotificationMessages = {
  bookingApproved: string;
  bookingDeclined: string;
  bookingShopReopened: string;
  bookingReminderHour: string;
  bookingReminderSoon: string;
  partsConfirmed: string;
  partsDeclined: string;
  reviewOwnerReply: string;
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
  if (notification.kind === 'booking_shop_reopened') {
    return messages.bookingShopReopened.replace('{shop}', shopName).replace('{when}', when);
  }
  if (notification.kind === 'booking_reminder') {
    const mins = notification.reminderMinutesBefore ?? 30;
    if (mins >= 60) {
      return messages.bookingReminderHour.replace('{shop}', shopName).replace('{when}', when);
    }
    return messages.bookingReminderSoon.replace('{shop}', shopName).replace('{when}', when);
  }
  if (notification.kind === 'parts_order_confirmed') {
    return messages.partsConfirmed.replace('{shop}', shopName);
  }
  if (notification.kind === 'review_owner_reply') {
    return messages.reviewOwnerReply.replace('{shop}', shopName);
  }
  return messages.partsDeclined.replace('{shop}', shopName);
}

export function customerNotificationIsShopReopened(notification: CustomerNotification): boolean {
  return notification.kind === 'booking_shop_reopened';
}

export function customerNotificationIsApproved(notification: CustomerNotification): boolean {
  return (
    notification.kind === 'booking_approved' ||
    notification.kind === 'booking_shop_reopened' ||
    notification.kind === 'parts_order_confirmed' ||
    notification.kind === 'booking_reminder' ||
    notification.kind === 'review_owner_reply'
  );
}

export function customerNotificationIsReminder(notification: CustomerNotification): boolean {
  return notification.kind === 'booking_reminder';
}

export function customerNotificationIsReviewReply(notification: CustomerNotification): boolean {
  return notification.kind === 'review_owner_reply';
}
