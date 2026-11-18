import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { getSupabase } from '@/lib/supabase/client';

function projectId(): string | undefined {
  const easProjectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  return typeof easProjectId === 'string' && easProjectId.trim() ? easProjectId : undefined;
}

/**
 * Saves this device's Expo push token for the signed-in customer. Pushes are sent from the
 * database (send_customer_push), so the token is never readable by shops.
 */
export async function registerCustomerPushToken(input: {
  locale: 'en' | 'ar';
}): Promise<'ok' | 'unsupported' | 'denied' | 'no_session' | 'failed'> {
  if (Platform.OS === 'web') return 'unsupported';
  const supabase = getSupabase();
  if (!supabase) return 'no_session';

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.user?.id) return 'no_session';

    const permission = await Notifications.getPermissionsAsync();
    const finalPermission =
      permission.status === 'granted' ? permission : await Notifications.requestPermissionsAsync();
    if (finalPermission.status !== 'granted') return 'denied';

    const pushToken = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });
    const token = pushToken.data;
    if (!token) return 'failed';

    const { error } = await supabase.from('customer_push_tokens').upsert(
      {
        user_id: sessionData.session.user.id,
        expo_push_token: token,
        locale: input.locale,
        platform: Platform.OS,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,expo_push_token', ignoreDuplicates: false },
    );
    return error ? 'failed' : 'ok';
  } catch {
    return 'failed';
  }
}
