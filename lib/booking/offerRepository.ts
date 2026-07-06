import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RealtimeChannel } from '@supabase/supabase-js';

import {
  isOfferLive,
  normalizeOfferDiscount,
  resolveOfferDiscountValue,
  resolveOfferType,
} from '@/lib/booking/offerPricing';
import { listBookingsForPhone } from '@/lib/booking/storage';
import type { OfferType, ShopOffer } from '@/lib/booking/types';
import { phoneLookupVariants } from '@/lib/phone';
import { getSupabase } from '@/lib/supabase/client';

const OFFERS_CACHE_KEY = '@pitstop/offers/v1';
type OfferMap = Record<string, ShopOffer[]>;

type DbOfferRow = {
  id: string;
  shop_id: string;
  title: string;
  title_ar?: string | null;
  description?: string | null;
  offer_type?: OfferType | null;
  discount_value?: number | string | null;
  required_wash_count?: number | null;
  discount_percentage: number | string;
  start_date: string;
  end_date: string;
  expires_at?: string | null;
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
  const offerType = (row.offer_type ?? 'percentage') as OfferType;
  const discountValue = Number(row.discount_value ?? row.discount_percentage ?? 0);
  const endDate = row.expires_at || row.end_date;
  return {
    id: row.id,
    shopId: row.shop_id,
    title: row.title,
    titleAr: row.title_ar?.trim() || undefined,
    description: row.description?.trim() || undefined,
    offerType,
    discountValue,
    requiredWashCount: Math.max(0, Number(row.required_wash_count ?? 0)),
    expiresAt: row.expires_at ?? endDate,
    discountPercentage: normalizeOfferDiscount(Number(row.discount_percentage ?? discountValue)),
    startDate: row.start_date,
    endDate,
    validUntil: endDate,
    active: row.is_active,
    createdAt: row.created_at,
  };
}

