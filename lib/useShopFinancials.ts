import { useCallback, useEffect, useMemo, useState } from 'react';

import { EMPTY_SHOP_FINANCIALS, type ShopFinancials } from '@/lib/posTypes';
import { fetchShopFinancials } from '@/lib/posRepository';

export type ShopFinancialsRange = {
  from: Date;
  to: Date;
};

function startOfMonth(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function startOfNextMonth(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0);
}

export function useShopFinancials(shopId: string | undefined, dateRange?: ShopFinancialsRange) {
  const range = useMemo(
    () => dateRange ?? { from: startOfMonth(), to: startOfNextMonth() },
    [dateRange],
  );
  const [financials, setFinancials] = useState<ShopFinancials>(EMPTY_SHOP_FINANCIALS);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!shopId) {
      setFinancials(EMPTY_SHOP_FINANCIALS);
      return;
    }
    setLoading(true);
    try {
      const next = await fetchShopFinancials(shopId, range.from.toISOString(), range.to.toISOString());
      setFinancials(next);
    } finally {
      setLoading(false);
    }
  }, [shopId, range.from, range.to]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { financials, loading, refresh, range };
}
