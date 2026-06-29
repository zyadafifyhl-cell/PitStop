import { Linking } from 'react-native';

import { SUPPORT } from '@/constants/support';
import { EL_REHAB_FALLBACK_COORDS } from '@/lib/booking/nearby';
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
  await openEmailTo(SUPPORT.email, subject, body);
}

export async function openEmailTo(to: string, subject?: string, body?: string): Promise<void> {
  const q: string[] = [];
  if (subject) q.push(`subject=${encodeURIComponent(subject)}`);
  if (body) q.push(`body=${encodeURIComponent(body)}`);
  const url = `mailto:${to}${q.length ? `?${q.join('&')}` : ''}`;
  await Linking.openURL(url);
}

export async function openSupportWhatsApp(message?: string): Promise<void> {
  const text = message ? `?text=${encodeURIComponent(message)}` : '';
  const url = `https://wa.me/${SUPPORT.whatsAppE164}${text}`;
  await Linking.openURL(url);
}

export async function openShopInMaps(shop: Shop, locale: 'en' | 'ar'): Promise<void> {
  await openMapsAtCoordinates(shop.latitude, shop.longitude, locale === 'ar' ? shop.nameAr : shop.name);
}

export async function openMapsAtCoordinates(
  latitude: number,
  longitude: number,
  label?: string,
): Promise<void> {
  const lat = Number.isFinite(latitude) ? latitude : EL_REHAB_FALLBACK_COORDS.latitude;
  const lng = Number.isFinite(longitude) ? longitude : EL_REHAB_FALLBACK_COORDS.longitude;
  const query = `${lat},${lng}`;
  const url = `https://maps.google.com/?q=${query}`;

  const canOpen = await Linking.canOpenURL(url);
  if (!canOpen) throw new Error('Maps not supported');
  await Linking.openURL(url);
}

/** Opens Google Maps at branch coords; falls back to El Rehab demo pin when missing. */
export async function openBranchDirections(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  label?: string,
): Promise<void> {
  const lat =
    latitude != null && longitude != null && Number.isFinite(latitude) && Number.isFinite(longitude)
      ? latitude
      : EL_REHAB_FALLBACK_COORDS.latitude;
  const lng =
    latitude != null && longitude != null && Number.isFinite(latitude) && Number.isFinite(longitude)
      ? longitude
      : EL_REHAB_FALLBACK_COORDS.longitude;
  await openMapsAtCoordinates(lat, lng, label);
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
