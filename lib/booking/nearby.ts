import type { Shop, ShopType } from '@/lib/booking/types';
import { listShopsByType } from '@/lib/booking/catalogRepository';

export type ShopWithDistance = Shop & { distanceKm: number | null };

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

export function formatDistance(km: number | null, locale: 'en' | 'ar'): string {
  if (km == null) return locale === 'ar' ? '—' : '—';
  if (km < 1) {
    const m = Math.round(km * 1000);
    return locale === 'ar' ? `${m} م` : `${m} m`;
  }
  return locale === 'ar' ? `${km.toFixed(1)} كم` : `${km.toFixed(1)} km`;
}
