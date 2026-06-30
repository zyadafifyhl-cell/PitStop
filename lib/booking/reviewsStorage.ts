import type { ShopReview } from '@/lib/booking/types';
import {
  addShopReviewSynced,
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

export async function getShopAverageRating(shopId: string): Promise<ShopRatingSummary> {
  const reviews = (await listShopReviews(shopId)).filter((row) => !row.hidden);
  if (!reviews.length) return { average: null, count: 0 };
  const sum = reviews.reduce((total, row) => total + row.rating, 0);
  return { average: sum / reviews.length, count: reviews.length };
}

export async function getShopAverageRatings(shopIds: string[]): Promise<Record<string, ShopRatingSummary>> {
  const unique = [...new Set(shopIds.filter(Boolean))];
  const entries = await Promise.all(
    unique.map(async (shopId) => [shopId, await getShopAverageRating(shopId)] as const),
  );
  return Object.fromEntries(entries);
}

export function seedDemoReviews(shopId: string): ShopReview[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'demo-rev-1',
      shopId,
      customerName: 'Ahmed',
      rating: 5,
      body: 'Excellent service.',
      likes: 12,
      likedBy: [],
      createdAt: now,
    },
    {
      id: 'demo-rev-2',
      shopId,
      customerName: 'Mohamed',
      rating: 4,
      body: 'Premium package is worth the price.',
      likes: 5,
      likedBy: [],
      createdAt: now,
    },
  ];
}
