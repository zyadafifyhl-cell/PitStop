import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { isCatalogReady, refreshCatalog } from '@/lib/booking/catalogRepository';

type ShopCatalogContextValue = {
  ready: boolean;
  reload: () => Promise<void>;
};

const ShopCatalogContext = createContext<ShopCatalogContextValue | null>(null);

export function ShopCatalogProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(isCatalogReady());

  const reload = useCallback(async () => {
    await refreshCatalog();
    setReady(isCatalogReady());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refreshCatalog();
      if (!cancelled) setReady(isCatalogReady());
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(() => ({ ready, reload }), [ready, reload]);

  return <ShopCatalogContext.Provider value={value}>{children}</ShopCatalogContext.Provider>;
}

export function useShopCatalog(): ShopCatalogContextValue {
  const ctx = useContext(ShopCatalogContext);
  if (!ctx) throw new Error('useShopCatalog must be used within ShopCatalogProvider');
  return ctx;
}
