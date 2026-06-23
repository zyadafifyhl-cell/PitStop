import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { getSupabase } from '@/lib/supabase/client';

type Locale = 'en' | 'ar';

type ShopPushTokenRow = {
  shop_id: string;
  owner_email: string;
  expo_push_token: string;
  locale: Locale;
};

function projectId(): string | undefined {
  const easProjectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  return typeof easProjectId === 'string' && easProjectId.trim() ? easProjectId : undefined;
}

async function readShopPushTokens(shopId: string): Promise<ShopPushTokenRow[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('shop_push_tokens')
    .select('shop_id, owner_email, expo_push_token, locale')
    .eq('shop_id', shopId);
  if (error || !data) return [];
  return data as ShopPushTokenRow[];
}

async function postExpoPush(payloads: Array<{ to: string; title: string; body: string; data?: Record<string, string> }>): Promise<void> {
  if (!payloads.length) return;
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(
      payloads.map((item) => ({
        to: item.to,
        sound: 'default',
        title: item.title,
        body: item.body,
        data: item.data ?? {},
      })),
    ),
  }).catch(() => {});
}

function bookingPushText(locale: Locale, input: {
  service: string;
  phone: string;
  when: string;
}): { title: string; body: string } {
  if (locale === 'ar') {
    return {
      title: 'حجز جديد',
      body: `حجز ${input.service} جديد من ${input.phone} في ${input.when}`,
    };
  }
  return {
    title: 'New booking',
    body: `New ${input.service} booking from ${input.phone} at ${input.when}`,
  };
}

function partsPushText(locale: Locale, input: {
  phone: string;
  count: number;
  total: string;
}): { title: string; body: string } {
  if (locale === 'ar') {
    return {
      title: 'طلب قطع غيار جديد',
      body: `طلب جديد من ${input.phone} · ${input.count} قطع · ${input.total}`,
    };
  }
  return {
    title: 'New spare parts order',
    body: `New order from ${input.phone} · ${input.count} items · ${input.total}`,
  };
}

export async function registerOwnerPushToken(input: {
  shopId: string;
  ownerEmail: string;
  locale: Locale;
}): Promise<'ok' | 'unsupported' | 'denied' | 'no_supabase' | 'failed'> {
  if (Platform.OS === 'web') return 'unsupported';
  const supabase = getSupabase();
  if (!supabase) return 'no_supabase';

  try {
    const permission = await Notifications.getPermissionsAsync();
    const finalPermission =
      permission.status === 'granted' ? permission : await Notifications.requestPermissionsAsync();
    if (finalPermission.status !== 'granted') return 'denied';

    const pushToken = await Notifications.getExpoPushTokenAsync({
      projectId: projectId(),
    });
    const token = pushToken.data;
    if (!token) return 'failed';

    const { error } = await supabase.from('shop_push_tokens').upsert(
      {
        shop_id: input.shopId,
        owner_email: input.ownerEmail.toLowerCase(),
        expo_push_token: token,
        locale: input.locale,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'shop_id,expo_push_token',
        ignoreDuplicates: false,
      },
    );
    if (error) return 'failed';
    return 'ok';
  } catch {
    return 'failed';
  }
}

export async function sendShopPushForBooking(input: {
  shopId: string;
  serviceLabelEn: string;
  serviceLabelAr: string;
  customerPhone: string;
  whenEn: string;
  whenAr: string;
  bookingId: string;
}): Promise<void> {
  const tokens = await readShopPushTokens(input.shopId);
  if (!tokens.length) return;

  const payloads = tokens.map((row) => {
    const locale = row.locale === 'ar' ? 'ar' : 'en';
    const text = bookingPushText(locale, {
      service: locale === 'ar' ? input.serviceLabelAr : input.serviceLabelEn,
      phone: input.customerPhone,
      when: locale === 'ar' ? input.whenAr : input.whenEn,
    });
    return {
      to: row.expo_push_token,
      title: text.title,
      body: text.body,
      data: { type: 'service_booking', bookingId: input.bookingId, shopId: input.shopId },
    };
  });
  await postExpoPush(payloads);
}

export async function sendShopPushForPartsOrder(input: {
  shopId: string;
  customerPhone: string;
  partsCount: number;
  totalEn: string;
  totalAr: string;
  orderId: string;
}): Promise<void> {
  const tokens = await readShopPushTokens(input.shopId);
  if (!tokens.length) return;

  const payloads = tokens.map((row) => {
    const locale = row.locale === 'ar' ? 'ar' : 'en';
    const text = partsPushText(locale, {
      phone: input.customerPhone,
      count: input.partsCount,
      total: locale === 'ar' ? input.totalAr : input.totalEn,
    });
    return {
      to: row.expo_push_token,
      title: text.title,
      body: text.body,
      data: { type: 'parts_order', orderId: input.orderId, shopId: input.shopId },
    };
  });
  await postExpoPush(payloads);
}
