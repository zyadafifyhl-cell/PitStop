import AsyncStorage from '@react-native-async-storage/async-storage';

import { pushCustomerNotification } from '@/lib/booking/commerceEvents';
import type { ShopReview } from '@/lib/booking/types';
import { getSupabase } from '@/lib/supabase/client';
import { pushWashCenterNotification } from '@/lib/booking/wash/washNotificationCenter';

const REVIEWS_KEY = '@pitstop/shop-reviews/v1';
type ReviewMap = Record<string, ShopReview[]>;

type ReviewRow = {
  id: string;
  shop_id: string;
  customer_id?: string | null;
  customer_name: string;
  rating: number;
  body: string;
  likes: number;
  liked_by: string[] | null;
  owner_reply?: string | null;
  hidden?: boolean | null;
  reported?: boolean | null;
  created_at: string;
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function mapReviewRow(row: ReviewRow): ShopReview {
  const likedBy = Array.isArray(row.liked_by) ? row.liked_by.filter((id) => typeof id === 'string') : [];
  return {
    id: row.id,
    shopId: row.shop_id,
    customerId: row.customer_id ?? undefined,
    customerName: row.customer_name,
    rating: row.rating,
    body: row.body,
    likes: row.likes ?? likedBy.length,
    likedBy,
    ownerReply: row.owner_reply ?? undefined,
    hidden: row.hidden ?? false,
    reported: row.reported ?? false,
    createdAt: row.created_at,
  };
}

async function readMap(): Promise<ReviewMap> {
  try {
    const raw = await AsyncStorage.getItem(REVIEWS_KEY);
    const parsed = raw ? (JSON.parse(raw) as ReviewMap) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeMap(map: ReviewMap): Promise<void> {
  await AsyncStorage.setItem(REVIEWS_KEY, JSON.stringify(map));
}

function mergeReviews(remote: ShopReview[], local: ShopReview[]): ShopReview[] {
  const byId = new Map<string, ShopReview>();
  for (const row of remote) byId.set(row.id, row);
  for (const row of local) {
    const existing = byId.get(row.id);
    if (!existing) {
      byId.set(row.id, row);
      continue;
    }
    byId.set(row.id, {
      ...existing,
      ...row,
      likedBy: row.likedBy.length ? row.likedBy : existing.likedBy,
      likes: row.likes || existing.likes,
      ownerReply: row.ownerReply ?? existing.ownerReply,
      hidden: row.hidden ?? existing.hidden,
      reported: row.reported ?? existing.reported,
    });
  }
  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function fetchReviewsRemote(shopId: string): Promise<ShopReview[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('shop_reviews')
    .select('*')
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return (data as ReviewRow[]).map(mapReviewRow);
}

async function upsertLocalReview(shopId: string, review: ShopReview): Promise<void> {
  const map = await readMap();
  const rows = map[shopId] ?? [];
  const idx = rows.findIndex((r) => r.id === review.id);
  if (idx >= 0) rows[idx] = review;
  else rows.unshift(review);
  map[shopId] = rows.slice(0, 100);
  await writeMap(map);
}

async function patchLocalReview(
  shopId: string,
  reviewId: string,
  patch: Partial<ShopReview>,
): Promise<void> {
  const map = await readMap();
  map[shopId] = (map[shopId] ?? []).map((row) => (row.id === reviewId ? { ...row, ...patch } : row));
  await writeMap(map);
}

type RatingSummaryRow = { shop_id: string; rating: number; hidden?: boolean | null };

/** Aggregate visible review ratings for many shops in one Supabase query. */
export async function fetchShopRatingSummariesRemote(
  shopIds: string[],
): Promise<Record<string, { average: number | null; count: number }>> {
  const unique = [...new Set(shopIds.filter(Boolean))];
  const summaries: Record<string, { average: number | null; count: number }> = {};
  for (const shopId of unique) summaries[shopId] = { average: null, count: 0 };
  if (!unique.length) return summaries;

  const supabase = getSupabase();
  if (!supabase) return summaries;

  const { data, error } = await supabase
    .from('shop_reviews')
    .select('shop_id, rating, hidden')
    .in('shop_id', unique);

  if (error || !data) return summaries;

  const buckets = new Map<string, number[]>();
  for (const row of data as RatingSummaryRow[]) {
    if (row.hidden) continue;
    const ratings = buckets.get(row.shop_id) ?? [];
    ratings.push(Number(row.rating));
    buckets.set(row.shop_id, ratings);
  }

  for (const [shopId, ratings] of buckets) {
    if (!ratings.length) continue;
    const sum = ratings.reduce((total, rating) => total + rating, 0);
    summaries[shopId] = { average: sum / ratings.length, count: ratings.length };
  }
  return summaries;
}

export async function listShopReviewsSynced(shopId: string): Promise<ShopReview[]> {
  const local = (await readMap())[shopId] ?? [];
  const remote = await fetchReviewsRemote(shopId);
  if (remote.length) return mergeReviews(remote, local);
  return local.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Returns the logged-in customer's existing review for a shop, if any. */
export async function getCustomerShopReviewSynced(
  shopId: string,
  customerId: string,
): Promise<ShopReview | null> {
  if (!customerId?.trim()) return null;

  const local = (await readMap())[shopId] ?? [];
  const localMatch = local.find((row) => row.customerId === customerId && !row.hidden) ?? null;

  const supabase = getSupabase();
  if (supabase && isUuid(customerId)) {
    const { data, error } = await supabase
      .from('shop_reviews')
      .select('*')
      .eq('shop_id', shopId)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (!error && data?.length) {
      const remote = mapReviewRow(data[0] as ReviewRow);
      await upsertLocalReview(shopId, remote);
      return remote;
    }
  }

  return localMatch;
}

export async function addShopReviewSynced(input: {
  shopId: string;
  customerId?: string;
  customerName: string;
  rating: number;
  body: string;
}): Promise<ShopReview> {
  const rating = Math.max(1, Math.min(5, Math.round(input.rating)));
  const body = input.body.trim();
  const customerName = input.customerName.trim();
  const supabase = getSupabase();
  const customerId = input.customerId;

  if (customerId) {
    const existing = await getCustomerShopReviewSynced(input.shopId, customerId);
    if (existing) {
      throw new Error('shop_review_already_exists');
    }
  }

  if (supabase && customerId && isUuid(customerId)) {
    const { data, error } = await supabase
      .from('shop_reviews')
      .insert({
        shop_id: input.shopId,
        customer_id: customerId,
        customer_name: customerName,
        rating,
        body,
      })
      .select('*')
      .single();

    if (!error && data) {
      const created = mapReviewRow(data as ReviewRow);
      await upsertLocalReview(input.shopId, created);
      await pushWashCenterNotification({
        shopId: input.shopId,
        kind: 'new_review',
        title: 'New customer review',
        body: `${customerName} · ${'★'.repeat(rating)} · ${body.slice(0, 100)}`,
        reviewId: created.id,
      });
      return created;
    }
    if (error) throw new Error(error.message);
  }

  const localReview: ShopReview = {
    id: `rev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    shopId: input.shopId,
    customerId: input.customerId,
    customerName,
    rating,
    body,
    likes: 0,
    likedBy: [],
    createdAt: new Date().toISOString(),
  };
  await upsertLocalReview(input.shopId, localReview);
  await pushWashCenterNotification({
    shopId: input.shopId,
    kind: 'new_review',
    title: 'New customer review',
    body: `${customerName} · ${'★'.repeat(rating)} · ${body.slice(0, 100)}`,
    reviewId: localReview.id,
  });
  return localReview;
}

export async function setReviewOwnerReplySynced(
  shopId: string,
  reviewId: string,
  ownerReply: string,
): Promise<void> {
  const reply = ownerReply.trim() || undefined;
  const map = await readMap();
  let review = (map[shopId] ?? []).find((row) => row.id === reviewId);

  const supabase = getSupabase();
  if (supabase && isUuid(reviewId)) {
    const { data, error } = await supabase
      .from('shop_reviews')
      .update({ owner_reply: reply ?? null, updated_at: new Date().toISOString() })
      .eq('id', reviewId)
      .eq('shop_id', shopId)
      .select('*')
      .maybeSingle();

    if (!error && data) {
      const synced = mapReviewRow(data as ReviewRow);
      await upsertLocalReview(shopId, synced);
      review = synced;
    }
  } else {
    await patchLocalReview(shopId, reviewId, { ownerReply: reply });
    review = (await readMap())[shopId]?.find((row) => row.id === reviewId) ?? review;
  }

  if (reply && review?.customerId) {
    await pushCustomerNotification({
      customerId: review.customerId,
      customerPhone: '',
      kind: 'review_owner_reply',
      shopId,
      reviewId,
      ownerNote: reply,
    });
  }
}

export async function setReviewHiddenSynced(shopId: string, reviewId: string, hidden: boolean): Promise<void> {
  await patchLocalReview(shopId, reviewId, { hidden });

  const supabase = getSupabase();
  if (supabase && isUuid(reviewId)) {
    await supabase
      .from('shop_reviews')
      .update({ hidden, updated_at: new Date().toISOString() })
      .eq('id', reviewId)
      .eq('shop_id', shopId);
  }
}

export async function setReviewReportedSynced(
  shopId: string,
  reviewId: string,
  reported: boolean,
): Promise<void> {
  await patchLocalReview(shopId, reviewId, { reported });

  const supabase = getSupabase();
  if (supabase && isUuid(reviewId)) {
    await supabase
      .from('shop_reviews')
      .update({ reported, updated_at: new Date().toISOString() })
      .eq('id', reviewId)
      .eq('shop_id', shopId);
  }
}

export async function toggleReviewLikeSynced(
  shopId: string,
  reviewId: string,
  customerId: string,
): Promise<void> {
  const map = await readMap();
  let next: ShopReview | undefined;
  map[shopId] = (map[shopId] ?? []).map((row) => {
    if (row.id !== reviewId) return row;
    const liked = row.likedBy.includes(customerId);
    next = {
      ...row,
      likedBy: liked ? row.likedBy.filter((id) => id !== customerId) : [...row.likedBy, customerId],
      likes: liked ? Math.max(0, row.likes - 1) : row.likes + 1,
    };
    return next;
  });
  await writeMap(map);

  const supabase = getSupabase();
  if (supabase && isUuid(reviewId) && next) {
    await supabase
      .from('shop_reviews')
      .update({
        likes: next.likes,
        liked_by: next.likedBy,
        updated_at: new Date().toISOString(),
      })
      .eq('id', reviewId)
      .eq('shop_id', shopId);
  }
}
