import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Booking, BookingStatus } from '@/lib/booking/types';
import type { WashCouponDiscountType } from '@/lib/booking/wash/types';

const LOYALTY_KEY = '@pitstop/loyalty_stamps';
export const LOYALTY_STAMPS_GOAL = 5;

export type LoyaltyRewardCoupon = {
  id: string;
  code: string;
  discountType: WashCouponDiscountType;
  discountValue: number;
  issuedAt: string;
  expiresAt: string;
  redeemed: boolean;
};

type CustomerLoyaltyState = {
  stamps: number;
  processedBookingIds: string[];
  pendingReward: LoyaltyRewardCoupon | null;
  rewards: LoyaltyRewardCoupon[];
};

type LoyaltyMap = Record<string, CustomerLoyaltyState>;

function customerKey(customerId?: string, phone?: string): string | null {
  if (customerId?.trim()) return `id:${customerId.trim()}`;
  if (phone?.trim()) return `phone:${phone.trim()}`;
  return null;
}

function emptyState(): CustomerLoyaltyState {
  return { stamps: 0, processedBookingIds: [], pendingReward: null, rewards: [] };
}

async function readMap(): Promise<LoyaltyMap> {
  try {
    const raw = await AsyncStorage.getItem(LOYALTY_KEY);
    const parsed = raw ? (JSON.parse(raw) as LoyaltyMap) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeMap(map: LoyaltyMap): Promise<void> {
  await AsyncStorage.setItem(LOYALTY_KEY, JSON.stringify(map));
}

function generateRewardCoupon(): LoyaltyRewardCoupon {
  const now = new Date();
  const expires = new Date(now);
  expires.setDate(expires.getDate() + 90);
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return {
    id: `loyalty-reward-${Date.now()}`,
    code: `LOYAL-${suffix}`,
    discountType: 'percent',
    discountValue: 100,
    issuedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    redeemed: false,
  };
}

export async function getLoyaltyStamps(input: {
  customerId?: string;
  phone?: string;
}): Promise<number> {
  const key = customerKey(input.customerId, input.phone);
  if (!key) return 0;
  const map = await readMap();
  return map[key]?.stamps ?? 0;
}

export async function consumePendingLoyaltyReward(input: {
  customerId?: string;
  phone?: string;
}): Promise<LoyaltyRewardCoupon | null> {
  const key = customerKey(input.customerId, input.phone);
  if (!key) return null;
  const map = await readMap();
  const state = map[key] ?? emptyState();
  const reward = state.pendingReward;
  if (!reward) return null;
  state.pendingReward = null;
  map[key] = state;
  await writeMap(map);
  return reward;
}

export type LoyaltyStampResult = {
  stampAdded: boolean;
  stamps: number;
  rewardUnlocked: LoyaltyRewardCoupon | null;
};

/** Call when a wash booking transitions to done. Idempotent per booking id. */
export async function recordWashBookingDone(booking: Booking, previousStatus?: BookingStatus): Promise<LoyaltyStampResult | null> {
  if (booking.shopType !== 'wash') return null;
  if (booking.status !== 'done') return null;
  if (previousStatus === 'done') return null;

  const key = customerKey(booking.customerId, booking.customerPhone);
  if (!key) return null;

  const map = await readMap();
  const state = map[key] ?? emptyState();

  if (state.processedBookingIds.includes(booking.id)) {
    return { stampAdded: false, stamps: state.stamps, rewardUnlocked: null };
  }

  state.processedBookingIds = [...state.processedBookingIds, booking.id].slice(-200);
  state.stamps = Math.min(state.stamps + 1, LOYALTY_STAMPS_GOAL);

  let rewardUnlocked: LoyaltyRewardCoupon | null = null;
  if (state.stamps >= LOYALTY_STAMPS_GOAL) {
    rewardUnlocked = generateRewardCoupon();
    state.rewards = [rewardUnlocked, ...state.rewards].slice(0, 20);
    state.pendingReward = rewardUnlocked;
    state.stamps = 0;
  }

  map[key] = state;
  await writeMap(map);

  return {
    stampAdded: true,
    stamps: state.stamps,
    rewardUnlocked,
  };
}

/** Backfill stamps when bookings are loaded and a done wash was never processed. */
export async function syncLoyaltyFromBookings(
  bookings: Booking[],
  input: { customerId?: string; phone?: string },
): Promise<LoyaltyStampResult | null> {
  let lastResult: LoyaltyStampResult | null = null;
  const doneWash = bookings
    .filter((b) => b.shopType === 'wash' && b.status === 'done')
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

  for (const booking of doneWash) {
    const result = await recordWashBookingDone(booking, undefined);
    if (result?.rewardUnlocked) lastResult = result;
    else if (result?.stampAdded) lastResult = result;
  }

  return lastResult;
}
