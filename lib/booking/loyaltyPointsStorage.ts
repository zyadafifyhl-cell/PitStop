import AsyncStorage from '@react-native-async-storage/async-storage';

import { getShopById, listShopsByType } from '@/lib/booking/catalogRepository';
import { getAreaById } from '@/lib/booking/areas';
import type { Booking, BookingStatus, Shop, ShopType } from '@/lib/booking/types';

const POINTS_KEY = '@pitstop/loyalty_points/v1';
export const LOYALTY_POINTS_PER_DONE_BOOKING = 5;

export type MarketplaceReward = {
  id: string;
  pointsRequired: number;
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
  shopTypes: ShopType[];
};

export type MarketplacePartner = {
  shop: Shop;
  areaLabel: string;
  rewards: MarketplaceReward[];
};

type CustomerPointsState = {
  points: number;
  processedBookingIds: string[];
};

type PointsMap = Record<string, CustomerPointsState>;

export const MARKETPLACE_REWARDS: MarketplaceReward[] = [
  {
    id: 'interior-clean',
    pointsRequired: 15,
    titleEn: 'Free Interior Cleaning',
    titleAr: 'تنظيف داخلي مجاني',
    descriptionEn: 'Redeem at any participating wash for a complimentary interior clean.',
    descriptionAr: 'استبدل النقاط في أي مغسلة مشاركة للحصول على تنظيف داخلي مجاني.',
    shopTypes: ['wash'],
  },
  {
    id: 'premium-package',
    pointsRequired: 25,
    titleEn: 'Free Premium Package',
    titleAr: 'باقة Premium مجانية',
    descriptionEn: 'Full premium wash package at eligible partner locations.',
    descriptionAr: 'باقة غسيل Premium كاملة في المحلات المشاركة.',
    shopTypes: ['wash'],
  },
  {
    id: 'maintenance-check',
    pointsRequired: 20,
    titleEn: 'Free Inspection Check',
    titleAr: 'فحص مجاني',
    descriptionEn: 'Basic vehicle inspection at participating workshops.',
    descriptionAr: 'فحص أساسي للسيارة في ورش مشاركة.',
    shopTypes: ['maintenance'],
  },
];

function customerKey(customerId?: string, phone?: string): string | null {
  if (customerId?.trim()) return `id:${customerId.trim()}`;
  if (phone?.trim()) return `phone:${phone.trim()}`;
  return null;
}

function emptyState(): CustomerPointsState {
  return { points: 0, processedBookingIds: [] };
}

async function readMap(): Promise<PointsMap> {
  try {
    const raw = await AsyncStorage.getItem(POINTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as PointsMap) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeMap(map: PointsMap): Promise<void> {
  await AsyncStorage.setItem(POINTS_KEY, JSON.stringify(map));
}

export async function getLoyaltyPoints(input: {
  customerId?: string;
  phone?: string;
}): Promise<number> {
  const key = customerKey(input.customerId, input.phone);
  if (!key) return 0;
  const map = await readMap();
  return map[key]?.points ?? 0;
}

export type LoyaltyPointsResult = {
  pointsAdded: boolean;
  points: number;
};

/** Award 5 points when any booking transitions to done. Idempotent per booking id. */
export async function awardLoyaltyPointsOnDone(
  booking: Booking,
  previousStatus?: BookingStatus,
): Promise<LoyaltyPointsResult | null> {
  if (booking.status !== 'done') return null;
  if (previousStatus === 'done') return null;

  const key = customerKey(booking.customerId, booking.customerPhone);
  if (!key) return null;

  const map = await readMap();
  const state = map[key] ?? emptyState();

  if (state.processedBookingIds.includes(booking.id)) {
    return { pointsAdded: false, points: state.points };
  }

  state.processedBookingIds = [...state.processedBookingIds, booking.id].slice(-300);
  state.points += LOYALTY_POINTS_PER_DONE_BOOKING;
  map[key] = state;
  await writeMap(map);

  return { pointsAdded: true, points: state.points };
}

export async function syncLoyaltyPointsFromBookings(
  bookings: Booking[],
  input: { customerId?: string; phone?: string },
): Promise<LoyaltyPointsResult | null> {
  let last: LoyaltyPointsResult | null = null;
  const done = bookings
    .filter((b) => b.status === 'done')
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

  for (const booking of done) {
    const result = await awardLoyaltyPointsOnDone(booking, undefined);
    if (result?.pointsAdded) last = result;
  }

  if (!last && input.customerId) {
    const points = await getLoyaltyPoints(input);
    if (points > 0) return { pointsAdded: false, points };
  }

  return last;
}

function areaLabelForShop(shop: Shop, locale: 'en' | 'ar'): string {
  const area = getAreaById(shop.areaId);
  if (!area) return shop.address.split(',')[0]?.trim() || shop.areaId;
  return locale === 'ar' ? area.nameAr || area.name : area.name;
}

export function listMarketplacePartners(locale: 'en' | 'ar'): MarketplacePartner[] {
  const partners: MarketplacePartner[] = [];
  const types = new Set<ShopType>();
  for (const reward of MARKETPLACE_REWARDS) {
    for (const type of reward.shopTypes) types.add(type);
  }

  for (const type of types) {
    for (const shop of listShopsByType(type)) {
      const rewards = MARKETPLACE_REWARDS.filter((r) => r.shopTypes.includes(shop.type));
      if (!rewards.length) continue;
      partners.push({
        shop,
        areaLabel: areaLabelForShop(shop, locale),
        rewards,
      });
    }
  }

  return partners.sort((a, b) => {
    const nameA = locale === 'ar' ? a.shop.nameAr : a.shop.name;
    const nameB = locale === 'ar' ? b.shop.nameAr : b.shop.name;
    return nameA.localeCompare(nameB);
  });
}

export function shopDisplayWithArea(shopId: string, locale: 'en' | 'ar'): string {
  const shop = getShopById(shopId);
  if (!shop) return shopId;
  const name = locale === 'ar' ? shop.nameAr : shop.name;
  return `${name} — ${areaLabelForShop(shop, locale)}`;
}
