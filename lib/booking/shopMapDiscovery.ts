import type { RealtimeChannel } from '@supabase/supabase-js';

import { listShopsByType } from '@/lib/booking/catalogRepository';
import type { ShopType } from '@/lib/booking/types';
import { getSupabase } from '@/lib/supabase/client';

/** Expanded radius for map QA — shows newly saved branch pins across Greater Cairo. */
export const MAP_DISCOVERY_RADIUS_KM = 500;

export type ShopMapPin = {
  id: string;
  pinId: string;
  branchId?: string;
  name: string;
  nameAr: string;
  type: ShopType;
  latitude: number;
  longitude: number;
  address: string;
  addressAr: string;
};

type ShopMapRow = {
  id: string;
  name: string;
  name_ar: string;
  type: ShopType;
  latitude: number | null;
  longitude: number | null;
  address: string;
  address_ar: string;
};

type BranchMapRow = {
  id: string;
  shop_id: string;
  latitude: number | null;
  longitude: number | null;
  name: string | null;
  name_ar: string | null;
  address: string | null;
  address_ar: string | null;
  profile_name: string | null;
  profile_name_ar: string | null;
  shops: {
    id: string;
    name: string;
    name_ar: string;
    type: ShopType;
    address: string;
    address_ar: string;
    is_active: boolean;
  };
};

type NearbyListingRow = {
  shop_id: string;
  branch_id: string | null;
  branch_slug: string | null;
  listing_name: string;
  listing_name_ar: string;
  listing_address: string;
  listing_address_ar: string;
  latitude: number;
  longitude: number;
  shop_type: ShopType;
};

function hasValidCoordinates(latitude: number | null | undefined, longitude: number | null | undefined): boolean {
  return (
    latitude != null &&
    longitude != null &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)
  );
}

function toShopMapPin(input: {
  shopId: string;
  branchId?: string | null;
  name: string;
  nameAr: string;
  type: ShopType;
  latitude: number;
  longitude: number;
  address: string;
  addressAr: string;
}): ShopMapPin {
  const pinId = input.branchId ? `${input.shopId}:${input.branchId}` : input.shopId;
  return {
    id: input.shopId,
    pinId,
    branchId: input.branchId ?? undefined,
    name: input.name,
    nameAr: input.nameAr,
    type: input.type,
    latitude: input.latitude,
    longitude: input.longitude,
    address: input.address,
    addressAr: input.addressAr,
  };
}

function mapShopMapRow(row: ShopMapRow): ShopMapPin | null {
  if (!hasValidCoordinates(row.latitude, row.longitude)) return null;
  return toShopMapPin({
    shopId: row.id,
    name: row.name,
    nameAr: row.name_ar,
    type: row.type,
    latitude: row.latitude as number,
    longitude: row.longitude as number,
    address: row.address,
    addressAr: row.address_ar,
  });
}

function mapBranchMapRow(row: BranchMapRow): ShopMapPin | null {
  if (!row.shops?.is_active || !hasValidCoordinates(row.latitude, row.longitude)) return null;
  return toShopMapPin({
    shopId: row.shop_id,
    branchId: row.id,
    name: row.profile_name?.trim() || row.name?.trim() || row.shops.name,
    nameAr: row.profile_name_ar?.trim() || row.name_ar?.trim() || row.shops.name_ar,
    type: row.shops.type,
    latitude: row.latitude as number,
    longitude: row.longitude as number,
    address: row.address?.trim() || row.shops.address,
    addressAr: row.address_ar?.trim() || row.shops.address_ar,
  });
}

function mapNearbyListingRow(row: NearbyListingRow): ShopMapPin | null {
  if (!hasValidCoordinates(row.latitude, row.longitude)) return null;
  return toShopMapPin({
    shopId: row.shop_id,
    branchId: row.branch_id,
    name: row.listing_name,
    nameAr: row.listing_name_ar,
    type: row.shop_type,
    latitude: row.latitude,
    longitude: row.longitude,
    address: row.listing_address,
    addressAr: row.listing_address_ar,
  });
}

