import AsyncStorage from '@react-native-async-storage/async-storage';

import { isOfferLive, normalizeOfferDiscount } from '@/lib/booking/offerPricing';
import type { ShopOffer } from '@/lib/booking/types';
import { getSupabase } from '@/lib/supabase/client';

const OFFERS_CACHE_KEY = '@pitstop/offers/v1';
type OfferMap = Record<string, ShopOffer[]>;

type DbOfferRow = {
  id: string;
  shop_id: string;
  title: string;
  title_ar?: string | null;
  description?: string | null;
  discount_percentage: number | string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function localOfferId(): string {
  return `offer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function mapDbOfferRow(row: DbOfferRow): ShopOffer {
  return {
    id: row.id,
    shopId: row.shop_id,
    title: row.title,
    titleAr: row.title_ar?.trim() || undefined,
    description: row.description?.trim() || undefined,
    discountPercentage: normalizeOfferDiscount(Number(row.discount_percentage)),
    startDate: row.start_date,
    endDate: row.end_date,
    validUntil: row.end_date,
    active: row.is_active,
    createdAt: row.created_at,
  };
}

function normalizeCachedOffer(shopId: string, offer: ShopOffer): ShopOffer {
  const endDate = offer.endDate || offer.validUntil;
  const startDate = offer.startDate || offer.createdAt || endDate;
  return {
    ...offer,
    shopId: offer.shopId ?? shopId,
    discountPercentage: normalizeOfferDiscount(offer.discountPercentage),
    startDate,
    endDate,
    validUntil: endDate,
  };
}

async function readCache(): Promise<OfferMap> {
  try {
    const raw = await AsyncStorage.getItem(OFFERS_CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as OfferMap) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeCache(map: OfferMap): Promise<void> {
  await AsyncStorage.setItem(OFFERS_CACHE_KEY, JSON.stringify(map));
}

async function writeShopOffersCache(shopId: string, offers: ShopOffer[]): Promise<void> {
  const map = await readCache();
  map[shopId] = offers.map((offer) => normalizeCachedOffer(shopId, offer));
  await writeCache(map);
}

function liveOffersForShop(map: OfferMap, shopId: string): ShopOffer[] {
  return (map[shopId] ?? []).map((offer) => normalizeCachedOffer(shopId, offer)).filter((offer) => isOfferLive(offer));
}

export async function listActiveOffersForShop(shopId: string): Promise<ShopOffer[]> {
  const supabase = getSupabase();
  if (supabase) {
    const now = nowIso();
    const { data, error } = await supabase
      .from('offers')
      .select('*')
      .eq('shop_id', shopId)
      .eq('is_active', true)
      .lte('start_date', now)
      .gt('end_date', now)
      .order('discount_percentage', { ascending: false });

    if (!error && data) {
      const offers = (data as DbOfferRow[]).map(mapDbOfferRow).filter((offer) => isOfferLive(offer));
      await writeShopOffersCache(shopId, offers);
      return offers;
    }
  }

  const map = await readCache();
  return liveOffersForShop(map, shopId);
}

export async function listAllActiveOffers(): Promise<ShopOffer[]> {
  const supabase = getSupabase();
  if (supabase) {
    const now = nowIso();
    const { data, error } = await supabase
      .from('offers')
      .select('*')
      .eq('is_active', true)
      .lte('start_date', now)
      .gt('end_date', now)
      .order('end_date', { ascending: true });

    if (!error && data) {
      const offers = (data as DbOfferRow[]).map(mapDbOfferRow).filter((offer) => isOfferLive(offer));
      const grouped = new Map<string, ShopOffer[]>();
      for (const offer of offers) {
        const shopId = offer.shopId ?? '';
        if (!shopId) continue;
        const rows = grouped.get(shopId) ?? [];
        rows.push(offer);
        grouped.set(shopId, rows);
      }
      for (const [shopId, rows] of grouped) {
        await writeShopOffersCache(shopId, rows);
      }
      return offers;
    }
  }

  const map = await readCache();
  return Object.keys(map).flatMap((shopId) => liveOffersForShop(map, shopId));
}

export async function listActiveOfferFlagsByShopIds(
  shopIds: string[],
): Promise<Record<string, { hasActiveOffer: boolean; maxDiscount: number }>> {
  const unique = [...new Set(shopIds.filter(Boolean))];
  const flags: Record<string, { hasActiveOffer: boolean; maxDiscount: number }> = {};
  for (const shopId of unique) {
    flags[shopId] = { hasActiveOffer: false, maxDiscount: 0 };
  }
  if (!unique.length) return flags;

  const all = await listAllActiveOffers();
  for (const offer of all) {
    const shopId = offer.shopId;
    if (!shopId || !flags[shopId]) continue;
    flags[shopId].hasActiveOffer = true;
    flags[shopId].maxDiscount = Math.max(flags[shopId].maxDiscount, normalizeOfferDiscount(offer.discountPercentage));
  }
  return flags;
}

export async function getOfferById(offerId: string): Promise<ShopOffer | null> {
  const supabase = getSupabase();
  if (supabase && /^[0-9a-f-]{36}$/i.test(offerId)) {
    const { data, error } = await supabase.from('offers').select('*').eq('id', offerId).maybeSingle();
    if (!error && data) {
      return mapDbOfferRow(data as DbOfferRow);
    }
  }

  const map = await readCache();
  for (const shopId of Object.keys(map)) {
    const hit = map[shopId]?.find((offer) => offer.id === offerId);
    if (hit) return normalizeCachedOffer(shopId, hit);
  }
  return null;
}

export async function createShopOffer(input: {
  shopId: string;
  title: string;
  titleAr?: string;
  description?: string;
  discountPercentage: number;
  validDays: number;
}): Promise<ShopOffer> {
  const validDays = Math.max(1, Math.floor(input.validDays));
  const startDate = nowIso();
  const endDate = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toISOString();
  const discountPercentage = normalizeOfferDiscount(input.discountPercentage);
  const payload = {
    shop_id: input.shopId,
    title: input.title.trim(),
    title_ar: input.titleAr?.trim() || null,
    description: input.description?.trim() || '',
    discount_percentage: discountPercentage,
    start_date: startDate,
    end_date: endDate,
    is_active: true,
  };

  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase.from('offers').insert(payload).select('*').single();
    if (!error && data) {
      const offer = mapDbOfferRow(data as DbOfferRow);
      const existing = await listActiveOffersForShop(input.shopId);
      await writeShopOffersCache(input.shopId, [offer, ...existing.filter((row) => row.id !== offer.id)]);
      return offer;
    }
  }

  const offer: ShopOffer = {
    id: localOfferId(),
    shopId: input.shopId,
    title: input.title.trim(),
    titleAr: input.titleAr?.trim() || undefined,
    description: input.description?.trim() || undefined,
    discountPercentage,
    startDate,
    endDate,
    validUntil: endDate,
    active: true,
    createdAt: startDate,
  };
  const existing = await listActiveOffersForShop(input.shopId);
  await writeShopOffersCache(input.shopId, [offer, ...existing]);
  return offer;
}

export async function deactivateShopOffer(shopId: string, offerId: string): Promise<void> {
  const supabase = getSupabase();
  if (supabase && /^[0-9a-f-]{36}$/i.test(offerId)) {
    await supabase.from('offers').update({ is_active: false, updated_at: nowIso() }).eq('id', offerId);
  }

  const map = await readCache();
  const rows = (map[shopId] ?? []).map((offer) =>
    offer.id === offerId ? { ...offer, active: false } : offer,
  );
  map[shopId] = rows.filter((offer) => offer.active && isOfferLive(offer));
  await writeCache(map);
}

export class OfferValidationError extends Error {
  constructor(public code: 'expired' | 'invalid' | 'shop_mismatch') {
    super(code);
  }
}

export async function validateOfferForBooking(shopId: string, offerId: string): Promise<ShopOffer> {
  const offer = await getOfferById(offerId);
  if (!offer || offer.shopId !== shopId) {
    throw new OfferValidationError('invalid');
  }
  if (!isOfferLive(offer)) {
    throw new OfferValidationError('expired');
  }
  return offer;
}
