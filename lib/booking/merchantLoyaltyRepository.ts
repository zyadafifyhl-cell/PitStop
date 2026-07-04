import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Booking, BookingStatus, ShopType } from '@/lib/booking/types';
import { getShopById } from '@/lib/booking/catalogRepository';
import { getSupabase } from '@/lib/supabase/client';

const MERCHANT_LOYALTY_KEY = '@pitstop/merchant_loyalty/v1';

/** 1 loyalty point earned per EGP 10 net paid. */
export const MERCHANT_LOYALTY_EARN_EGP_PER_POINT = 10;
/** 10 loyalty points redeem for EGP 1 discount. */
export const MERCHANT_LOYALTY_REDEEM_POINTS_PER_EGP = 10;

type BalanceMap = Record<string, number>;

export type MerchantLoyaltyEarnResult = {
  pointsAdded: boolean;
  pointsEarned: number;
  pointsBalance: number;
  shopId: string;
  userId: string;
};

export type PointsRedemptionValidation = {
  ok: boolean;
  reason?: string;
  pointsRequested: number;
  pointsAllowed: number;
  discountEgp: number;
  balance: number;
};

export type MerchantLoyaltyMarketplaceEntry = {
  shopId: string;
  pointsBalance: number;
  shopName: string;
  shopNameAr: string;
  shopType: ShopType;
};

type RemoteLoyaltyRow = {
  shop_id: string;
  points_balance: number;
  shops: {
    id: string;
    name: string;
    name_ar: string;
    type: ShopType;
    is_loyalty_enabled: boolean;
  } | null;
};

type RpcEarnPayload = {
  ok?: boolean;
  reason?: string;
  pointsAdded?: boolean;
  pointsEarned?: number;
  pointsBalance?: number;
  shopId?: string;
  userId?: string;
};

type RpcRedeemPayload = {
  ok?: boolean;
  reason?: string;
  pointsRequested?: number;
  pointsAllowed?: number;
  discountEgp?: number | string;
  balance?: number;
};

