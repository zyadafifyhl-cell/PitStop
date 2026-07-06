import { getSupabase } from '@/lib/supabase/client';
import type { WashCoupon } from '@/lib/booking/wash/types';

type CouponRow = {
  id: string;
  shop_id: string;
  code: string;
  discount_percentage: number | string | null;
  discount_type?: string | null;
  discount_value?: number | string | null;
  global_limit: number | null;
  per_user_limit: number | null;
  min_value?: number | null;
  min_order_egp?: number | null;
  is_active: boolean | null;
  start_date?: string | null;
  end_date?: string | null;
  created_at?: string | null;
};

type CouponValidationResult =
  | {
      ok: true;
      couponId: string;
      code: string;
      discountType: 'percent' | 'fixed';
      discountValue: number;
      globalLimit: number | null;
      perUserLimit: number | null;
      minOrderEgp: number | null;
    }
  | {
      ok: false;
      reason: 'invalid_or_expired' | 'global_limit_reached' | 'per_user_limit_reached';
    };

function nowYmd(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function nowYmdFromDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function lowerText(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

function isMissingColumnError(error: unknown, columnName: string): boolean {
  const message = lowerText((error as { message?: string } | null)?.message);
  const details = lowerText((error as { details?: string } | null)?.details);
  const hint = lowerText((error as { hint?: string } | null)?.hint);
  const code = lowerText((error as { code?: string } | null)?.code);
  const needle = columnName.toLowerCase();
  return (
    message.includes(needle) ||
    details.includes(needle) ||
    hint.includes(needle) ||
    code === '42703'
  );
}

function isMissingCouponsTableError(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  if (status === 404) return true;
  const code = lowerText((error as { code?: string } | null)?.code);
  const message = lowerText((error as { message?: string } | null)?.message);
  return (
    code === '42p01' ||
    code === 'pgrst205' ||
    message.includes('could not find the table') ||
    (message.includes('relation') && message.includes('coupons'))
  );
}

function isUniqueConstraintError(error: unknown): boolean {
  const message = lowerText((error as { message?: string } | null)?.message);
  const code = lowerText((error as { code?: string } | null)?.code);
  return code === '23505' || message.includes('duplicate') || message.includes('unique');
}

function mapCouponRow(row: CouponRow): WashCoupon {
  const start = row.start_date ?? nowYmd();
  const end = row.end_date ?? '2099-12-31';
  const rawLegacy = parseNumber(row.discount_percentage);
  const declaredType = row.discount_type === 'fixed' || row.discount_type === 'percent' ? row.discount_type : null;
  const discountType: 'percent' | 'fixed' = declaredType ?? (rawLegacy < 0 ? 'fixed' : 'percent');
  const discountValue =
    row.discount_value != null
      ? parseNumber(row.discount_value)
      : discountType === 'fixed'
        ? Math.abs(rawLegacy)
        : Math.max(0, Math.min(100, rawLegacy));
  return {
    id: row.id,
    code: row.code,
    discountType,
    discountValue,
    startDate: start,
    endDate: end,
    usageLimit: row.global_limit ?? undefined,
    perCustomerUsageLimit: row.per_user_limit ?? undefined,
    usageCount: 0,
    minOrderEgp: row.min_value ?? row.min_order_egp ?? undefined,
    active: row.is_active !== false,
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

async function couponUsageCount(couponId: string, userId?: string): Promise<number> {
  const supabase = getSupabase();
  if (!supabase) return 0;
  let query = supabase
    .from('coupon_usages')
    .select('id', { count: 'exact', head: true })
    .eq('coupon_id', couponId);
  if (userId) query = query.eq('user_id', userId);
  const { count, error } = await query;
  if (error) {
    if (isMissingCouponsTableError(error)) return 0;
    return 0;
  }
  return count ?? 0;
}

export async function listActiveCouponsForShop(shopId: string): Promise<WashCoupon[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('coupons')
    .select('*')
    .eq('shop_id', shopId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });
  if (error) {
    if (!isMissingCouponsTableError(error)) {
      console.warn('[coupon.list]', error);
    }
    return [];
  }
  if (!data?.length) return [];
  const mapped = (data as CouponRow[]).map(mapCouponRow);
  const usageCounts = await Promise.all(mapped.map((row) => couponUsageCount(row.id)));
  return mapped.map((row, index) => ({ ...row, usageCount: usageCounts[index] ?? 0 }));
}

export async function saveCouponForShopRemote(input: {
  shopId: string;
  couponId?: string;
  code: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  globalLimit?: number;
  perUserLimit?: number;
  minValue?: number;
  liveDays?: number;
  isActive?: boolean;
}): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  const normalizedValue = Math.max(0, input.discountValue);
  const start = nowYmd();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + Math.max(1, input.liveDays ?? 30));
  const end = nowYmdFromDate(endDate);
  const payloadBase = {
    shop_id: input.shopId,
    code: input.code.trim().toUpperCase(),
    discount_percentage:
      input.discountType === 'percent'
        ? Math.max(0, Math.min(100, normalizedValue))
        : -Math.abs(normalizedValue),
    global_limit: input.globalLimit ?? null,
    per_user_limit: input.perUserLimit ?? null,
    start_date: start,
    end_date: end,
    is_active: input.isActive ?? true,
  };

  const payloadWithMin = {
    ...payloadBase,
    min_value: input.minValue ?? null,
    discount_type: input.discountType,
    discount_value: normalizedValue,
  };

  if (input.couponId) {
    let { error } = await supabase
      .from('coupons')
      .update({ ...payloadWithMin, updated_at: new Date().toISOString() })
      .eq('id', input.couponId)
      .eq('shop_id', input.shopId);

    const payloadLegacy = {
      ...payloadBase,
      discount_type: input.discountType,
      discount_value: normalizedValue,
    };

    if (error && isMissingColumnError(error, 'min_value')) {
      ({ error } = await supabase
        .from('coupons')
        .update({ ...payloadLegacy, updated_at: new Date().toISOString() })
        .eq('id', input.couponId)
        .eq('shop_id', input.shopId));
    }
    if (error && isMissingColumnError(error, 'discount_type')) {
      ({ error } = await supabase
        .from('coupons')
        .update({ ...payloadBase, updated_at: new Date().toISOString() })
        .eq('id', input.couponId)
        .eq('shop_id', input.shopId));
    }
    if (error) {
      if (!isMissingCouponsTableError(error)) {
        console.error('[coupon.update]', error);
      }
      return false;
    }
    return true;
  }

  let { error } = await supabase.from('coupons').insert(payloadWithMin);
  const payloadLegacy = { ...payloadBase, discount_type: input.discountType, discount_value: normalizedValue };
  if (error && isMissingColumnError(error, 'min_value')) {
    ({ error } = await supabase.from('coupons').insert(payloadLegacy));
  }
  if (error && isMissingColumnError(error, 'discount_type')) {
    ({ error } = await supabase.from('coupons').insert(payloadBase));
  }
  if (error && isUniqueConstraintError(error)) {
    ({ error } = await supabase
      .from('coupons')
      .update({ ...payloadBase, updated_at: new Date().toISOString() })
      .eq('shop_id', input.shopId)
      .eq('code', payloadBase.code));
  }
  if (error) {
    if (isMissingCouponsTableError(error)) return false;
    if (!isMissingCouponsTableError(error)) {
      console.error('[coupon.insert]', error);
    }
  }
  return !error;
}

export async function setCouponActiveRemote(couponId: string, shopId: string, active: boolean): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  const { error } = await supabase
    .from('coupons')
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq('id', couponId)
    .eq('shop_id', shopId);
  if (error && isMissingCouponsTableError(error)) return false;
  return !error;
}

