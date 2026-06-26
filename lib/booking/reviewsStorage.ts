import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ShopReview } from '@/lib/booking/types';

const REVIEWS_KEY = '@pitstop/shop-reviews/v1';
type ReviewMap = Record<string, ShopReview[]>;

function nowIso(): string {
  return new Date().toISOString();
}

function id(): string {
  return `rev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

export async function listShopReviews(shopId: string): Promise<ShopReview[]> {
  const map = await readMap();
  return (map[shopId] ?? []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function addShopReview(input: {
  shopId: string;
  customerId?: string;
  customerName: string;
  rating: number;
  body: string;
}): Promise<ShopReview> {
  const map = await readMap();
  const row: ShopReview = {
    id: id(),
    shopId: input.shopId,
    customerId: input.customerId,
    customerName: input.customerName.trim(),
    rating: Math.max(1, Math.min(5, Math.round(input.rating))),
    body: input.body.trim(),
    likes: 0,
    likedBy: [],
    createdAt: nowIso(),
  };
  map[input.shopId] = [row, ...(map[input.shopId] ?? [])].slice(0, 100);
  await writeMap(map);
  return row;
}

export async function toggleReviewLike(shopId: string, reviewId: string, customerId: string): Promise<void> {
  const map = await readMap();
  map[shopId] = (map[shopId] ?? []).map((row) => {
    if (row.id !== reviewId) return row;
    const liked = row.likedBy.includes(customerId);
    return {
      ...row,
      likedBy: liked ? row.likedBy.filter((id) => id !== customerId) : [...row.likedBy, customerId],
      likes: liked ? Math.max(0, row.likes - 1) : row.likes + 1,
    };
  });
  await writeMap(map);
}

export async function setReviewOwnerReply(shopId: string, reviewId: string, ownerReply: string): Promise<void> {
  const map = await readMap();
  map[shopId] = (map[shopId] ?? []).map((row) =>
    row.id === reviewId ? { ...row, ownerReply: ownerReply.trim() || undefined } : row,
  );
  await writeMap(map);
}

export async function setReviewHidden(shopId: string, reviewId: string, hidden: boolean): Promise<void> {
  const map = await readMap();
  map[shopId] = (map[shopId] ?? []).map((row) => (row.id === reviewId ? { ...row, hidden } : row));
  await writeMap(map);
}

export async function setReviewReported(shopId: string, reviewId: string, reported: boolean): Promise<void> {
  const map = await readMap();
  map[shopId] = (map[shopId] ?? []).map((row) => (row.id === reviewId ? { ...row, reported } : row));
  await writeMap(map);
}

export function seedDemoReviews(shopId: string): ShopReview[] {
  return [
    {
      id: 'demo-rev-1',
      shopId,
      customerName: 'Ahmed',
      rating: 5,
      body: 'Excellent service.',
      likes: 12,
      likedBy: [],
      createdAt: nowIso(),
    },
    {
      id: 'demo-rev-2',
      shopId,
      customerName: 'Mohamed',
      rating: 4,
      body: 'Premium package is worth the price.',
      likes: 5,
      likedBy: [],
      createdAt: nowIso(),
    },
  ];
}
