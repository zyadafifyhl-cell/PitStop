import { Linking, Platform } from 'react-native';

import { SUPPORT } from '@/constants/support';
import type { Shop } from '@/lib/booking/types';

export async function openPhone(phoneE164: string): Promise<void> {
  const url = `tel:${phoneE164}`;
  const ok = await Linking.canOpenURL(url);
  if (!ok) throw new Error('Phone not supported');
  await Linking.openURL(url);
}

export async function openSupportPhone(): Promise<void> {
  await openPhone(SUPPORT.phoneE164);
}

export async function openSupportEmail(subject?: string, body?: string): Promise<void> {
  const q: string[] = [];
  if (subject) q.push(`subject=${encodeURIComponent(subject)}`);
  if (body) q.push(`body=${encodeURIComponent(body)}`);
  const url = `mailto:${SUPPORT.email}${q.length ? `?${q.join('&')}` : ''}`;
  await Linking.openURL(url);
}

export async function openSupportWhatsApp(message?: string): Promise<void> {
  const text = message ? `?text=${encodeURIComponent(message)}` : '';
  const url = `https://wa.me/${SUPPORT.whatsAppE164}${text}`;
  await Linking.openURL(url);
}

export async function openShopInMaps(shop: Shop, locale: 'en' | 'ar'): Promise<void> {
  const label = encodeURIComponent(locale === 'ar' ? shop.nameAr : shop.name);
  const { latitude, longitude } = shop;
  const query = `${latitude},${longitude}`;

  const url =
    Platform.OS === 'ios'
      ? `maps:0,0?q=${query}(${label})`
      : Platform.OS === 'android'
        ? `geo:${query}?q=${query}(${label})`
        : `https://www.google.com/maps/search/?api=1&query=${query}`;

  await Linking.openURL(url);
}

/** Opens Google Maps showing all shops of a type (search near Cairo as fallback center). */
export async function openAllShopsInMaps(
  shops: Shop[],
  serviceLabel: string,
  locale: 'en' | 'ar',
): Promise<void> {
  if (shops.length === 0) return;
  if (shops.length === 1) {
    await openShopInMaps(shops[0], locale);
    return;
  }
  const first = shops[0];
  const label = encodeURIComponent(serviceLabel);
  const url = `https://www.google.com/maps/search/${label}/@${first.latitude},${first.longitude},12z`;
  await Linking.openURL(url);
}

export function formatPhoneDisplay(phoneE164: string): string {
  if (phoneE164.startsWith('+20')) return `0${phoneE164.slice(3)}`;
  return phoneE164;
}
