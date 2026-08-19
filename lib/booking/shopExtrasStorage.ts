import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ShopDayHours, ShopExtras, ShopOffer, ShopService, StoreOperatingStatus } from '@/lib/booking/types';
import { isOfferLive } from '@/lib/booking/offerPricing';
import { createShopOffer, deactivateShopOffer, listActiveOffersForShop } from '@/lib/booking/offerRepository';
import { persistImageUri } from '@/lib/media/persistImageUri';
import { getSupabase } from '@/lib/supabase/client';

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

async function upsertShopExtrasRemote(row: ShopExtras): Promise<void> {
  const supabase = getSupabase();
  if (!supabase || !row.shopId) return;
  const { error } = await supabase.from('shop_extras').upsert(
    {
      shop_id: row.shopId,
      payload: row,
      updated_at: row.updatedAt ?? nowIso(),
    },
    { onConflict: 'shop_id' },
  );
  if (error) console.warn('upsertShopExtrasRemote:', error.message);
}

async function fetchShopExtrasRemote(shopId: string): Promise<ShopExtras | null> {
  const supabase = getSupabase();
  if (!supabase || !shopId) return null;
  const { data, error } = await supabase
    .from('shop_extras')
    .select('payload')
    .eq('shop_id', shopId)
    .maybeSingle();
  if (error) {
    console.warn('fetchShopExtrasRemote:', error.message);
    return null;
  }
  if (!data?.payload || typeof data.payload !== 'object') return null;
  return normalizeExtras(shopId, data.payload as ShopExtras);
}

async function persistExtrasRow(shopId: string, row: ShopExtras): Promise<ShopExtras> {
  const next = normalizeExtras(shopId, { ...row, shopId, updatedAt: nowIso() });
  const map = await readMap();
  map[shopId] = next;
  await writeMap(map);
  await upsertShopExtrasRemote(next);
  return next;
}

function normalizeExtras(shopId: string, row?: ShopExtras): ShopExtras {
  const washShopStatus = parseWashShopStatus(row?.washShopStatus);
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
    offers: (row?.offers ?? [])
      .map((offer) => ({
        ...offer,
        offerType: offer.offerType ?? 'percentage',
        discountValue: offer.discountValue ?? offer.discountPercentage ?? 0,
        requiredWashCount: offer.requiredWashCount ?? 0,
        expiresAt: offer.expiresAt ?? offer.endDate ?? offer.validUntil,
        discountPercentage: offer.discountPercentage ?? 0,
        startDate: offer.startDate || offer.createdAt || offer.validUntil,
        endDate: offer.endDate || offer.validUntil,
        validUntil: offer.endDate || offer.validUntil,
      }))
      .filter((offer) => isOfferLive(offer)),
    washShopStatus,
    vacationReturnDate:
      washShopStatus === 'vacation' ? row?.vacationReturnDate?.trim() || undefined : undefined,
    vacationMessage:
      washShopStatus === 'vacation' ? row?.vacationMessage?.trim() || undefined : undefined,
    vacationMessageAr:
      washShopStatus === 'vacation' ? row?.vacationMessageAr?.trim() || undefined : undefined,
    activeBranchId: row?.activeBranchId,
    storeGlobalDiscountPercent:
      row?.storeGlobalDiscountPercent != null
        ? Math.max(0, Math.min(100, Number(row.storeGlobalDiscountPercent)))
        : undefined,
    storeOperatingStatus: parseStoreOperatingStatus(row?.storeOperatingStatus),
    updatedAt: row?.updatedAt ?? nowIso(),
  };
}

function parseWashShopStatus(value: unknown): ShopExtras['washShopStatus'] | undefined {
  if (value === 'open' || value === 'closed' || value === 'busy' || value === 'vacation') return value;
  return undefined;
}

function parseStoreOperatingStatus(value: unknown): StoreOperatingStatus | undefined {
  if (value === 'open' || value === 'closed' || value === 'maintenance') return value;
  return undefined;
}

