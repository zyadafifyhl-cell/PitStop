import { getShopById, listShopsByType } from '@/lib/booking/catalogRepository';
import { haversineKm, sortShopsByDistance, type ShopWithDistance } from '@/lib/booking/nearby';
import type { Shop, ShopType } from '@/lib/booking/types';
import { getSupabase } from '@/lib/supabase/client';

export type NearbyListingType = 'wash' | 'maintenance';

export type WashBranchListing = ShopWithDistance & {
  branchId: string;
  branchSlug?: string;
  branchLabel?: string;
};

export const NEARBY_DEFAULT_RADIUS_KM = 50;
export const NEARBY_DEFAULT_LIMIT = 100;

type NearbyListingRpcRow = {
  shop_id: string;
  branch_id: string | null;
  branch_slug: string | null;
  listing_name: string;
  listing_name_ar: string;
  listing_address: string;
  listing_address_ar: string;
  listing_phone: string;
  latitude: number;
  longitude: number;
  shop_type: string;
  area_id: string;
  owner_email: string;
  is_premium: boolean;
  distance_km: number | null;
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

function roundDistanceKm(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 1000) / 1000;
}

function mapRpcRowToListing(row: NearbyListingRpcRow): WashBranchListing | ShopWithDistance {
  const base: ShopWithDistance = {
    id: row.shop_id,
    name: row.listing_name,
    nameAr: row.listing_name_ar,
    type: row.shop_type as ShopType,
    areaId: row.area_id,
    address: row.listing_address,
    addressAr: row.listing_address_ar,
    phone: row.listing_phone,
    latitude: row.latitude,
    longitude: row.longitude,
    ownerEmail: row.owner_email,
    isPremium: row.is_premium === true,
    distanceKm: roundDistanceKm(row.distance_km != null ? Number(row.distance_km) : null),
  };

  const catalogShop = getShopById(row.shop_id);
  if (catalogShop?.rating != null && base.rating == null) {
    base.rating = catalogShop.rating;
  }

  if (row.branch_id) {
    return {
      ...base,
      branchId: row.branch_id,
      branchSlug: row.branch_slug ?? 'main',
      branchLabel: row.listing_name,
    };
  }

  return {
    ...base,
    branchId: `${row.shop_id}-main`,
    branchSlug: row.branch_slug ?? 'main',
    branchLabel: row.listing_name,
  };
}

/** PostGIS RPC — returns null when Supabase is unavailable or the RPC fails (caller should fallback). */
export async function findNearbyListingsViaRpc(
  type: NearbyListingType,
  userLat: number | null,
  userLng: number | null,
  options?: { radiusKm?: number; limit?: number },
): Promise<(WashBranchListing | ShopWithDistance)[] | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase.rpc('find_nearby_listings', {
      p_lat: userLat,
      p_lng: userLng,
      p_type: type,
      p_radius_km: options?.radiusKm ?? NEARBY_DEFAULT_RADIUS_KM,
      p_limit: options?.limit ?? NEARBY_DEFAULT_LIMIT,
    });

    if (error || !data) return null;
    return (data as NearbyListingRpcRow[]).map(mapRpcRowToListing);
  } catch {
    return null;
  }
}

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

function sortWashListings(
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

/** Legacy client-side Haversine path — used only when PostGIS RPC is unavailable. */
export async function listWashBranchesSortedByDistanceLegacy(
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
            if (Number.isFinite(shop.latitude) && Number.isFinite(shop.longitude)) {
              listings.push(listingFromShopAndBranch(shop, null));
            }
            continue;
          }
          for (const branch of shopBranches) {
            const lat = branch.latitude ?? shop.latitude;
            const lng = branch.longitude ?? shop.longitude;
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
            listings.push(listingFromShopAndBranch(shop, branch));
          }
        }

        if (listings.length) return sortWashListings(listings, userLat, userLng);
      }
    } catch {
      /* fall through to catalog */
    }
  }

  const shops = listShopsByType('wash');
  const fallback = shops.map((shop) => listingFromShopAndBranch(shop, null));
  return sortWashListings(fallback, userLat, userLng);
}

/** Active wash branches sorted closest-first via PostGIS RPC (legacy fallback when offline). */
export async function listWashBranchesSortedByDistance(
  userLat: number | null,
  userLng: number | null,
): Promise<WashBranchListing[]> {
  const rpcRows = await findNearbyListingsViaRpc('wash', userLat, userLng);
  if (rpcRows !== null) {
    return rpcRows as WashBranchListing[];
  }
  return listWashBranchesSortedByDistanceLegacy(userLat, userLng);
}

/** Legacy maintenance listing path — used only when PostGIS RPC is unavailable. */
export function listMaintenanceShopsSortedByDistanceLegacy(
  userLat: number | null,
  userLng: number | null,
): ShopWithDistance[] {
  return sortShopsByDistance(listShopsByType('maintenance'), userLat, userLng);
}
