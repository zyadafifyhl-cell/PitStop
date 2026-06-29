import { getShopById } from '@/lib/booking/catalogRepository';
import { DEMO_CUSTOMERS } from '@/lib/booking/customers';
import { pushCustomerNotification } from '@/lib/booking/commerceEvents';
import { sendBookingConfirmationEmail } from '@/lib/booking/sendBookingConfirmationEmail';
import type { Booking, BookingStatus } from '@/lib/booking/types';
import { getSupabase } from '@/lib/supabase/client';

async function resolveCustomerEmail(customerId?: string): Promise<string | undefined> {
  if (!customerId) return undefined;
  const demo = DEMO_CUSTOMERS.find((c) => c.id === customerId);
  if (demo?.email) return demo.email;

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
