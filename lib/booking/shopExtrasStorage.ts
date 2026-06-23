import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ShopExtras, ShopOffer } from '@/lib/booking/types';

const SHOP_EXTRAS_KEY = '@pitstop/shop-extras/v1';
type ExtrasMap = Record<string, ShopExtras>;

function nowIso(): string {
  return new Date().toISOString();
}

function id(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function readMap(): Promise<ExtrasMap> {
  try {
    const raw = await AsyncStorage.getItem(SHOP_EXTRAS_KEY);
    const parsed = raw ? (JSON.parse(raw) as ExtrasMap) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeMap(map: ExtrasMap): Promise<void> {
  await AsyncStorage.setItem(SHOP_EXTRAS_KEY, JSON.stringify(map));
}

function normalizeExtras(shopId: string, row?: ShopExtras): ShopExtras {
  return {
    shopId,
    imageUrls: row?.imageUrls ?? [],
    servicePriceEgp: row?.servicePriceEgp,
    offers: (row?.offers ?? []).filter((offer) => offer.active && new Date(offer.validUntil).getTime() > Date.now()),
    updatedAt: row?.updatedAt ?? nowIso(),
  };
}

export async function getShopExtras(shopId: string): Promise<ShopExtras> {
  const map = await readMap();
  const normalized = normalizeExtras(shopId, map[shopId]);
  if (JSON.stringify(map[shopId]) !== JSON.stringify(normalized)) {
    map[shopId] = normalized;
    await writeMap(map);
  }
  return normalized;
}

export async function addShopImage(shopId: string, imageUrl: string): Promise<ShopExtras> {
  const clean = imageUrl.trim();
  if (!clean) return getShopExtras(shopId);
  const map = await readMap();
  const row = normalizeExtras(shopId, map[shopId]);
  row.imageUrls = [clean, ...row.imageUrls.filter((x) => x !== clean)].slice(0, 8);
  row.updatedAt = nowIso();
  map[shopId] = row;
  await writeMap(map);
  return row;
}

export async function removeShopImage(shopId: string, imageUrl: string): Promise<ShopExtras> {
  const map = await readMap();
  const row = normalizeExtras(shopId, map[shopId]);
  row.imageUrls = row.imageUrls.filter((x) => x !== imageUrl);
  row.updatedAt = nowIso();
  map[shopId] = row;
  await writeMap(map);
  return row;
}

export async function setShopServicePrice(shopId: string, servicePriceEgp: number): Promise<ShopExtras> {
  const map = await readMap();
  const row = normalizeExtras(shopId, map[shopId]);
  row.servicePriceEgp = Math.max(0, Math.round(servicePriceEgp * 100) / 100);
  row.updatedAt = nowIso();
  map[shopId] = row;
  await writeMap(map);
  return row;
}

export async function addShopOffer(input: {
  shopId: string;
  title: string;
  titleAr?: string;
  validDays: number;
}): Promise<ShopExtras> {
  const map = await readMap();
  const row = normalizeExtras(input.shopId, map[input.shopId]);
  const validDays = Math.max(1, Math.floor(input.validDays));
  const validUntil = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toISOString();
  const offer: ShopOffer = {
    id: id('offer'),
    title: input.title.trim(),
    titleAr: input.titleAr?.trim() || undefined,
    validUntil,
    active: true,
    createdAt: nowIso(),
  };
  row.offers = [offer, ...row.offers].slice(0, 20);
  row.updatedAt = nowIso();
  map[input.shopId] = row;
  await writeMap(map);
  return row;
}

export async function cancelShopOffer(shopId: string, offerId: string): Promise<ShopExtras> {
  const map = await readMap();
  const row = normalizeExtras(shopId, map[shopId]);
  row.offers = row.offers.map((offer) =>
    offer.id === offerId ? { ...offer, active: false } : offer,
  ).filter((offer) => offer.active);
  row.updatedAt = nowIso();
  map[shopId] = row;
  await writeMap(map);
  return row;
}