export async function getShopExtras(shopId: string): Promise<ShopExtras> {
  const map = await readMap();
  const remote = await fetchShopExtrasRemote(shopId);
  const normalized = normalizeExtras(shopId, remote ?? map[shopId]);
  const remoteOffers = await listActiveOffersForShop(shopId);
  if (remoteOffers.length) {
    normalized.offers = remoteOffers;
  }
  if (JSON.stringify(map[shopId]) !== JSON.stringify(normalized)) {
    map[shopId] = normalized;
    await writeMap(map);
  }
  if (remote == null) await upsertShopExtrasRemote(normalized);
  return normalized;
}

/** Local AsyncStorage snapshot only — no network (instant shop profile paint). */
export async function getShopExtrasCached(shopId: string): Promise<ShopExtras> {
  const map = await readMap();
  return normalizeExtras(shopId, map[shopId]);
}

/** Read cached extras for many shops with a single AsyncStorage read. */
export async function getShopExtrasCachedBatch(shopIds: string[]): Promise<Record<string, ShopExtras>> {
  const unique = [...new Set(shopIds.filter(Boolean))];
  const map = await readMap();
  const result: Record<string, ShopExtras> = {};
  for (const shopId of unique) {
    result[shopId] = normalizeExtras(shopId, map[shopId]);
  }
  return result;
}

/** Persist many shop extras rows in one AsyncStorage write. */
export async function persistShopExtrasBatch(rows: Record<string, ShopExtras>): Promise<void> {
  const shopIds = Object.keys(rows);
  if (!shopIds.length) return;
  const map = await readMap();
  let changed = false;
  for (const shopId of shopIds) {
    const next = rows[shopId];
    if (!next) continue;
    if (JSON.stringify(map[shopId]) !== JSON.stringify(next)) {
      map[shopId] = next;
      changed = true;
    }
  }
  if (changed) {
    await writeMap(map);
    await Promise.all(shopIds.map((shopId) => upsertShopExtrasRemote(map[shopId])));
  }
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
  return persistExtrasRow(shopId, row);
}

export async function setShopProfileImage(shopId: string, imageUrl: string): Promise<ShopExtras> {
  const clean = (await persistImageUri(imageUrl)).trim();
  const map = await readMap();
  const row = normalizeExtras(shopId, map[shopId]);
  const previousProfile = row.profileImageUrl;
  row.profileImageUrl = clean || undefined;
  if (previousProfile && previousProfile !== clean) {
    row.imageUrls = row.imageUrls.filter((url) => url !== previousProfile);
  }
  return persistExtrasRow(shopId, row);
}

/** Cover banner only — index 0 of imageUrls; does not change profileImageUrl. */
export async function setShopCoverImage(shopId: string, imageUrl: string): Promise<ShopExtras> {
  const clean = (await persistImageUri(imageUrl)).trim();
  if (!clean) return getShopExtras(shopId);
  const map = await readMap();
  const row = normalizeExtras(shopId, map[shopId]);
  const gallery = row.imageUrls.slice(1).filter((url) => url !== clean && url !== row.profileImageUrl);
  row.imageUrls = [clean, ...gallery].slice(0, 8);
  return persistExtrasRow(shopId, row);
}

export async function addShopImage(shopId: string, imageUrl: string): Promise<ShopExtras> {
  const clean = (await persistImageUri(imageUrl)).trim();
  if (!clean) return getShopExtras(shopId);
  const map = await readMap();
  const row = normalizeExtras(shopId, map[shopId]);
  if (clean === row.profileImageUrl || row.imageUrls.includes(clean)) return row;
  const cover = row.imageUrls[0];
  const gallery = row.imageUrls.slice(1).filter((url) => url !== clean);
  row.imageUrls = cover ? [cover, ...gallery, clean] : [clean, ...gallery];
  row.imageUrls = row.imageUrls.slice(0, 8);
  return persistExtrasRow(shopId, row);
}

