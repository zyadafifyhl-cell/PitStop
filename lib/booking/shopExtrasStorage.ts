import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ShopDayHours, ShopExtras, ShopOffer, ShopService } from '@/lib/booking/types';
import { defaultWashServices } from '@/lib/booking/shopSchedule';

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
    profileImageUrl: row?.profileImageUrl,
    profileName: row?.profileName?.trim() || undefined,
    profileNameAr: row?.profileNameAr?.trim() || undefined,
    profileAddress: row?.profileAddress?.trim() || undefined,
    profileAddressAr: row?.profileAddressAr?.trim() || undefined,
    profilePhone: row?.profilePhone?.trim() || undefined,
    profileEmail: row?.profileEmail?.trim() || undefined,
    moreInfo: row?.moreInfo?.trim() || undefined,
    moreInfoAr: row?.moreInfoAr?.trim() || undefined,
    winchEnabled: !!row?.winchEnabled,
    winchPhone: row?.winchPhone?.trim() || undefined,
    imageUrls: row?.imageUrls ?? [],
    servicePriceEgp: row?.servicePriceEgp,
    workOpenTime: row?.workOpenTime?.trim() || undefined,
    workCloseTime: row?.workCloseTime?.trim() || undefined,
    serviceDurationMinutes: row?.serviceDurationMinutes,
    scheduleSavedAt: row?.scheduleSavedAt,
    weeklyHours: row?.weeklyHours,
    services: (row?.services ?? []).filter((service) => service.active),
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

export async function setShopProfileInfo(
  shopId: string,
  input: {
    profileName?: string;
    profileNameAr?: string;
    profileAddress?: string;
    profileAddressAr?: string;
    profilePhone?: string;
    profileEmail?: string;
    moreInfo?: string;
    moreInfoAr?: string;
    winchEnabled?: boolean;
    winchPhone?: string;
  },
): Promise<ShopExtras> {
  const map = await readMap();
  const row = normalizeExtras(shopId, map[shopId]);
  row.profileName = input.profileName?.trim() || undefined;
  row.profileNameAr = input.profileNameAr?.trim() || undefined;
  row.profileAddress = input.profileAddress?.trim() || undefined;
  row.profileAddressAr = input.profileAddressAr?.trim() || undefined;
  row.profilePhone = input.profilePhone?.trim() || undefined;
  row.profileEmail = input.profileEmail?.trim() || undefined;
  row.moreInfo = input.moreInfo?.trim() || undefined;
  row.moreInfoAr = input.moreInfoAr?.trim() || undefined;
  row.winchEnabled = !!input.winchEnabled;
  row.winchPhone = input.winchPhone?.trim() || undefined;
  row.updatedAt = nowIso();
  map[shopId] = row;
  await writeMap(map);
  return row;
}

export async function setShopProfileImage(shopId: string, imageUrl: string): Promise<ShopExtras> {
  const clean = imageUrl.trim();
  if (!clean) return getShopExtras(shopId);
  const map = await readMap();
  const row = normalizeExtras(shopId, map[shopId]);
  row.profileImageUrl = clean;
  row.imageUrls = [clean, ...row.imageUrls.filter((x) => x !== clean)].slice(0, 8);
  row.updatedAt = nowIso();
  map[shopId] = row;
  await writeMap(map);
  return row;
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

export async function setShopSchedule(
  shopId: string,
  input: {
    workOpenTime: string;
    workCloseTime: string;
    serviceDurationMinutes: number;
  },
): Promise<ShopExtras> {
  const map = await readMap();
  const row = normalizeExtras(shopId, map[shopId]);
  row.workOpenTime = input.workOpenTime.trim();
  row.workCloseTime = input.workCloseTime.trim();
  row.serviceDurationMinutes = Math.max(15, Math.min(240, Math.round(input.serviceDurationMinutes)));
  row.scheduleSavedAt = nowIso();
  row.updatedAt = nowIso();
  map[shopId] = row;
  await writeMap(map);
  return row;
}

/** True when owner saved hours — customer booking should use these slots. */
export function shopHasSavedSchedule(extras: ShopExtras | null | undefined): boolean {
  if (!extras) return false;
  if (extras.weeklyHours?.some((row) => !row.closed && row.openTime && row.closeTime)) return true;
  if (extras.scheduleSavedAt) return true;
  return !!(
    extras.workOpenTime?.trim() &&
    extras.workCloseTime?.trim() &&
    extras.serviceDurationMinutes &&
    extras.serviceDurationMinutes >= 15
  );
}

export async function setShopWeeklyHours(shopId: string, weeklyHours: ShopDayHours[]): Promise<ShopExtras> {
  const map = await readMap();
  const row = normalizeExtras(shopId, map[shopId]);
  row.weeklyHours = weeklyHours;
  row.scheduleSavedAt = nowIso();
  row.updatedAt = nowIso();
  map[shopId] = row;
  await writeMap(map);
  return row;
}

export async function setShopServices(shopId: string, services: ShopService[]): Promise<ShopExtras> {
  const map = await readMap();
  const row = normalizeExtras(shopId, map[shopId]);
  row.services = services.map((service) => ({ ...service, active: service.active !== false }));
  row.updatedAt = nowIso();
  map[shopId] = row;
  await writeMap(map);
  return row;
}

export async function ensureDefaultWashServices(shopId: string): Promise<ShopExtras> {
  const row = await getShopExtras(shopId);
  if (row.services?.length) return row;
  return setShopServices(shopId, defaultWashServices());
}

/** All saved shop extras (for home offers aggregation). */
export async function listAllShopExtras(): Promise<ShopExtras[]> {
  const map = await readMap();
  return Object.keys(map).map((shopId) => normalizeExtras(shopId, map[shopId]));
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
