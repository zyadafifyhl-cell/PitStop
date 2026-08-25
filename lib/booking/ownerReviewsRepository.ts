import type { ShopReview } from '@/lib/booking/types';
import { listShopReviews } from '@/lib/booking/reviewsStorage';
import { getSupabase } from '@/lib/supabase/client';

export type OwnerShopReview = ShopReview & {
  reviewerEmail?: string;
  reviewerPhone?: string;
  serviceReference?: string;
  orderReference?: string;
};

type HistoryRow = {
  id: string;
  shop_id: string;
  user_id?: string | null;
  rating: number;
  comment: string;
  created_at: string;
  is_hidden: boolean;
  owner_reply?: string | null;
  owner_replied_at?: string | null;
  reported: boolean;
  reviewer_name: string;
  reviewer_email?: string | null;
  reviewer_phone?: string | null;
  service_reference?: string | null;
  order_reference?: string | null;
};

function mapHistoryRow(row: HistoryRow): OwnerShopReview {
  return {
    id: row.id,
    shopId: row.shop_id,
    customerId: row.user_id ?? undefined,
    customerName: row.reviewer_name,
    rating: row.rating,
    body: row.comment ?? '',
    likes: 0,
    likedBy: [],
    ownerReply: row.owner_reply ?? undefined,
    ownerRepliedAt: row.owner_replied_at ?? undefined,
    hidden: row.is_hidden,
    reported: row.reported,
    bookingId: undefined,
    storeOrderId: undefined,
    serviceReference: row.service_reference ?? undefined,
    orderReference: row.order_reference ?? undefined,
    reviewerEmail: row.reviewer_email ?? undefined,
    reviewerPhone: row.reviewer_phone ?? undefined,
    createdAt: row.created_at,
  };
}

function mapShopReview(row: ShopReview): OwnerShopReview {
  return { ...row };
}

/** Merchant-facing review history with optional user/booking/order metadata. */
export async function fetchShopReviewsHistory(shopId: string): Promise<OwnerShopReview[]> {
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase.rpc('get_shop_reviews_history', { p_shop_id: shopId });
    if (!error && Array.isArray(data)) {
      return (data as HistoryRow[]).map(mapHistoryRow);
    }
  }

  const fallback = await listShopReviews(shopId);
  return fallback.map(mapShopReview);
}

export type ReviewFilter = 'all' | 'positive' | 'critical' | 'needs_reply';
export type ReviewSort = 'newest' | 'highest' | 'lowest';

export type ReviewStats = {
  average: number | null;
  total: number;
  breakdown: Record<1 | 2 | 3 | 4 | 5, number>;
};

export function computeReviewStats(reviews: OwnerShopReview[]): ReviewStats {
  const breakdown: ReviewStats['breakdown'] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  let visibleCount = 0;

  for (const review of reviews) {
    const star = Math.max(1, Math.min(5, Math.round(review.rating))) as 1 | 2 | 3 | 4 | 5;
    breakdown[star] += 1;
    if (!review.hidden) {
      sum += review.rating;
      visibleCount += 1;
    }
  }

  return {
    average: visibleCount ? sum / visibleCount : null,
    total: reviews.length,
    breakdown,
  };
}

export function filterOwnerReviews(reviews: OwnerShopReview[], filter: ReviewFilter): OwnerShopReview[] {
  switch (filter) {
    case 'positive':
      return reviews.filter((row) => row.rating >= 4);
    case 'critical':
      return reviews.filter((row) => row.rating <= 3);
    case 'needs_reply':
      return reviews.filter((row) => !row.ownerReply?.trim());
    default:
      return reviews;
  }
}

export function sortOwnerReviews(reviews: OwnerShopReview[], sort: ReviewSort): OwnerShopReview[] {
  const rows = [...reviews];
  switch (sort) {
    case 'highest':
      return rows.sort((a, b) => b.rating - a.rating || b.createdAt.localeCompare(a.createdAt));
    case 'lowest':
      return rows.sort((a, b) => a.rating - b.rating || b.createdAt.localeCompare(a.createdAt));
    default:
      return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export function reviewerInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return trimmed.charAt(0).toUpperCase();
}
