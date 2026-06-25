import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { hydrateCatalogCache, isCatalogReady, refreshCatalog } from '@/lib/booking/catalogRepository';

type ShopCatalogContextValue = {
  /** True once local cache has been read (does not wait for network). */
  ready: boolean;
  /** True while a network refresh is in progress. */
  refreshing: boolean;
  /** Bumps when catalog data changes (cache hydrate or network refresh). */
  version: number;
  reload: () => Promise<void>;
};

const ShopCatalogContext = createContext<ShopCatalogContextValue | null>(null);

export function ShopCatalogProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(isCatalogReady());
  const [refreshing, setRefreshing] = useState(false);
  const [version, setVersion] = useState(0);

  const bumpVersion = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);

  const reload = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshCatalog();
      setReady(true);
      bumpVersion();
    } finally {
      setRefreshing(false);
    }
  }, [bumpVersion]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await hydrateCatalogCache();
      if (!cancelled) {
        setReady(true);
        if (isCatalogReady()) bumpVersion();
      }
      setRefreshing(true);
      try {
        await refreshCatalog();
        if (!cancelled) {
          setReady(true);
          bumpVersion();
        }
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bumpVersion]);

  const value = useMemo(() => ({ ready, refreshing, version, reload }), [ready, refreshing, version, reload]);

  return <ShopCatalogContext.Provider value={value}>{children}</ShopCatalogContext.Provider>;
}

export function useShopCatalog(): ShopCatalogContextValue {
  const ctx = useContext(ShopCatalogContext);
  if (!ctx) throw new Error('useShopCatalog must be used within ShopCatalogProvider');
  return ctx;
}
