import type { ShopWithDistance } from '@/lib/booking/nearby';
import type { ShopType } from '@/lib/booking/types';
import {
  findNearbyListingsViaRpc,
  listMaintenanceShopsSortedByDistanceLegacy,
  listWashBranchesSortedByDistanceLegacy,
  type WashBranchListing,
} from '@/lib/booking/washBranchNearby';

export const DISCOVERABLE_SHOP_TYPES = ['wash', 'maintenance'] as const;
export type DiscoverableShopType = (typeof DISCOVERABLE_SHOP_TYPES)[number];

export type DiscoverableListing = ShopWithDistance | WashBranchListing;

export type DiscoverableNearbyOptions = {
  radiusKm?: number;
  limit?: number;
};

export function isDiscoverableShopType(type: ShopType | undefined): type is DiscoverableShopType {
  return type === 'wash' || type === 'maintenance';
}

/** Active listings sorted closest-first via PostGIS RPC (legacy Haversine fallback when offline). */
export async function listDiscoverableSortedByDistance(
  type: DiscoverableShopType,
  userLat: number | null,
  userLng: number | null,
  options?: DiscoverableNearbyOptions,
): Promise<DiscoverableListing[]> {
  const rpcRows = await findNearbyListingsViaRpc(type, userLat, userLng, options);
  if (rpcRows !== null) {
    return rpcRows as DiscoverableListing[];
  }

  if (type === 'wash') {
    return listWashBranchesSortedByDistanceLegacy(userLat, userLng);
  }
  return listMaintenanceShopsSortedByDistanceLegacy(userLat, userLng);
}

export function listingMapLabel(listing: DiscoverableListing, locale: 'en' | 'ar'): string {
  return locale === 'ar' ? listing.nameAr : listing.name;
}
