export type ShopSubscriptionTier = 'free' | 'pro' | 'enterprise';
export type ShopSubscriptionStatus = 'active' | 'expired' | 'trial';

export const FREE_ACTIVE_PRODUCT_CAP = 5;

export type ShopSubscriptionSnapshot = {
  tier: ShopSubscriptionTier;
  status: ShopSubscriptionStatus;
  expiresAt?: string | null;
  isPremiumFlag: boolean;
};

function parseTier(value: unknown, isPremiumFlag: boolean): ShopSubscriptionTier {
  if (value === 'pro' || value === 'enterprise' || value === 'free') return value;
  return isPremiumFlag ? 'pro' : 'free';
}

function parseStatus(value: unknown): ShopSubscriptionStatus {
  if (value === 'expired' || value === 'trial' || value === 'active') return value;
  return 'active';
}

export function snapshotFromShopRow(row: {
  is_premium?: boolean | null;
  subscription_tier?: string | null;
  subscription_status?: string | null;
  subscription_expires_at?: string | null;
}): ShopSubscriptionSnapshot {
  const isPremiumFlag = row.is_premium === true;
  return {
    tier: parseTier(row.subscription_tier, isPremiumFlag),
    status: parseStatus(row.subscription_status),
    expiresAt: row.subscription_expires_at,
    isPremiumFlag,
  };
}

export function isProSubscription(snapshot: ShopSubscriptionSnapshot): boolean {
  if (snapshot.expiresAt) {
    const expires = new Date(snapshot.expiresAt).getTime();
    if (Number.isFinite(expires) && expires < Date.now()) return false;
  }
  if (snapshot.status === 'expired') return false;
  const paidTier = snapshot.tier === 'pro' || snapshot.tier === 'enterprise';
  if (paidTier) return snapshot.status === 'active' || snapshot.status === 'trial';
  return snapshot.isPremiumFlag && (snapshot.status === 'active' || snapshot.status === 'trial');
}

export function displayTier(isPro: boolean): 'free' | 'pro' {
  return isPro ? 'pro' : 'free';
}
