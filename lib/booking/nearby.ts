import type { Shop, ShopType } from '@/lib/booking/types';
import { listShopsByType } from '@/lib/booking/catalogRepository';
import type { Locale } from '@/lib/i18n/strings';

/** El Rehab City demo coordinates — used when branch GPS is missing (simulator QA). */
export const EL_REHAB_FALLBACK_COORDS = {
  latitude: 30.0244,
  longitude: 31.4939,
} as const;

/** Great-circle distance in kilometers (Haversine). */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type ShopWithDistance = Shop & { distanceKm: number | null };

export function sortShopsByDistance(
  shops: Shop[],
  userLat: number | null,
  userLng: number | null,
): ShopWithDistance[] {
  const withDist: ShopWithDistance[] = shops.map((shop) => ({
    ...shop,
    distanceKm:
      userLat != null && userLng != null
        ? haversineKm(userLat, userLng, shop.latitude, shop.longitude)
        : null,
  }));

  return withDist.sort((a, b) => {
    if (a.distanceKm == null && b.distanceKm == null) return 0;
    if (a.distanceKm == null) return 1;
    if (b.distanceKm == null) return -1;
    return a.distanceKm - b.distanceKm;
  });
}

export function listShopsSortedByDistance(
  type: ShopType,
  userLat: number | null,
  userLng: number | null,
): ShopWithDistance[] {
  return sortShopsByDistance(listShopsByType(type), userLat, userLng);
}

export function formatDistance(km: number | null, locale: Locale): string {
  if (km == null) return '—';
  if (km < 1) {
    const m = Math.round(km * 1000);
    return locale === 'ar' ? `${m} م` : `${m} m`;
  }
  return locale === 'ar' ? `${km.toFixed(1)} كم` : `${km.toFixed(1)} km`;
}

/** e.g. "1.2 km away" / "على بعد 1.2 كم" */
export function formatDistanceAway(km: number | null, locale: Locale): string {
  if (km == null) return '—';
  if (km < 1) {
    const m = Math.round(km * 1000);
    return locale === 'ar' ? `على بعد ${m} م` : `${m} m away`;
  }
  return locale === 'ar' ? `على بعد ${km.toFixed(1)} كم` : `${km.toFixed(1)} km away`;
}
