import { useCallback, useEffect, useMemo, useState } from 'react';

import { useDataChanges } from '@/lib/data/dataChanges';
import { EMPTY_SHOP_ANALYTICS, type ShopAnalytics, type ShopAnalyticsTimeframe } from '@/lib/posTypes';
import { currentMonthTimeframe, fetchShopAnalytics, rangeForAnalyticsTimeframe } from '@/lib/posRepository';
import { getSupabase } from '@/lib/supabase/client';

export function useShopAnalytics(
  shopId: string | undefined,
  timeframe: ShopAnalyticsTimeframe = currentMonthTimeframe(),
) {
  const range = useMemo(() => rangeForAnalyticsTimeframe(timeframe), [timeframe]);
  const isCurrentMonth = timeframe === currentMonthTimeframe();
  const [analytics, setAnalytics] = useState<ShopAnalytics>(EMPTY_SHOP_ANALYTICS);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!shopId) {
      setAnalytics(EMPTY_SHOP_ANALYTICS);
      return;
    }
    setLoading(true);
    try {
      const next = await fetchShopAnalytics(shopId, range.from.toISOString(), range.to.toISOString(), {
        allowFallbackRange: isCurrentMonth,
        allowDemo: timeframe === 'today' || isCurrentMonth,
      });
      setAnalytics(next);
    } finally {
      setLoading(false);
    }
  }, [shopId, range.from, range.to, timeframe, isCurrentMonth]);

  useDataChanges(['finance', 'bookings'], () => {
    void refresh();
  });

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase || !shopId) return;
    const channel = supabase
      .channel(`shop-analytics:${shopId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_orders', filter: `shop_id=eq.${shopId}` }, () => {
        void refresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shop_expenses', filter: `shop_id=eq.${shopId}` }, () => {
        void refresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employee_payroll_records', filter: `shop_id=eq.${shopId}` }, () => {
        void refresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_credits', filter: `shop_id=eq.${shopId}` }, () => {
        void refresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `shop_id=eq.${shopId}` }, () => {
        void refresh();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [shopId, refresh]);

  return { analytics, loading, refresh, range, timeframe };
}
