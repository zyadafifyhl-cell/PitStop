import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

import { getShopById } from '@/lib/booking/catalogRepository';
import {
  buildBookingConfirmationHtml,
  buildBookingConfirmationPlainText,
  type BookingConfirmationEmailInput,
} from '@/lib/booking/bookingConfirmationEmail';
import type { Booking } from '@/lib/booking/types';
import { getSupabase } from '@/lib/supabase/client';

const HTML_CACHE_KEY = '@pitstop/booking-confirmation-emails/v1';

async function cacheConfirmationHtml(bookingId: string, html: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(HTML_CACHE_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    map[bookingId] = html;
    await AsyncStorage.setItem(HTML_CACHE_KEY, JSON.stringify(map));
  } catch {
    /* ignore cache errors */
  }
}

export async function sendBookingConfirmationEmail(params: {
  booking: Booking;
  locale: 'en' | 'ar';
  customerEmail?: string;
  shopDisplayName?: string;
  serviceLines?: string[];
}): Promise<'edge' | 'mailto' | 'cached' | 'skipped'> {
  const shop = getShopById(params.booking.shopId);
  if (!shop) return 'skipped';

  const shopDisplayName =
    params.shopDisplayName ??
    (params.locale === 'ar' ? shop.nameAr : shop.name);

  const input: BookingConfirmationEmailInput = {
    booking: params.booking,
    shop,
    shopDisplayName,
    locale: params.locale,
    customerEmail: params.customerEmail,
    serviceLines: params.serviceLines,
  };

  const html = buildBookingConfirmationHtml(input);
  const plain = buildBookingConfirmationPlainText(input);
  await cacheConfirmationHtml(params.booking.id, html);

  const supabase = getSupabase();
  if (supabase && params.customerEmail?.includes('@')) {
    try {
      const { error } = await supabase.functions.invoke('send-booking-confirmation', {
        body: {
          to: params.customerEmail,
          subject: plain.subject,
          html,
          text: plain.body,
          bookingId: params.booking.id,
        },
      });
      if (!error) return 'edge';
    } catch {
      /* fall through to mailto */
    }
  }

  if (params.customerEmail?.includes('@') && Platform.OS !== 'web') {
    try {
      const mailto = `mailto:${encodeURIComponent(params.customerEmail)}?subject=${encodeURIComponent(plain.subject)}&body=${encodeURIComponent(plain.body)}`;
      const canOpen = await Linking.canOpenURL(mailto);
      if (canOpen) {
        await Linking.openURL(mailto);
        return 'mailto';
      }
    } catch {
      /* ignore */
    }
  }

  return 'cached';
}
