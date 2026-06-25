import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Area, Shop, ShopType } from '@/lib/booking/types';
import { getSupabase } from '@/lib/supabase/client';

const CATALOG_CACHE_KEY = '@pitstop/catalog/v1';
const FETCH_TIMEOUT_MS = 5000;

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
let cacheHydrated = false;

type CatalogCachePayload = {
  areas: Area[];
  shops: Shop[];
  savedAt: string;
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error('catalog_fetch_timeout')), ms);
    }),
  ]);
}

async function loadCatalogFromStorage(): Promise<boolean> {
  if (cacheHydrated) return catalogReady;
  cacheHydrated = true;
  try {
    const raw = await AsyncStorage.getItem(CATALOG_CACHE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as CatalogCachePayload;
    if (!Array.isArray(parsed.areas) || !Array.isArray(parsed.shops)) return false;
    areasCache = parsed.areas;
    shopsCache = parsed.shops;
    catalogReady = true;
    return true;
  } catch {
    return false;
  }
}

async function saveCatalogToStorage(): Promise<void> {
  try {
    const payload: CatalogCachePayload = {
      areas: areasCache,
      shops: shopsCache,
      savedAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore cache write errors */
  }
}

/** Load last saved catalog so screens can render before network finishes. */
export async function hydrateCatalogCache(): Promise<boolean> {
  return loadCatalogFromStorage();
}

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
    await loadCatalogFromStorage();

    const supabase = getSupabase();
    if (!supabase) {
      catalogReady = true;
      return;
    }

    try {
      const [areasRes, shopsRes] = await withTimeout(
        Promise.all([
          supabase.from('areas').select('*').order('name'),
          supabase.from('shops').select('*').order('name'),
        ]),
        FETCH_TIMEOUT_MS,
      );

      if (areasRes.error) {
        console.warn('Failed to load areas from Supabase:', areasRes.error.message);
      } else {
        areasCache = ((areasRes.data ?? []) as AreaRow[]).map(mapAreaRow);
      }

      if (shopsRes.error) {
        console.warn('Failed to load shops from Supabase:', shopsRes.error.message);
      } else {
        shopsCache = ((shopsRes.data ?? []) as ShopRow[]).map(mapShopRow);
      }

      await saveCatalogToStorage();
    } catch (error) {
      console.warn('Catalog refresh failed:', error);
    } finally {
      catalogReady = true;
    }
  })();

  try {
    await loadPromise;
  } finally {
    loadPromise = null;
  }
}

// Start reading persisted catalog as early as possible (before React mounts).
void loadCatalogFromStorage();
