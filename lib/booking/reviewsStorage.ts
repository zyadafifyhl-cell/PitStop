import type { ShopReview } from '@/lib/booking/types';
import {
  addShopReviewSynced,
  fetchShopRatingSummariesRemote,
  getCustomerShopReviewSynced,
  listShopReviewsSynced,
  setReviewHiddenSynced,
  setReviewOwnerReplySynced,
  setReviewReportedSynced,
  toggleReviewLikeSynced,
} from '@/lib/booking/reviewRepository';

export async function listShopReviews(shopId: string): Promise<ShopReview[]> {
  return listShopReviewsSynced(shopId);
}

export async function getCustomerShopReview(
  shopId: string,
  customerId: string,
): Promise<ShopReview | null> {
  return getCustomerShopReviewSynced(shopId, customerId);
}

export async function addShopReview(input: {
  shopId: string;
  customerId?: string;
  customerName: string;
  rating: number;
  body: string;
}): Promise<ShopReview> {
  return addShopReviewSynced(input);
}

export async function toggleReviewLike(shopId: string, reviewId: string, customerId: string): Promise<void> {
  return toggleReviewLikeSynced(shopId, reviewId, customerId);
}

export async function setReviewOwnerReply(shopId: string, reviewId: string, ownerReply: string): Promise<void> {
  return setReviewOwnerReplySynced(shopId, reviewId, ownerReply);
}

export async function setReviewHidden(shopId: string, reviewId: string, hidden: boolean): Promise<void> {
  return setReviewHiddenSynced(shopId, reviewId, hidden);
}

export async function setReviewReported(shopId: string, reviewId: string, reported: boolean): Promise<void> {
  return setReviewReportedSynced(shopId, reviewId, reported);
}

export type ShopRatingSummary = { average: number | null; count: number };

/** Mirrors customer-facing Home / Shop Profile average — visible reviews only. */
export function computeShopRatingSummary(reviews: ShopReview[]): ShopRatingSummary {
  const visible = reviews.filter((row) => !row.hidden);
  if (!visible.length) return { average: null, count: 0 };
  const sum = visible.reduce((total, row) => total + row.rating, 0);
  return { average: sum / visible.length, count: visible.length };
}

export function formatReviewStarRow(rating: number, maxStars = 5): string {
  const clamped = Math.max(0, Math.min(maxStars, Math.round(rating)));
  return `${'★'.repeat(clamped)}${'☆'.repeat(maxStars - clamped)}`;
}

export async function getShopAverageRating(shopId: string): Promise<ShopRatingSummary> {
  const reviews = await listShopReviews(shopId);
  return computeShopRatingSummary(reviews);
}

export async function getShopAverageRatings(shopIds: string[]): Promise<Record<string, ShopRatingSummary>> {
  const unique = [...new Set(shopIds.filter(Boolean))];
  const summaries: Record<string, ShopRatingSummary> = {};
  for (const shopId of unique) summaries[shopId] = { average: null, count: 0 };
  if (!unique.length) return summaries;

  const remote = await fetchShopRatingSummariesRemote(unique);
  const missing: string[] = [];
  for (const shopId of unique) {
    const hit = remote[shopId];
    if (hit && hit.count > 0) {
      summaries[shopId] = hit;
    } else {
      missing.push(shopId);
    }
  }

  if (missing.length) {
    const localEntries = await Promise.all(
      missing.map(async (shopId) => {
        const reviews = await listShopReviews(shopId);
        return [shopId, computeShopRatingSummary(reviews)] as const;
      }),
    );
    for (const [shopId, summary] of localEntries) {
      if (summary.count > 0) summaries[shopId] = summary;
    }
  }

  return summaries;
}