/** Offline / cached catalog fallback — same type + coordinate rules as Supabase fetch. */
export function listCatalogShopsForMap(type: ShopType): ShopMapPin[] {
  return listShopsByType(type)
    .filter((shop) => hasValidCoordinates(shop.latitude, shop.longitude))
    .map((shop) =>
      toShopMapPin({
        shopId: shop.id,
        name: shop.name,
        nameAr: shop.nameAr,
        type: shop.type,
        latitude: shop.latitude,
        longitude: shop.longitude,
        address: shop.address,
        addressAr: shop.addressAr,
      }),
    );
}

async function fetchWashBranchPinsFromSupabase(): Promise<ShopMapPin[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('shop_branches')
    .select(
      'id, shop_id, latitude, longitude, name, name_ar, address, address_ar, profile_name, profile_name_ar, shops!inner(id, name, name_ar, type, address, address_ar, is_active)',
    )
    .eq('is_active', true)
    .eq('shops.type', 'wash')
    .eq('shops.is_active', true)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);

  if (error) {
    console.warn('fetchWashBranchPinsFromSupabase failed:', error.message);
    return [];
  }

  return ((data ?? []) as unknown as BranchMapRow[])
    .map(mapBranchMapRow)
    .filter((row): row is ShopMapPin => !!row);
}

async function fetchShopsTablePinsFromSupabase(type: ShopType): Promise<ShopMapPin[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('shops')
    .select('id, name, name_ar, type, latitude, longitude, address, address_ar')
    .eq('type', type)
    .eq('is_active', true)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .order('name');

  if (error) {
    console.warn('fetchShopsTablePinsFromSupabase failed:', error.message);
    return [];
  }

  return ((data ?? []) as ShopMapRow[])
    .map(mapShopMapRow)
    .filter((row): row is ShopMapPin => !!row);
}

async function fetchMapPinsViaPostgis(
  type: ShopType,
  options?: { centerLat?: number | null; centerLng?: number | null; radiusKm?: number },
): Promise<ShopMapPin[] | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  if (type !== 'wash' && type !== 'maintenance') return null;

  const { data, error } = await supabase.rpc('find_nearby_listings', {
    p_lat: options?.centerLat ?? null,
    p_lng: options?.centerLng ?? null,
    p_type: type,
    p_radius_km: options?.radiusKm ?? MAP_DISCOVERY_RADIUS_KM,
    p_limit: 250,
  });

  if (error) {
    console.warn('find_nearby_listings failed:', error.message);
    return null;
  }

  return ((data ?? []) as NearbyListingRow[])
    .map(mapNearbyListingRow)
    .filter((row): row is ShopMapPin => !!row);
}

/**
 * Fetch registered merchants for inline map markers.
 * Wash pins come from branch GPS (owner-set); other categories use shop-level GPS.
 */
export async function fetchRegisteredShopsForMap(
  type: ShopType,
  options?: { centerLat?: number | null; centerLng?: number | null; radiusKm?: number },
): Promise<ShopMapPin[]> {
  const postgisRows = await fetchMapPinsViaPostgis(type, options);
  if (postgisRows !== null) return postgisRows;

  const supabase = getSupabase();
  if (!supabase) {
    return listCatalogShopsForMap(type);
  }

  if (type === 'wash') {
    const branchRows = await fetchWashBranchPinsFromSupabase();
    if (branchRows.length) return branchRows;
  }

  const shopRows = await fetchShopsTablePinsFromSupabase(type);
  if (shopRows.length) return shopRows;

  return listCatalogShopsForMap(type);
}

const activeShopMapChannels = new Map<string, RealtimeChannel>();

/** Re-fetch map pins when shop or branch GPS rows change. */
export function subscribeRegisteredShopsMapRealtime(onChange: () => void): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => {};

  const channelName = 'public:shops-branches:map-discovery';
  const existing = activeShopMapChannels.get(channelName);
  if (existing) {
    void supabase.removeChannel(existing);
    activeShopMapChannels.delete(channelName);
  }

  const channel = supabase
    .channel(channelName)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shops' }, () => {
      onChange();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shop_branches' }, () => {
      onChange();
    })
    .subscribe();

  activeShopMapChannels.set(channelName, channel);

  return () => {
    const tracked = activeShopMapChannels.get(channelName);
    if (tracked) {
      void supabase.removeChannel(tracked);
      activeShopMapChannels.delete(channelName);
    }
  };
}
