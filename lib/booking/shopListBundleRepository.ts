import AsyncStorage from '@react-native-async-storage/async-storage';

import { listActiveOffersForShops } from '@/lib/booking/offerRepository';
import { getShopAverageRatings, type ShopRatingSummary } from '@/lib/booking/reviewsStorage';
import {
  getShopExtrasCachedBatch,
  persistShopExtrasBatch,
} from '@/lib/booking/shopExtrasStorage';
import type { Shop, ShopExtras, ShopType } from '@/lib/booking/types';
import { fetchDefaultBranchProfilesForShops } from '@/lib/booking/wash/branchRepository';
import type { WashBranch } from '@/lib/booking/wash/types';
import { mergeWashBranchIntoExtras } from '@/lib/booking/wash/washSync';

const SHOP_LIST_BUNDLE_KEY = '@pitstop/shop-list-bundle/v1';
const BUNDLE_TTL_MS = 5 * 60 * 1000;

export type ShopListBundle = {
  extrasByShopId: Record<string, ShopExtras>;
  ratingsByShopId: Record<string, ShopRatingSummary>;
  fetchedAt: string;
};

type BundleCachePayload = Record<string, ShopListBundle>;

const memoryCache = new Map<string, ShopListBundle>();
let storageHydrated = false;
let storageCache: BundleCachePayload = {};

function bundleKey(type: ShopType, areaId: string): string {
  return `${type}:${areaId}`;
}

function isFresh(bundle: ShopListBundle): boolean {
  const age = Date.now() - new Date(bundle.fetchedAt).getTime();
  return Number.isFinite(age) && age >= 0 && age < BUNDLE_TTL_MS;
}

function mergeOffersIntoExtras(
  extrasByShopId: Record<string, ShopExtras>,
  offersByShopId: Record<string, ShopExtras['offers']>,
): Record<string, ShopExtras> {
  const next: Record<string, ShopExtras> = {};
  for (const [shopId, extras] of Object.entries(extrasByShopId)) {
    const offers = offersByShopId[shopId];
    next[shopId] = offers?.length ? { ...extras, offers } : extras;
  }
  return next;
}

async function hydrateStorageCache(): Promise<void> {
  if (storageHydrated) return;
  storageHydrated = true;
  try {
    const raw = await AsyncStorage.getItem(SHOP_LIST_BUNDLE_KEY);
    const parsed = raw ? (JSON.parse(raw) as BundleCachePayload) : {};
    storageCache = parsed && typeof parsed === 'object' ? parsed : {};
    for (const [key, bundle] of Object.entries(storageCache)) {
      memoryCache.set(key, bundle);
    }
  } catch {
    storageCache = {};
  }
}

async function saveBundle(key: string, bundle: ShopListBundle): Promise<void> {
  memoryCache.set(key, bundle);
  storageCache[key] = bundle;
  try {
    await AsyncStorage.setItem(SHOP_LIST_BUNDLE_KEY, JSON.stringify(storageCache));
  } catch {
    /* ignore cache write errors */
  }
}

export function peekShopListBundle(type: ShopType, areaId: string): ShopListBundle | null {
  return memoryCache.get(bundleKey(type, areaId)) ?? null;
}

/** Restore the last saved bundle for instant first paint. */
export async function hydrateShopListBundle(type: ShopType, areaId: string): Promise<ShopListBundle | null> {
  await hydrateStorageCache();
  return memoryCache.get(bundleKey(type, areaId)) ?? null;
}

async function buildShopListBundle(shops: Shop[]): Promise<ShopListBundle> {
  const shopIds = shops.map((shop) => shop.id);
  const washShopIds = shops.filter((shop) => shop.type === 'wash').map((shop) => shop.id);

  const [cachedExtras, offersByShopId, ratingsByShopId, washBranches] = await Promise.all([
    getShopExtrasCachedBatch(shopIds),
    listActiveOffersForShops(shopIds),
    getShopAverageRatings(shopIds),
    washShopIds.length ? fetchDefaultBranchProfilesForShops(washShopIds) : Promise.resolve({} as Record<string, WashBranch>),
  ]);

  let extrasByShopId = mergeOffersIntoExtras(cachedExtras, offersByShopId);

  for (const shopId of washShopIds) {
    const branch = washBranches[shopId];
    if (!branch) continue;
    extrasByShopId[shopId] = mergeWashBranchIntoExtras(extrasByShopId[shopId], branch);
  }

  void persistShopExtrasBatch(extrasByShopId);

  return {
    extrasByShopId,
    ratingsByShopId,
    fetchedAt: new Date().toISOString(),
  };
}

/** Stale-while-revalidate loader for the shops-in-area screen. */
export async function loadShopListBundle(
  shops: Shop[],
  input: { type: ShopType; areaId: string; force?: boolean },
): Promise<ShopListBundle> {
  const key = bundleKey(input.type, input.areaId);
  await hydrateStorageCache();

  const cached = memoryCache.get(key);
  const shopIdsMatch = !!cached && shops.every((shop) => !!cached.extrasByShopId[shop.id]);

  if (cached && shopIdsMatch && !input.force && isFresh(cached)) {
    return cached;
  }

  if (cached && shopIdsMatch && !input.force) {
    void buildShopListBundle(shops)
      .then((fresh) => saveBundle(key, fresh))
      .catch(() => undefined);
    return cached;
  }

  const fresh = await buildShopListBundle(shops);
  await saveBundle(key, fresh);
  return fresh;
}
