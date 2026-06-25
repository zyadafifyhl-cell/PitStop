import type { Area, Shop, ShopType } from '@/lib/booking/types';
import { getSupabase } from '@/lib/supabase/client';

type AreaRow = {
  id: string;
  name: string;
  name_ar: string;
  city: string;
  city_ar: string;
};

type ShopRow = {
  id: string;
  name: string;
  name_ar: string;
  type: ShopType;
  area_id: string;
  address: string;
  address_ar: string;
  phone: string;
  latitude: number;
  longitude: number;
  owner_email: string;
  rating: number | string | null;
};

let areasCache: Area[] = [];
let shopsCache: Shop[] = [];
let catalogReady = false;
let loadPromise: Promise<void> | null = null;

function mapAreaRow(row: AreaRow): Area {
  return {
    id: row.id,
    name: row.name,
    nameAr: row.name_ar,
    city: row.city,
    cityAr: row.city_ar,
  };
}

function mapShopRow(row: ShopRow): Shop {
  return {
    id: row.id,
    name: row.name,
    nameAr: row.name_ar,
    type: row.type,
    areaId: row.area_id,
    address: row.address,
    addressAr: row.address_ar,
    phone: row.phone,
    latitude: row.latitude,
    longitude: row.longitude,
    ownerEmail: row.owner_email,
    rating: row.rating != null ? Number(row.rating) : undefined,
  };
}

export function isCatalogReady(): boolean {
  return catalogReady;
}

export function listAreas(): Area[] {
  return areasCache.slice();
}

export function getAreaById(id: string): Area | undefined {
  return areasCache.find((area) => area.id === id);
}

export function listAreasForServiceType(
  type: ShopType,
  hasShopsInArea: (areaId: string) => boolean,
): Area[] {
  return areasCache.filter((area) => hasShopsInArea(area.id));
}

export function getShopById(id: string): Shop | undefined {
  return shopsCache.find((shop) => shop.id === id);
}

export function getShopByOwnerEmail(email: string): Shop | undefined {
  const normalized = email.trim().toLowerCase();
  return shopsCache.find((shop) => shop.ownerEmail.toLowerCase() === normalized);
}

/** Fast owner check without waiting for the full catalog cache. */
export async function isShopOwnerEmailRemote(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  const cached = getShopByOwnerEmail(normalized);
  if (cached) return true;
  const supabase = getSupabase();
  if (!supabase) return false;
  const { data, error } = await supabase
    .from('shops')
    .select('id')
    .eq('owner_email', normalized)
    .maybeSingle();
  if (error) {
    console.warn('Failed to check shop owner email:', error.message);
    return false;
  }
  return !!data;
}

export function listShopsByType(type: ShopType): Shop[] {
  return shopsCache.filter((shop) => shop.type === type);
}

export function listShopsByTypeAndArea(type: ShopType, areaId: string): Shop[] {
  return shopsCache.filter((shop) => shop.type === type && shop.areaId === areaId);
}

export function countShopsByTypeAndArea(type: ShopType, areaId: string): number {
  return listShopsByTypeAndArea(type, areaId).length;
}

export function listAreasWithShops(type: ShopType): string[] {
  const ids = new Set<string>();
  for (const shop of shopsCache) {
    if (shop.type === type) ids.add(shop.areaId);
  }
  return [...ids];
}

export async function refreshCatalog(): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const supabase = getSupabase();
    if (!supabase) {
      areasCache = [];
      shopsCache = [];
      catalogReady = true;
      return;
    }

    const [areasRes, shopsRes] = await Promise.all([
      supabase.from('areas').select('*').order('name'),
      supabase.from('shops').select('*').order('name'),
    ]);

    if (areasRes.error) {
      console.warn('Failed to load areas from Supabase:', areasRes.error.message);
      areasCache = [];
    } else {
      areasCache = ((areasRes.data ?? []) as AreaRow[]).map(mapAreaRow);
    }

    if (shopsRes.error) {
      console.warn('Failed to load shops from Supabase:', shopsRes.error.message);
      shopsCache = [];
    } else {
      shopsCache = ((shopsRes.data ?? []) as ShopRow[]).map(mapShopRow);
    }

    catalogReady = true;
  })();

  try {
    await loadPromise;
  } finally {
    loadPromise = null;
  }
}
