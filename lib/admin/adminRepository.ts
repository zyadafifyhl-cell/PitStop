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
  isPremium: boolean;
  createdAt: string;
};

export type MerchantLedgerRow = {
  shopId: string;
  shopName: string;
  shopType: ShopType;
  ownerEmail: string;
  isPremium: boolean;
  completedBookings: number;
  grossRevenueEgp: number;
  outstandingFeeEgp: number;
  lastSettledAt: string;
};

export type ModerationItemKind = 'post' | 'comment' | 'review';

export type ModerationQueueItem = {
  id: string;
  kind: ModerationItemKind;
  title: string;
  body: string;
  authorLabel: string;
  shopId?: string;
  shopName?: string;
  createdAt: string;
};

export type PlatformStats = {
  totalRevenueEgp: number;
  activeShopsCount: number;
  completedBookingsCount: number;
  reportedPostsCount: number;
};

const PLATFORM_FEE_RATE = 0.12;

function bookingPlatformFee(servicePrice: number, platformFee: number): number {
  const stored = Number(platformFee ?? 0);
  if (stored > 0) return stored;
  const gross = Number(servicePrice ?? 0);
  return Math.round(gross * PLATFORM_FEE_RATE * 100) / 100;
}

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
    supabase.from('shops').select('id, name, type, is_active, is_premium').in('id', shopIds),
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
      isPremium: shop.is_premium === true,
      createdAt: user.created_at,
    });
  }
  return results;
}

export async function fetchMerchantLedger(): Promise<MerchantLedgerRow[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const [{ data: shops, error: shopsError }, { data: bookings, error: bookingsError }] = await Promise.all([
    supabase
      .from('shops')
      .select('id, name, type, owner_email, is_premium, platform_fee_last_settled_at')
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('bookings')
      .select('shop_id, status, service_price_egp, platform_fee_egp, scheduled_at')
      .eq('status', 'done'),
  ]);

  if (shopsError || !shops?.length) return [];

  const bookingRows = bookingsError ? [] : bookings ?? [];

  return shops.map((shop) => {
    const settledAt = shop.platform_fee_last_settled_at ?? '1970-01-01T00:00:00Z';
    const settledMs = new Date(settledAt).getTime();
    const shopDone = bookingRows.filter((row) => {
      if (row.shop_id !== shop.id) return false;
      const when = new Date(row.scheduled_at).getTime();
      return !Number.isNaN(when) && when > settledMs;
    });

    const grossRevenueEgp = shopDone.reduce((sum, row) => sum + Number(row.service_price_egp ?? 0), 0);
    const outstandingFeeEgp = shopDone.reduce(
      (sum, row) => sum + bookingPlatformFee(Number(row.service_price_egp ?? 0), Number(row.platform_fee_egp ?? 0)),
      0,
    );

    return {
      shopId: shop.id,
      shopName: shop.name,
      shopType: shop.type as ShopType,
      ownerEmail: shop.owner_email,
      isPremium: shop.is_premium === true,
      completedBookings: shopDone.length,
      grossRevenueEgp: Math.round(grossRevenueEgp * 100) / 100,
      outstandingFeeEgp: Math.round(outstandingFeeEgp * 100) / 100,
      lastSettledAt: settledAt,
    };
  });
}

export async function listModerationQueue(): Promise<ModerationQueueItem[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const [postsRes, commentsRes, reviewsRes, shopsRes] = await Promise.all([
    supabase
      .from('posts')
      .select('id, title, content, user_id, created_at')
      .eq('reported', true)
      .order('created_at', { ascending: false }),
    supabase
      .from('comments')
      .select('id, post_id, content, user_id, created_at')
      .eq('reported', true)
      .order('created_at', { ascending: false }),
    supabase
      .from('shop_reviews')
      .select('id, shop_id, customer_name, body, rating, created_at')
      .eq('reported', true)
      .order('created_at', { ascending: false }),
    supabase.from('shops').select('id, name'),
  ]);

  const shopNames = new Map((shopsRes.data ?? []).map((row) => [row.id, row.name]));
  const items: ModerationQueueItem[] = [];

  for (const row of postsRes.data ?? []) {
    items.push({
      id: row.id,
      kind: 'post',
      title: row.title,
      body: row.content,
      authorLabel: row.user_id,
      createdAt: row.created_at,
    });
  }

  for (const row of commentsRes.data ?? []) {
    items.push({
      id: row.id,
      kind: 'comment',
      title: `Comment on post ${row.post_id}`,
      body: row.content,
      authorLabel: row.user_id,
      createdAt: row.created_at,
    });
  }

  for (const row of reviewsRes.data ?? []) {
    items.push({
      id: row.id,
      kind: 'review',
      title: `${'★'.repeat(row.rating)} ${row.customer_name}`,
      body: row.body,
      authorLabel: row.customer_name,
      shopId: row.shop_id,
      shopName: shopNames.get(row.shop_id),
      createdAt: row.created_at,
    });
  }

  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function toggleShopPremium(shopId: string, isPremium: boolean): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.rpc('admin_toggle_shop_premium', {
    p_shop_id: shopId,
    p_is_premium: isPremium,
  });
  if (error) throw new Error(error.message);
}

export async function settleMerchantPlatformFees(shopId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.rpc('admin_settle_shop_platform_fees', { p_shop_id: shopId });
  if (error) throw new Error(error.message);
}

export async function dismissModerationReport(item: ModerationQueueItem): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase not configured');

  if (item.kind === 'post') {
    const { error } = await supabase.from('posts').update({ reported: false }).eq('id', item.id);
    if (error) throw new Error(error.message);
    return;
  }

  if (item.kind === 'comment') {
    const { error } = await supabase.from('comments').update({ reported: false }).eq('id', item.id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase
    .from('shop_reviews')
    .update({ reported: false, updated_at: new Date().toISOString() })
    .eq('id', item.id);
  if (error) throw new Error(error.message);
}

export async function deleteModerationContent(item: ModerationQueueItem): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase not configured');

  if (item.kind === 'post') {
    const { error } = await supabase.from('posts').delete().eq('id', item.id);
    if (error) throw new Error(error.message);
    return;
  }

  if (item.kind === 'comment') {
    const { error } = await supabase.from('comments').delete().eq('id', item.id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase.from('shop_reviews').delete().eq('id', item.id);
  if (error) throw new Error(error.message);
}

export async function fetchPlatformStats(): Promise<PlatformStats> {
  const supabase = getSupabase();
  const empty: PlatformStats = {
    totalRevenueEgp: 0,
    activeShopsCount: 0,
    completedBookingsCount: 0,
    reportedPostsCount: 0,
  };
  if (!supabase) return empty;

  const [shopsRes, bookingsCountRes, revenueRes, postsRes] = await Promise.all([
    supabase.from('shops').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'done'),
    supabase.from('bookings').select('final_amount_paid_egp').eq('status', 'done'),
    supabase.from('posts').select('id', { count: 'exact', head: true }).eq('reported', true),
  ]);

  const totalRevenueEgp = (revenueRes.data ?? []).reduce((sum, row) => {
    const paid = Number(row.final_amount_paid_egp ?? 0);
    return sum + (Number.isFinite(paid) ? paid : 0);
  }, 0);

  return {
    totalRevenueEgp: Math.round(totalRevenueEgp * 100) / 100,
    activeShopsCount: shopsRes.count ?? 0,
    completedBookingsCount: bookingsCountRes.count ?? 0,
    reportedPostsCount: postsRes.count ?? 0,
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
