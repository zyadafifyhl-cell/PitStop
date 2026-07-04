import AsyncStorage from '@react-native-async-storage/async-storage';

import { normalizePhoneE164 } from '@/lib/phone';
import { tabAuthStorage } from '@/lib/storage/webTabAuthStorage';
import { getSupabase } from '@/lib/supabase/client';

const SESSION_KEY = '@pitstop/customer-session';
const GUEST_KEY = '@pitstop/guest-session';

/** Remove customer-scoped local caches after account deletion. */
export async function purgeCustomerLocalData(customerId: string, phone?: string): Promise<void> {
  const keys = [
    SESSION_KEY,
    GUEST_KEY,
    '@pitstop/customer-vehicles/v1',
    '@pitstop/active-vehicle/v1',
    `@pitstop/car-profile/${customerId}`,
    `@pitstop/favorites/${customerId}`,
    '@pitstop/merchant_loyalty/v1',
    '@pitstop/loyalty_stamps',
    '@pitstop/customer-notifications/v1',
    '@pitstop/customer-notif-seen/v1',
    '@pitstop/customer-invoices/v1',
    '@pitstop/booking-confirmation-emails/v1',
    '@pitstop/booking-reminders/v1',
    '@pitstop/recent-locations/v1',
    '@pitstop/community-posts/v1',
    '@pitstop/community-comments/v1',
    '@pitstop/community-post-likes/v1',
    '@pitstop/community-comment-likes/v1',
    '@pitstop/driver-network/v1',
  ];

  await tabAuthStorage.multiRemove(keys);

  try {
    const bookingsRaw = await AsyncStorage.getItem('@pitstop/bookings/v1');
    if (bookingsRaw) {
      const parsed = JSON.parse(bookingsRaw) as Array<{ customerId?: string; customerPhone?: string }>;
      if (Array.isArray(parsed)) {
        const filtered = parsed.filter((row) => {
          if (row.customerId && row.customerId === customerId) return false;
          if (phone && row.customerPhone === phone) return false;
          return true;
        });
        await AsyncStorage.setItem('@pitstop/bookings/v1', JSON.stringify(filtered));
      }
    }
  } catch {
    /* ignore */
  }
}

export type UpdateProfileResult = 'ok' | 'invalid' | 'not_configured' | 'email_taken';
export type DeleteAccountResult = 'ok' | 'invalid' | 'not_configured';

export async function updateCustomerProfile(input: {
  userId: string;
  name: string;
  email: string;
  phone: string;
  password?: string;
}): Promise<UpdateProfileResult> {
  const supabase = getSupabase();
  if (!supabase) return 'not_configured';

  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const phone = normalizePhoneE164(input.phone);
  if (!name || !email.includes('@') || !phone) return 'invalid';

  const authPayload: {
    email?: string;
    password?: string;
    data: { name: string; phone: string };
  } = {
    data: { name, phone },
  };
  if (email) authPayload.email = email;
  const nextPassword = input.password?.trim();
  if (nextPassword) authPayload.password = nextPassword;

  const { error: authError } = await supabase.auth.updateUser(authPayload);
  if (authError) {
    const message = authError.message.toLowerCase();
    if (message.includes('already') || message.includes('registered')) return 'email_taken';
    return 'invalid';
  }

  const { error: profileError } = await supabase
    .from('users')
    .update({
      full_name: name,
      phone,
      email,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.userId);

  if (profileError) return 'invalid';
  return 'ok';
}

export async function deleteCustomerAccountRemote(): Promise<DeleteAccountResult> {
  const supabase = getSupabase();
  if (!supabase) return 'not_configured';

  const { error } = await supabase.rpc('customer_delete_own_account');
  if (error) return 'invalid';
  return 'ok';
}