export async function removeShopImage(shopId: string, imageUrl: string): Promise<ShopExtras> {
  const map = await readMap();
  const row = normalizeExtras(shopId, map[shopId]);
  row.imageUrls = row.imageUrls.filter((x) => x !== imageUrl);
  return persistExtrasRow(shopId, row);
}

export async function setShopServicePrice(shopId: string, servicePriceEgp: number): Promise<ShopExtras> {
  const map = await readMap();
  const row = normalizeExtras(shopId, map[shopId]);
  row.servicePriceEgp = Math.max(0, Math.round(servicePriceEgp * 100) / 100);
  return persistExtrasRow(shopId, row);
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
  return persistExtrasRow(shopId, row);
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
  return persistExtrasRow(shopId, row);
}

export async function setShopServices(shopId: string, services: ShopService[]): Promise<ShopExtras> {
  const map = await readMap();
  const row = normalizeExtras(shopId, map[shopId]);
  row.services = services.map((service) => ({ ...service, active: service.active !== false }));
  return persistExtrasRow(shopId, row);
}

/** All saved shop extras (for home offers aggregation). */
export async function listAllShopExtras(): Promise<ShopExtras[]> {
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase.from('shop_extras').select('shop_id, payload');
    if (!error && data?.length) {
      return data.map((row) => normalizeExtras(row.shop_id, row.payload as ShopExtras));
    }
  }
  const map = await readMap();
  return Object.keys(map).map((shopId) => normalizeExtras(shopId, map[shopId]));
}

export async function addShopOffer(input: {
  shopId: string;
  title: string;
  titleAr?: string;
  description?: string;
  discountPercentage: number;
  validDays: number;
}): Promise<ShopExtras> {
  const offer = await createShopOffer(input);
  const map = await readMap();
  const row = normalizeExtras(input.shopId, map[input.shopId]);
  row.offers = [offer, ...row.offers.filter((item) => item.id !== offer.id)].slice(0, 20);
  return persistExtrasRow(input.shopId, row);
}

export async function cancelShopOffer(shopId: string, offerId: string): Promise<ShopExtras> {
  await deactivateShopOffer(shopId, offerId);
  const map = await readMap();
  const row = normalizeExtras(shopId, map[shopId]);
  row.offers = row.offers.filter((offer) => offer.id !== offerId);
  return persistExtrasRow(shopId, row);
}

/** Persist owner branch operating status for customer-facing wash screens. */
export async function setWashShopStatus(
  shopId: string,
  input: {
    washShopStatus: NonNullable<ShopExtras['washShopStatus']>;
    vacationReturnDate?: string;
    vacationMessage?: string;
    vacationMessageAr?: string;
    activeBranchId?: string;
  },
): Promise<ShopExtras> {
  const map = await readMap();
  const row = normalizeExtras(shopId, {
    ...map[shopId],
    shopId,
    washShopStatus: input.washShopStatus,
    vacationReturnDate: input.washShopStatus === 'vacation' ? input.vacationReturnDate : undefined,
    vacationMessage: input.washShopStatus === 'vacation' ? input.vacationMessage : undefined,
    vacationMessageAr: input.washShopStatus === 'vacation' ? input.vacationMessageAr : undefined,
    activeBranchId: input.activeBranchId ?? map[shopId]?.activeBranchId,
  });
  return persistExtrasRow(shopId, row);
}

export async function setStoreOperatingStatus(
  shopId: string,
  storeOperatingStatus: StoreOperatingStatus,
): Promise<ShopExtras> {
  const map = await readMap();
  const row = normalizeExtras(shopId, map[shopId]);
  row.storeOperatingStatus = storeOperatingStatus;
  return persistExtrasRow(shopId, row);
}

export async function setShopStoreGlobalDiscount(shopId: string, percent: number): Promise<ShopExtras> {
  const map = await readMap();
  const row = normalizeExtras(shopId, map[shopId]);
  row.storeGlobalDiscountPercent = Math.max(0, Math.min(100, Math.round(percent)));
  return persistExtrasRow(shopId, row);
}
