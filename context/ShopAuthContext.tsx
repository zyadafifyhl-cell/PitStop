import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { authenticateShopOwner, getShopByOwnerEmail } from '@/lib/booking/demoShops';
import type { Shop } from '@/lib/booking/types';

const SESSION_KEY = '@pitstop/shop-session';

type ShopAuthContextValue = {
  ready: boolean;
  shop: Shop | null;
  busy: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
};

const ShopAuthContext = createContext<ShopAuthContextValue | null>(null);

export function ShopAuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [shop, setShop] = useState<Shop | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(SESSION_KEY);
        if (!cancelled && saved) {
          const match = getShopByOwnerEmail(saved);
          if (match) setShop(match);
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setBusy(true);
    try {
      const match = authenticateShopOwner(email, password);
      if (!match) return false;
      await AsyncStorage.setItem(SESSION_KEY, match.ownerEmail);
      setShop(match);
      return true;
    } finally {
      setBusy(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await AsyncStorage.removeItem(SESSION_KEY);
    setShop(null);
  }, []);

  const value = useMemo(
    () => ({ ready, shop, busy, login, logout }),
    [ready, shop, busy, login, logout],
  );

  return <ShopAuthContext.Provider value={value}>{children}</ShopAuthContext.Provider>;
}

export function useShopAuth(): ShopAuthContextValue {
  const ctx = useContext(ShopAuthContext);
  if (!ctx) throw new Error('useShopAuth must be used within ShopAuthProvider');
  return ctx;
}
