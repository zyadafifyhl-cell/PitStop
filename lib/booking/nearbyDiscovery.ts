import { listShopsSortedByDistance, type ShopWithDistance } from '@/lib/booking/nearby';
import type { ShopType } from '@/lib/booking/types';
import { listWashBranchesSortedByDistance, type WashBranchListing } from '@/lib/booking/washBranchNearby';

export const DISCOVERABLE_SHOP_TYPES = ['wash', 'maintenance'] as const;
export type DiscoverableShopType = (typeof DISCOVERABLE_SHOP_TYPES)[number];

export type DiscoverableListing = ShopWithDistance | WashBranchListing;

export function isDiscoverableShopType(type: ShopType | undefined): type is DiscoverableShopType {
  return type === 'wash' || type === 'maintenance';
}

/** Active wash branches or maintenance shops from remote DB, sorted closest-first. */
export async function listDiscoverableSortedByDistance(
  type: DiscoverableShopType,
  userLat: number | null,
  userLng: number | null,
): Promise<DiscoverableListing[]> {
  if (type === 'wash') {
    return listWashBranchesSortedByDistance(userLat, userLng);
  }
  return listShopsSortedByDistance('maintenance', userLat, userLng);
}

export function listingMapLabel(listing: DiscoverableListing, locale: 'en' | 'ar'): string {
  return locale === 'ar' ? listing.nameAr : listing.name;
}
