import type { RealtimeChannel } from '@supabase/supabase-js';

import { listShopsByType } from '@/lib/booking/catalogRepository';
import type { ShopType } from '@/lib/booking/types';
import { getSupabase } from '@/lib/supabase/client';

export type ShopMapPin = {
  id: string;
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

function hasValidCoordinates(latitude: number | null | undefined, longitude: number | null | undefined): boolean {
  return (
    latitude != null &&
    longitude != null &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)
  );
}

function mapShopMapRow(row: ShopMapRow): ShopMapPin | null {
  if (!hasValidCoordinates(row.latitude, row.longitude)) return null;
  return {
    id: row.id,
    name: row.name,
    nameAr: row.name_ar,
    type: row.type,
    latitude: row.latitude as number,
    longitude: row.longitude as number,
    address: row.address,
    addressAr: row.address_ar,
  };
}

/** Offline / cached catalog fallback — same type + coordinate rules as Supabase fetch. */
export function listCatalogShopsForMap(type: ShopType): ShopMapPin[] {
  return listShopsByType(type)
    .filter((shop) => hasValidCoordinates(shop.latitude, shop.longitude))
    .map((shop) => ({
      id: shop.id,
      name: shop.name,
      nameAr: shop.nameAr,
      type: shop.type,
      latitude: shop.latitude,
      longitude: shop.longitude,
      address: shop.address,
      addressAr: shop.addressAr,
    }));
}

/**
 * Fetch registered merchants for inline map markers.
 * Filters by active route category (e.g. wash) and requires owner-set GPS on `shops`.
 */
export async function fetchRegisteredShopsForMap(type: ShopType): Promise<ShopMapPin[]> {
  const supabase = getSupabase();
  if (!supabase) {
    return listCatalogShopsForMap(type);
  }

  const { data, error } = await supabase
    .from('shops')
    .select('id, name, name_ar, type, latitude, longitude, address, address_ar')
    .eq('type', type)
    .eq('is_active', true)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .order('name');

  if (error) {
    console.warn('fetchRegisteredShopsForMap failed:', error.message);
    return listCatalogShopsForMap(type);
  }

  return ((data ?? []) as ShopMapRow[])
    .map(mapShopMapRow)
    .filter((row): row is ShopMapPin => !!row);
}

const activeShopMapChannels = new Map<string, RealtimeChannel>();

/** Re-fetch map pins when any shop row changes (e.g. owner GPS save). */
export function subscribeRegisteredShopsMapRealtime(onChange: () => void): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => {};

  const channelName = 'public:shops:map-discovery';
  const existing = activeShopMapChannels.get(channelName);
  if (existing) {
    void supabase.removeChannel(existing);
    activeShopMapChannels.delete(channelName);
  }

  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'shops' },
      () => {
        onChange();
      },
    )
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