export async function deleteCouponRemote(couponId: string, shopId: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  const { error } = await supabase.from('coupons').delete().eq('id', couponId).eq('shop_id', shopId);
  if (error && isMissingCouponsTableError(error)) return false;
  return !error;
}

export async function validateCouponForCheckout(input: {
  shopId: string;
  code: string;
  userId: string;
}): Promise<CouponValidationResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'invalid_or_expired' };
  const code = input.code.trim().toUpperCase();
  if (!code) return { ok: false, reason: 'invalid_or_expired' };

  const { data, error } = await supabase
    .from('coupons')
    .select('*')
    .eq('shop_id', input.shopId)
    .eq('code', code)
    .eq('is_active', true)
    .maybeSingle();
  if (error) {
    if (isMissingCouponsTableError(error)) return { ok: false, reason: 'invalid_or_expired' };
    return { ok: false, reason: 'invalid_or_expired' };
  }
  if (!data) return { ok: false, reason: 'invalid_or_expired' };

  const row = data as CouponRow;
  const today = nowYmd();
  if ((row.start_date && today < row.start_date) || (row.end_date && today > row.end_date)) {
    return { ok: false, reason: 'invalid_or_expired' };
  }

  const globalLimit = row.global_limit ?? null;
  const perUserLimit = row.per_user_limit ?? null;

  const totalUsage = await couponUsageCount(row.id);
  if (globalLimit != null && totalUsage >= globalLimit) {
    return { ok: false, reason: 'global_limit_reached' };
  }

  const userUsage = await couponUsageCount(row.id, input.userId);
  if (perUserLimit != null && userUsage >= perUserLimit) {
    return { ok: false, reason: 'per_user_limit_reached' };
  }

  return {
    ok: true,
    couponId: row.id,
    code,
    discountType:
      row.discount_type === 'fixed' || row.discount_type === 'percent'
        ? row.discount_type
        : parseNumber(row.discount_percentage) < 0
          ? 'fixed'
          : 'percent',
    discountValue:
      row.discount_value != null
        ? Math.max(0, parseNumber(row.discount_value))
        : Math.abs(parseNumber(row.discount_percentage)),
    globalLimit,
    perUserLimit,
    minOrderEgp: row.min_value ?? row.min_order_egp ?? null,
  };
}

export async function registerCouponUsageRemote(input: {
  couponId: string;
  userId: string;
  bookingId: string;
}): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  const { error } = await supabase.from('coupon_usages').insert({
    coupon_id: input.couponId,
    user_id: input.userId,
    booking_id: input.bookingId,
  });
  if (error && isMissingCouponsTableError(error)) return false;
  return !error;
}