function normalizeCachedOffer(shopId: string, offer: ShopOffer): ShopOffer {
  const endDate = offer.expiresAt || offer.endDate || offer.validUntil;
  const startDate = offer.startDate || offer.createdAt || endDate;
  const offerType = resolveOfferType(offer);
  const discountValue = resolveOfferDiscountValue(offer);
  return {
    ...offer,
    shopId: offer.shopId ?? shopId,
    offerType,
    discountValue,
    requiredWashCount: offer.requiredWashCount ?? 0,
    expiresAt: offer.expiresAt ?? endDate,
    discountPercentage:
      offerType === 'percentage'
        ? normalizeOfferDiscount(discountValue)
        : normalizeOfferDiscount(offer.discountPercentage),
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
  return (map[shopId] ?? [])
    .map((offer) => normalizeCachedOffer(shopId, offer))
    .filter((offer) => isOfferLive(offer));
}

function activeOffersQuery(supabase: NonNullable<ReturnType<typeof getSupabase>>) {
  const now = nowIso();
  return supabase
    .from('offers')
    .select('*')
    .eq('is_active', true)
    .lte('start_date', now)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .gt('end_date', now)
    .order('created_at', { ascending: false });
}

export async function listActiveOffersForShop(shopId: string): Promise<ShopOffer[]> {
  const grouped = await listActiveOffersForShops([shopId]);
  return grouped[shopId] ?? [];
}

/** Single Supabase round-trip for all shops on a list screen. */
export async function listActiveOffersForShops(shopIds: string[]): Promise<Record<string, ShopOffer[]>> {
  const unique = [...new Set(shopIds.filter(Boolean))];
  const grouped: Record<string, ShopOffer[]> = {};
  for (const shopId of unique) grouped[shopId] = [];

  const supabase = getSupabase();
  if (supabase && unique.length) {
    const { data, error } = await activeOffersQuery(supabase).in('shop_id', unique);
    if (!error && data) {
      for (const row of data as DbOfferRow[]) {
        const offer = mapDbOfferRow(row);
        if (!isOfferLive(offer)) continue;
        const shopId = offer.shopId ?? row.shop_id;
        if (!shopId || !grouped[shopId]) continue;
        grouped[shopId].push(offer);
      }
      await Promise.all(
        Object.entries(grouped).map(([shopId, offers]) => writeShopOffersCache(shopId, offers)),
      );
      return grouped;
    }
  }

  const map = await readCache();
  for (const shopId of unique) {
    grouped[shopId] = liveOffersForShop(map, shopId);
  }
  return grouped;
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
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .gt('end_date', now)
      .order('created_at', { ascending: false });

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
    if (resolveOfferType(offer) === 'percentage') {
      flags[shopId].maxDiscount = Math.max(
        flags[shopId].maxDiscount,
        normalizeOfferDiscount(resolveOfferDiscountValue(offer)),
      );
    }
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

export async function countDoneBookingsForCustomerAtShop(input: {
  shopId: string;
  customerId?: string;
  customerPhone?: string;
}): Promise<number> {
  const supabase = getSupabase();
  if (supabase) {
    let query = supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('shop_id', input.shopId)
      .eq('status', 'done');

    if (input.customerId) {
      query = query.eq('customer_id', input.customerId);
    } else if (input.customerPhone) {
      const variants = phoneLookupVariants(input.customerPhone);
      query = query.in('customer_phone', variants.length ? variants : [input.customerPhone]);
    } else {
      return 0;
    }

    const { count, error } = await query;
    if (!error && count != null) return count;
  }

  if (input.customerPhone) {
    const rows = await listBookingsForPhone(input.customerPhone);
    return rows.filter((row) => row.shopId === input.shopId && row.status === 'done').length;
  }
  return 0;
}

export async function deployShopCampaign(input: {
  shopId: string;
  title: string;
  titleAr?: string;
  description?: string;
  offerType: OfferType;
  discountValue: number;
  requiredWashCount?: number;
  validDays?: number;
  expiresAt?: string | null;
}): Promise<ShopOffer> {
  const startDate = nowIso();
  const validDays = Math.max(1, Math.floor(input.validDays ?? 30));
  const expiresAt =
    input.expiresAt ??
    new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toISOString();
  const offerType = input.offerType;
  const discountValue = Math.max(0, Number(input.discountValue) || 0);
  const requiredWashCount =
    offerType === 'buy_x_get_y' ? Math.max(1, Math.floor(input.requiredWashCount ?? 2)) : 0;
  const legacyDiscountPct = offerType === 'percentage' ? normalizeOfferDiscount(discountValue) : 0;

  const payload = {
    shop_id: input.shopId,
    title: input.title.trim(),
    title_ar: input.titleAr?.trim() || null,
    description: input.description?.trim() || '',
    offer_type: offerType,
    discount_value: discountValue,
    required_wash_count: requiredWashCount,
    discount_percentage: legacyDiscountPct,
    start_date: startDate,
    end_date: expiresAt,
    expires_at: expiresAt,
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
    offerType,
    discountValue,
    requiredWashCount,
    expiresAt,
    discountPercentage: legacyDiscountPct,
    startDate,
    endDate: expiresAt,
    validUntil: expiresAt,
    active: true,
    createdAt: startDate,
  };
  const existing = await listActiveOffersForShop(input.shopId);
  await writeShopOffersCache(input.shopId, [offer, ...existing]);
  return offer;
}

/** Legacy percentage-only creator — delegates to deployShopCampaign. */
export async function createShopOffer(input: {
  shopId: string;
  title: string;
  titleAr?: string;
  description?: string;
  discountPercentage: number;
  validDays: number;
}): Promise<ShopOffer> {
  return deployShopCampaign({
    shopId: input.shopId,
    title: input.title,
    titleAr: input.titleAr,
    description: input.description,
    offerType: 'percentage',
    discountValue: normalizeOfferDiscount(input.discountPercentage),
    validDays: input.validDays,
  });
}

export async function deactivateShopOffer(shopId: string, offerId: string): Promise<void> {
  const supabase = getSupabase();
  if (supabase && /^[0-9a-f-]{36}$/i.test(offerId)) {
    await supabase
      .from('offers')
      .update({ is_active: false, updated_at: nowIso() })
      .eq('id', offerId);
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

const activeOfferChannels = new Map<string, RealtimeChannel>();

export function subscribeOffersRealtime(onChange: () => void): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => {};

  const channelName = 'public:offers:customer';
  const existing = activeOfferChannels.get(channelName);
  if (existing) {
    void supabase.removeChannel(existing);
    activeOfferChannels.delete(channelName);
  }

  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'offers' },
      () => {
        onChange();
      },
    )
    .subscribe();

  activeOfferChannels.set(channelName, channel);

  return () => {
    const tracked = activeOfferChannels.get(channelName);
    if (tracked) {
      void supabase.removeChannel(tracked);
      activeOfferChannels.delete(channelName);
    }
  };
}
