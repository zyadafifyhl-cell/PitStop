import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  getShopByOwnerEmail,
  hydrateCatalogCache,
  isCatalogReady,
  refreshCatalog,
} from '@/lib/booking/catalogRepository';
import type { Shop } from '@/lib/booking/types';
import { getSupabase } from '@/lib/supabase/client';

export type ShopLoginResult =
  | 'ok'
  | 'invalid_credentials'
  | 'shop_not_found'
  | 'not_configured';

type ShopAuthContextValue = {
  ready: boolean;
  shop: Shop | null;
  busy: boolean;
  login: (email: string, password: string) => Promise<ShopLoginResult>;
  logout: () => Promise<void>;
};

const ShopAuthContext = createContext<ShopAuthContextValue | null>(null);

async function resolveShopForEmail(email: string): Promise<Shop | null> {
  if (!isCatalogReady()) {
    await hydrateCatalogCache();
  }
  if (!isCatalogReady()) {
    await refreshCatalog();
  }
  return getShopByOwnerEmail(email) ?? null;
}

export function ShopAuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [shop, setShop] = useState<Shop | null>(null);
  const [busy, setBusy] = useState(false);
  const signingOutRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = getSupabase();
        if (supabase) {
          const { data } = await supabase.auth.getSession();
          const email = data.session?.user?.email;
          if (email) {
            const match = await resolveShopForEmail(email);
            if (match && !cancelled) {
              setShop(match);
              await AsyncStorage.setItem('@pitstop/shop-session', match.ownerEmail);
            }
          }
        } else {
          const saved = await AsyncStorage.getItem('@pitstop/shop-session');
          if (saved) {
            if (!isCatalogReady()) await hydrateCatalogCache();
            const match = getShopByOwnerEmail(saved);
            if (match && !cancelled) setShop(match);
          }
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

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (signingOutRef.current) return;
      if (event === 'SIGNED_OUT' || !session?.user?.email) {
        setShop(null);
        await AsyncStorage.removeItem('@pitstop/shop-session');
        return;
      }
      const match = await resolveShopForEmail(session.user.email);
      if (match) {
        setShop(match);
        await AsyncStorage.setItem('@pitstop/shop-session', match.ownerEmail);
      } else {
        setShop(null);
        await AsyncStorage.removeItem('@pitstop/shop-session');
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setBusy(true);
    try {
      const normalized = email.trim().toLowerCase();
      const supabase = getSupabase();
      if (!supabase) return 'not_configured';

      const { error } = await supabase.auth.signInWithPassword({
        email: normalized,
        password: password.trim(),
      });
      if (error) return 'invalid_credentials';

      const match = await resolveShopForEmail(normalized);
      if (!match) {
        await supabase.auth.signOut();
        return 'shop_not_found';
      }

      await AsyncStorage.setItem('@pitstop/shop-session', match.ownerEmail);
      setShop(match);
      return 'ok';
    } finally {
      setBusy(false);
    }
  }, []);

  const logout = useCallback(async () => {
    signingOutRef.current = true;
    setShop(null);
    try {
      await AsyncStorage.removeItem('@pitstop/shop-session');
      await getSupabase()?.auth.signOut();
    } finally {
      signingOutRef.current = false;
    }
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
