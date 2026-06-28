import type { ShopType } from '@/lib/booking/types';
import { getSupabase } from '@/lib/supabase/client';

export type PendingOwnerRequest = {
  userId: string;
  email: string;
  fullName?: string;
  phone?: string;
  shopId: string;
  shopName: string;
  shopNameAr: string;
  shopType: ShopType;
  areaId: string;
  address: string;
  phoneShop: string;
  createdAt: string;
};

export type ActiveMerchant = {
  userId: string;
  email: string;
  fullName?: string;
  shopId: string;
  shopName: string;
  shopType: ShopType;
  branchCount: number;
  createdAt: string;
};

export type PlatformStats = {
  totalBookings: number;
  completedBookings: number;
  platformFeeEgp: number;
  grossRevenueEgp: number;
  pendingOwnerCount: number;
  activeMerchantCount: number;
};

const PLATFORM_FEE_RATE = 0.12;

export async function listPendingOwnerRequests(): Promise<PendingOwnerRequest[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data: users, error } = await supabase
    .from('users')
    .select('id, email, full_name, phone, shop_id, created_at')
    .eq('role', 'pending_owner')
    .order('created_at', { ascending: false });

  if (error || !users?.length) return [];

  const shopIds = [...new Set(users.map((u) => u.shop_id).filter(Boolean))] as string[];
  const { data: shops } = await supabase.from('shops').select('*').in('id', shopIds);
  const shopMap = new Map((shops ?? []).map((s) => [s.id, s]));

  const results: PendingOwnerRequest[] = [];
  for (const user of users) {
    const shop = user.shop_id ? shopMap.get(user.shop_id) : undefined;
    if (!shop) continue;
    results.push({
      userId: user.id,
      email: user.email,
      fullName: user.full_name ?? undefined,
      phone: user.phone ?? undefined,
      shopId: shop.id,
      shopName: shop.name,
      shopNameAr: shop.name_ar,
      shopType: shop.type as ShopType,
      areaId: shop.area_id,
      address: shop.address,
      phoneShop: shop.phone,
      createdAt: user.created_at,
    });
  }
  return results;
}

export async function listActiveMerchants(): Promise<ActiveMerchant[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data: users, error } = await supabase
    .from('users')
    .select('id, email, full_name, shop_id, created_at')
    .eq('role', 'owner')
    .eq('is_active', true)
    .not('shop_id', 'is', null)
    .order('created_at', { ascending: false });

  if (error || !users?.length) return [];

  const shopIds = [...new Set(users.map((u) => u.shop_id).filter(Boolean))] as string[];
  const [{ data: shops }, { data: branches }] = await Promise.all([
    supabase.from('shops').select('id, name, type, is_active').in('id', shopIds),
    supabase.from('shop_branches').select('shop_id').in('shop_id', shopIds).eq('is_active', true),
  ]);

  const shopMap = new Map((shops ?? []).map((s) => [s.id, s]));
  const branchCounts = new Map<string, number>();
  for (const row of branches ?? []) {
    branchCounts.set(row.shop_id, (branchCounts.get(row.shop_id) ?? 0) + 1);
  }

  const results: ActiveMerchant[] = [];
  for (const user of users) {
    const shop = user.shop_id ? shopMap.get(user.shop_id) : undefined;
    if (!shop?.is_active) continue;
    results.push({
      userId: user.id,
      email: user.email,
      fullName: user.full_name ?? undefined,
      shopId: shop.id,
      shopName: shop.name,
      shopType: shop.type as ShopType,
      branchCount: branchCounts.get(shop.id) ?? 0,
      createdAt: user.created_at,
    });
  }
  return results;
}

export async function fetchPlatformStats(): Promise<PlatformStats> {
  const supabase = getSupabase();
  if (!supabase) {
    return {
      totalBookings: 0,
      completedBookings: 0,
      platformFeeEgp: 0,
      grossRevenueEgp: 0,
      pendingOwnerCount: 0,
      activeMerchantCount: 0,
    };
  }

  const [bookingsRes, pendingRes, merchantsRes] = await Promise.all([
    supabase.from('bookings').select('status, service_price_egp, platform_fee_egp'),
    supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'pending_owner'),
    supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'owner')
      .eq('is_active', true),
  ]);

  const rows = bookingsRes.data ?? [];
  const done = rows.filter((b) => b.status === 'done');
  const gross = done.reduce((sum, b) => sum + Number(b.service_price_egp ?? 0), 0);
  const feeFromDb = done.reduce((sum, b) => sum + Number(b.platform_fee_egp ?? 0), 0);
  const platformFee = feeFromDb > 0 ? feeFromDb : Math.round(gross * PLATFORM_FEE_RATE * 100) / 100;

  return {
    totalBookings: rows.length,
    completedBookings: done.length,
    platformFeeEgp: platformFee,
    grossRevenueEgp: gross,
    pendingOwnerCount: pendingRes.count ?? 0,
    activeMerchantCount: merchantsRes.count ?? 0,
  };
}

export async function approveShopOwner(userId: string, shopId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.rpc('approve_shop_owner', {
    p_target_user_id: userId,
    p_target_shop_id: shopId,
  });
  if (error) throw new Error(error.message);
}

export async function rejectShopOwner(userId: string, shopId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.rpc('reject_shop_owner', {
    p_target_user_id: userId,
    p_target_shop_id: shopId,
  });
  if (error) throw new Error(error.message);
}
