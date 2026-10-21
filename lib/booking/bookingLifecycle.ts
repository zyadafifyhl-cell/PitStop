import { getShopById } from '@/lib/booking/catalogRepository';
import { pushCustomerNotification } from '@/lib/booking/commerceEvents';
import { sendBookingConfirmationEmail } from '@/lib/booking/sendBookingConfirmationEmail';
import { recordMerchantLoyaltyPointsOnDone } from '@/lib/booking/merchantLoyaltyRepository';
import { recordWashBookingDone } from '@/lib/booking/loyaltyStampsStorage';
import type { Booking, BookingStatus } from '@/lib/booking/types';
import { getSupabase } from '@/lib/supabase/client';

async function resolveCustomerEmail(customerId?: string): Promise<string | undefined> {
  if (!customerId) return undefined;
  const supabase = getSupabase();
  if (!supabase) return undefined;
  const { data } = await supabase.from('users').select('email').eq('id', customerId).maybeSingle();
  return data?.email ?? undefined;
}

export async function handleBookingConfirmed(params: {
  booking: Booking;
  previousStatus?: BookingStatus;
  locale?: 'en' | 'ar';
  customerEmail?: string;
  serviceLines?: string[];
}): Promise<void> {
  const { booking, previousStatus } = params;
  if (booking.status !== 'confirmed' || previousStatus === 'confirmed') return;
  if (booking.bookingType === 'walk_in') return;

  await pushCustomerNotification({
    customerId: booking.customerId,
    customerPhone: booking.customerPhone,
    kind: 'booking_approved',
    shopId: booking.shopId,
    bookingId: booking.id,
    scheduledAt: booking.scheduledAt,
    highPriority: true,
  });

  const shop = getShopById(booking.shopId);
  const locale = params.locale ?? 'en';
  const shopDisplayName =
    locale === 'ar'
      ? shop?.nameAr ?? booking.shopId
      : shop?.name ?? booking.shopId;

  const customerEmail = params.customerEmail ?? (await resolveCustomerEmail(booking.customerId));
  const serviceLines = params.serviceLines ?? (
    booking.serviceName ? [booking.serviceName] : undefined
  );

  await sendBookingConfirmationEmail({
    booking,
    locale,
    customerEmail,
    shopDisplayName,
    serviceLines,
  });
}

export async function notifyCustomerCarReady(booking: Booking): Promise<void> {
  if (!booking.customerId && !booking.customerPhone) return;
  const shop = getShopById(booking.shopId);
  const shopName = shop?.name ?? booking.shopId;
  await pushCustomerNotification({
    customerId: booking.customerId,
    customerPhone: booking.customerPhone || '',
    kind: 'booking_ready',
    shopId: booking.shopId,
    bookingId: booking.id,
    scheduledAt: booking.scheduledAt,
    highPriority: true,
    message: `Your car is ready for pickup at ${shopName}!`,
  });
}

export async function handleBookingCompleted(
  booking: Booking,
  previousStatus?: BookingStatus,
): Promise<void> {
  if (booking.status !== 'done' || previousStatus === 'done') return;
  try {
    await recordWashBookingDone(booking, previousStatus);
  } catch (error) {
    console.warn('Wash loyalty stamp sync failed (non-blocking):', error);
  }
  try {
    await recordMerchantLoyaltyPointsOnDone(booking, previousStatus);
  } catch (error) {
    console.warn('Merchant loyalty points sync failed (non-blocking):', error);
  }
}