function isUuid(value: string | undefined): value is string {
  return (
    !!value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function balanceKey(userId: string, shopId: string): string {
  return `${userId}|${shopId}`;
}

async function readBalanceMap(): Promise<BalanceMap> {
  try {
    const raw = await AsyncStorage.getItem(MERCHANT_LOYALTY_KEY);
    const parsed = raw ? (JSON.parse(raw) as BalanceMap) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeBalanceMap(map: BalanceMap): Promise<void> {
  await AsyncStorage.setItem(MERCHANT_LOYALTY_KEY, JSON.stringify(map));
}

export async function getMerchantPointsBalanceLocal(
  userId: string,
  shopId: string,
): Promise<number> {
  const map = await readBalanceMap();
  return map[balanceKey(userId, shopId)] ?? 0;
}

export async function setMerchantPointsBalanceLocal(
  userId: string,
  shopId: string,
  pointsBalance: number,
): Promise<void> {
  const map = await readBalanceMap();
  map[balanceKey(userId, shopId)] = Math.max(0, Math.floor(pointsBalance));
  await writeBalanceMap(map);
}

export async function listMerchantPointsBalancesLocal(userId: string): Promise<Record<string, number>> {
  const map = await readBalanceMap();
  const prefix = `${userId}|`;
  const out: Record<string, number> = {};
  for (const [key, balance] of Object.entries(map)) {
    if (!key.startsWith(prefix)) continue;
    const shopId = key.slice(prefix.length);
    if (shopId && balance > 0) out[shopId] = balance;
  }
  return out;
}

async function mapLocalEntriesAsync(userId: string): Promise<MerchantLoyaltyMarketplaceEntry[]> {
  const balances = await listMerchantPointsBalancesLocal(userId);
  return Object.entries(balances)
    .map(([shopId, pointsBalance]) => {
      const shop = getShopById(shopId);
      return {
        shopId,
        pointsBalance,
        shopName: shop?.name ?? shopId,
        shopNameAr: shop?.nameAr ?? shopId,
        shopType: shop?.type ?? ('wash' as ShopType),
      };
    })
    .sort((a, b) => b.pointsBalance - a.pointsBalance);
}

/** Per-shop ledger rows for marketplace — loyalty enabled shops with balance > 0. */
export async function listEligibleMerchantLoyaltyEntries(
  userId: string,
): Promise<MerchantLoyaltyMarketplaceEntry[]> {
  if (!isUuid(userId)) return [];

  const supabase = getSupabase();
  if (!supabase) return mapLocalEntriesAsync(userId);

  const { data, error } = await supabase
    .from('customer_merchant_loyalty')
    .select(
      'shop_id, points_balance, shops:shop_id ( id, name, name_ar, type, is_loyalty_enabled )',
    )
    .eq('user_id', userId)
    .gt('points_balance', 0);

  if (error || !data) {
    console.warn('listEligibleMerchantLoyaltyEntries failed:', error?.message);
    return mapLocalEntriesAsync(userId);
  }

  const entries: MerchantLoyaltyMarketplaceEntry[] = [];
  for (const raw of data ?? []) {
    const row = raw as {
      shop_id: string;
      points_balance: number;
      shops: RemoteLoyaltyRow['shops'] | RemoteLoyaltyRow['shops'][];
    };
    const shop = Array.isArray(row.shops) ? row.shops[0] : row.shops;
    if (!shop || shop.is_loyalty_enabled === false) continue;

    const pointsBalance = Math.max(0, Math.floor(Number(row.points_balance ?? 0)));
    if (pointsBalance <= 0) continue;

    entries.push({
      shopId: row.shop_id,
      pointsBalance,
      shopName: shop.name,
      shopNameAr: shop.name_ar || shop.name,
      shopType: shop.type,
    });

    await setMerchantPointsBalanceLocal(userId, row.shop_id, pointsBalance);
  }

  return entries.sort((a, b) => b.pointsBalance - a.pointsBalance);
}

export type MerchantLoyaltyCheckoutState = {
  enabled: boolean;
  balance: number;
};

export async function getMerchantLoyaltyCheckoutState(
  userId: string,
  shopId: string,
): Promise<MerchantLoyaltyCheckoutState> {
  if (!isUuid(userId)) return { enabled: false, balance: 0 };

  const supabase = getSupabase();
  if (!supabase) {
    return {
      enabled: true,
      balance: await getMerchantPointsBalanceLocal(userId, shopId),
    };
  }

  const [shopRes, ledgerRes] = await Promise.all([
    supabase.from('shops').select('is_loyalty_enabled').eq('id', shopId).maybeSingle(),
    supabase
      .from('customer_merchant_loyalty')
      .select('points_balance')
      .eq('user_id', userId)
      .eq('shop_id', shopId)
      .maybeSingle(),
  ]);

  const enabled = shopRes.data?.is_loyalty_enabled !== false;
  const balance = Math.max(0, Math.floor(Number(ledgerRes.data?.points_balance ?? 0)));

  if (balance > 0) {
    await setMerchantPointsBalanceLocal(userId, shopId, balance);
  }

  return { enabled, balance };
}

export async function deductMerchantLoyaltyPointsRemote(input: {
  userId: string;
  shopId: string;
  bookingId: string;
  pointsToRedeem: number;
  discountEgp: number;
}): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase || !isUuid(input.userId) || !isUuid(input.bookingId)) return false;
  if (input.pointsToRedeem <= 0) return true;

  const { data, error } = await supabase.rpc('deduct_merchant_loyalty_points', {
    p_user_id: input.userId,
    p_shop_id: input.shopId,
    p_booking_id: input.bookingId,
    p_points_to_redeem: Math.floor(input.pointsToRedeem),
    p_discount_egp: Math.max(0, input.discountEgp),
  });

  if (error) {
    console.warn('deduct_merchant_loyalty_points RPC failed:', error.message);
    return false;
  }

  if (!data || typeof data !== 'object') return false;

  const payload = data as { ok?: boolean; pointsBalance?: number };
  if (typeof payload.pointsBalance === 'number') {
    await setMerchantPointsBalanceLocal(input.userId, input.shopId, payload.pointsBalance);
  }

  return Boolean(payload.ok);
}

/** Call Supabase RPC after a booking is marked done on the server. */
export async function calculateAndAddLoyaltyPointsRemote(
  bookingId: string,
): Promise<MerchantLoyaltyEarnResult | null> {
  const supabase = getSupabase();
  if (!supabase || !isUuid(bookingId)) return null;

  const { data, error } = await supabase.rpc('calculate_and_add_loyalty_points', {
    p_booking_id: bookingId,
  });

  if (error) {
    console.warn('calculate_and_add_loyalty_points RPC failed:', error.message);
    return null;
  }

  if (!data || typeof data !== 'object') return null;

  const payload = data as RpcEarnPayload;
  if (!payload.userId || !payload.shopId) return null;

  const result: MerchantLoyaltyEarnResult = {
    pointsAdded: Boolean(payload.pointsAdded),
    pointsEarned: Number(payload.pointsEarned ?? 0),
    pointsBalance: Number(payload.pointsBalance ?? 0),
    shopId: payload.shopId,
    userId: payload.userId,
  };

  await setMerchantPointsBalanceLocal(result.userId, result.shopId, result.pointsBalance);
  return result;
}

export async function validatePointsRedemptionRemote(input: {
  userId: string;
  shopId: string;
  pointsToRedeem: number;
  invoiceTotalEgp: number;
}): Promise<PointsRedemptionValidation> {
  const fallback: PointsRedemptionValidation = {
    ok: false,
    reason: 'offline',
    pointsRequested: input.pointsToRedeem,
    pointsAllowed: 0,
    discountEgp: 0,
    balance: await getMerchantPointsBalanceLocal(input.userId, input.shopId),
  };

  const supabase = getSupabase();
  if (!supabase || !isUuid(input.userId)) return fallback;

  const { data, error } = await supabase.rpc('validate_and_apply_points_redemption', {
    p_user_id: input.userId,
    p_shop_id: input.shopId,
    p_points_to_redeem: Math.max(0, Math.floor(input.pointsToRedeem)),
    p_invoice_total: Math.max(0, input.invoiceTotalEgp),
  });

  if (error || !data || typeof data !== 'object') return fallback;

  const payload = data as RpcRedeemPayload;
  return {
    ok: Boolean(payload.ok),
    reason: payload.reason,
    pointsRequested: Number(payload.pointsRequested ?? input.pointsToRedeem),
    pointsAllowed: Number(payload.pointsAllowed ?? 0),
    discountEgp: Number(payload.discountEgp ?? 0),
    balance: Number(payload.balance ?? 0),
  };
}

/** Bridge: earn per-merchant points when booking transitions to done (after remote sync). */
export async function recordMerchantLoyaltyPointsOnDone(
  booking: Booking,
  previousStatus?: BookingStatus,
): Promise<MerchantLoyaltyEarnResult | null> {
  if (booking.status !== 'done') return null;
  if (previousStatus === 'done') return null;
  if (!isUuid(booking.id)) return null;

  return calculateAndAddLoyaltyPointsRemote(booking.id);
}
