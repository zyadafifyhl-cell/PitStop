import type { ShopReview } from '@/lib/booking/types';
import {
  addShopReviewSynced,
  listShopReviewsSynced,
  setReviewHiddenSynced,
  setReviewOwnerReplySynced,
  setReviewReportedSynced,
  toggleReviewLikeSynced,
} from '@/lib/booking/reviewRepository';

export async function listShopReviews(shopId: string): Promise<ShopReview[]> {
  return listShopReviewsSynced(shopId);
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
