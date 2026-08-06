import { pushOwnerNotification } from '@/lib/booking/commerceEvents';
import { formatBookingDateTime, formatMerchantCancellationBody, shopTypeLabel } from '@/lib/booking/format';
import type { Booking } from '@/lib/booking/types';
import { branchHasAssignedManager } from '@/lib/booking/wash/bookingDispatch';
import { pushWashCenterNotification } from '@/lib/booking/wash/washNotificationCenter';
import {
  sendShopPushForBooking,
  sendShopPushForBookingCancelled,
  sendShopPushForReview,
} from '@/lib/push/shopPush';

async function notifyWashBookingCenter(
  booking: Booking,
  kind: 'new_booking' | 'cancelled_booking',
): Promise<void> {
  if (booking.shopType !== 'wash') return;
  const when = formatBookingDateTime(booking.scheduledAt, 'en');
  const body =
    kind === 'cancelled_booking'
      ? formatMerchantCancellationBody(booking, 'en')
      : `${booking.customerPhone} · ${booking.carType} · ${when}`;
  await pushWashCenterNotification({
    shopId: booking.shopId,
    branchId: booking.branchId,
    kind,
    title: kind === 'new_booking' ? 'New booking request' : 'Booking cancelled',
    body,
    bookingId: booking.id,
  });
}

/** Route new booking alerts: manager-first; owner only when no branch manager exists. */
export async function notifyMerchantBookingCreated(
  booking: Booking,
  options?: { skipOwnerPush?: boolean },
): Promise<void> {
  await notifyWashBookingCenter(booking, 'new_booking');

  if (booking.shopType !== 'wash') {
    await pushOwnerNotification({
      shopId: booking.shopId,
      kind: 'service_booking',
      customerPhone: booking.customerPhone,
      bookingId: booking.id,
      shopType: booking.shopType,
      carType: booking.carType,
      scheduledAt: booking.scheduledAt,
      totalEgp: booking.servicePriceEgp,
    });
    if (!options?.skipOwnerPush) {
      await sendOwnerBookingPush(booking);
    }
    return;
  }

  const hasManager = booking.branchId ? await branchHasAssignedManager(booking.branchId) : false;
  if (hasManager) return;

  await pushOwnerNotification({
    shopId: booking.shopId,
    kind: 'service_booking',
    customerPhone: booking.customerPhone,
    bookingId: booking.id,
    shopType: booking.shopType,
    carType: booking.carType,
    scheduledAt: booking.scheduledAt,
    totalEgp: booking.servicePriceEgp,
  });
  if (!options?.skipOwnerPush) {
    await sendOwnerBookingPush(booking);
  }
}

export async function notifyMerchantBookingCancelled(booking: Booking): Promise<void> {
  const bodyEn = formatMerchantCancellationBody(booking, 'en');
  const bodyAr = formatMerchantCancellationBody(booking, 'ar');

  await notifyWashBookingCenter(booking, 'cancelled_booking');

  await pushOwnerNotification({
    shopId: booking.shopId,
    kind: 'service_booking',
    customerPhone: booking.customerPhone,
    bookingId: booking.id,
    shopType: booking.shopType,
    carType: booking.carType,
    scheduledAt: booking.scheduledAt,
    totalEgp: booking.servicePriceEgp,
  });

  await sendShopPushForBookingCancelled({
    shopId: booking.shopId,
    bodyEn,
    bodyAr,
    bookingId: booking.id,
  });
}

/** Notify owner and branch managers when a customer submits a review. */
export async function notifyMerchantReviewCreated(input: {
  shopId: string;
  branchId?: string;
  customerName: string;
  rating: number;
  body: string;
  reviewId: string;
}): Promise<void> {
  const stars = '★'.repeat(Math.max(1, Math.min(5, input.rating)));
  const preview = input.body.slice(0, 100);

  await pushWashCenterNotification({
    shopId: input.shopId,
    branchId: input.branchId,
    kind: 'new_review',
    title: 'New customer review',
    body: `${input.customerName} · ${stars} · ${preview}`,
    reviewId: input.reviewId,
  });

  await sendShopPushForReview({
    shopId: input.shopId,
    customerName: input.customerName,
    rating: input.rating,
    reviewId: input.reviewId,
  });
}

async function sendOwnerBookingPush(booking: Booking): Promise<void> {
  const when = new Date(booking.scheduledAt);
  const whenEn = when.toLocaleString('en-EG');
  const whenAr = when.toLocaleString('ar-EG');
  await sendShopPushForBooking({
    shopId: booking.shopId,
    serviceLabelEn: shopTypeLabel(booking.shopType, 'en'),
    serviceLabelAr: shopTypeLabel(booking.shopType, 'ar'),
    customerPhone: booking.customerPhone,
    whenEn,
    whenAr,
    bookingId: booking.id,
  });
}
