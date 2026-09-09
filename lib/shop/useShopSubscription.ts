import { useCallback, useEffect, useMemo, useState } from 'react';

import { useShopAuth } from '@/context/ShopAuthContext';
import {
  displayTier,
  isProSubscription,
  snapshotFromShopRow,
  type ShopSubscriptionSnapshot,
} from '@/lib/shop/subscription';
import { getSupabase } from '@/lib/supabase/client';

export type ShopSubscriptionState = {
  isPro: boolean;
  tier: 'free' | 'pro';
  status: ShopSubscriptionSnapshot['status'];
  loading: boolean;
  refresh: () => Promise<void>;
};

export function useShopSubscription(shopId?: string): ShopSubscriptionState {
  const { shop } = useShopAuth();
  const targetId = shopId?.trim() || shop?.id;
  const [remote, setRemote] = useState<ShopSubscriptionSnapshot | null>(null);
  const [loading, setLoading] = useState(!!targetId);

  const load = useCallback(async () => {
    if (!targetId) {
      setRemote(null);
      setLoading(false);
      return;
    }
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('shops')
      .select('is_premium, subscription_tier, subscription_status, subscription_expires_at')
      .eq('id', targetId)
      .maybeSingle();
    if (!error && data) {
      setRemote(snapshotFromShopRow(data));
    }
    setLoading(false);
  }, [targetId]);

  useEffect(() => {
    void load();
  }, [load]);

  const snapshot = useMemo<ShopSubscriptionSnapshot>(() => {
    if (remote) return remote;
    return {
      tier: shop?.subscriptionTier ?? (shop?.isPremium ? 'pro' : 'free'),
      status: shop?.subscriptionStatus ?? 'active',
      expiresAt: shop?.subscriptionExpiresAt,
      isPremiumFlag: shop?.isPremium === true,
    };
  }, [remote, shop]);

  const isPro = isProSubscription(snapshot);

  return {
    isPro,
    tier: displayTier(isPro),
    status: snapshot.status,
    loading,
    refresh: load,
  };
}
