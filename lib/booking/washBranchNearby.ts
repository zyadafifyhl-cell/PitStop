import { getShopById, listShopsByType } from '@/lib/booking/catalogRepository';
import { haversineKm, type ShopWithDistance } from '@/lib/booking/nearby';
import type { Shop } from '@/lib/booking/types';
import { getSupabase } from '@/lib/supabase/client';

export type WashBranchListing = ShopWithDistance & {
  branchId: string;
  branchSlug?: string;
  branchLabel?: string;
};

type BranchRow = {
  id: string;
  slug: string;
  name: string;
  name_ar: string | null;
  address: string | null;
  address_ar: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  shop_id: string;
};

function listingFromShopAndBranch(shop: Shop, branch: BranchRow | null): Omit<WashBranchListing, 'distanceKm'> {
  const lat = branch?.latitude ?? shop.latitude;
  const lng = branch?.longitude ?? shop.longitude;
  return {
    ...shop,
    latitude: lat,
    longitude: lng,
    name: branch?.name ?? shop.name,
    nameAr: branch?.name_ar ?? shop.nameAr,
    address: branch?.address ?? shop.address,
    addressAr: branch?.address_ar ?? shop.addressAr,
    phone: branch?.phone ?? shop.phone,
    branchId: branch?.id ?? `${shop.id}-main`,
    branchSlug: branch?.slug ?? 'main',
    branchLabel: branch?.name ?? shop.name,
  };
}

function sortListings(
  rows: Omit<WashBranchListing, 'distanceKm'>[],
  userLat: number | null,
  userLng: number | null,
): WashBranchListing[] {
  const withDist: WashBranchListing[] = rows.map((row) => ({
    ...row,
    distanceKm:
      userLat != null && userLng != null
        ? haversineKm(userLat, userLng, row.latitude, row.longitude)
        : null,
  }));

  return withDist.sort((a, b) => {
    if (a.distanceKm == null && b.distanceKm == null) return 0;
    if (a.distanceKm == null) return 1;
    if (b.distanceKm == null) return -1;
    return a.distanceKm - b.distanceKm;
  });
}

/** Active wash branches sorted closest-first (falls back to shop catalog when offline). */
export async function listWashBranchesSortedByDistance(
  userLat: number | null,
  userLng: number | null,
): Promise<WashBranchListing[]> {
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('shop_branches')
        .select('id, slug, name, name_ar, address, address_ar, phone, latitude, longitude, shop_id')
        .eq('is_active', true);

      if (!error && data?.length) {
        const branchRows = data as BranchRow[];
        const shopIds = [...new Set(branchRows.map((row) => row.shop_id))];
        const listings: Omit<WashBranchListing, 'distanceKm'>[] = [];

        for (const shopId of shopIds) {
          const shop = getShopById(shopId);
          if (!shop || shop.type !== 'wash') continue;
          const shopBranches = branchRows.filter((row) => row.shop_id === shopId);
          if (shopBranches.length === 0) {
            listings.push(listingFromShopAndBranch(shop, null));
            continue;
          }
          for (const branch of shopBranches) {
            listings.push(listingFromShopAndBranch(shop, branch));
          }
        }

        if (listings.length) return sortListings(listings, userLat, userLng);
      }
    } catch {
      /* fall through to catalog */
    }
  }

  const shops = listShopsByType('wash');
  const fallback = shops.map((shop) => listingFromShopAndBranch(shop, null));
  return sortListings(fallback, userLat, userLng);
}
