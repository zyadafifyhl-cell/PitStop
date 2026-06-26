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

import type { Shop } from '@/lib/booking/types';
import { resolveShopSession, type ShopStaffUser } from '@/lib/shop/shopStaffUser';
import { isStaffInviteLocked } from '@/lib/auth/staffInviteLock';
import { getSupabase } from '@/lib/supabase/client';

export type ShopLoginResult =
  | 'ok'
  | 'invalid_credentials'
  | 'shop_not_found'
  | 'not_configured';

type ShopAuthContextValue = {
  ready: boolean;
  shop: Shop | null;
  staff: ShopStaffUser | null;
  isOwner: boolean;
  isBranchManager: boolean;
  busy: boolean;
  login: (email: string, password: string) => Promise<ShopLoginResult>;
  logout: () => Promise<void>;
};

const ShopAuthContext = createContext<ShopAuthContextValue | null>(null);

const SESSION_KEY = '@pitstop/shop-session';

async function persistSession(staff: ShopStaffUser): Promise<void> {
  await AsyncStorage.setItem(SESSION_KEY, staff.email);
}

export function ShopAuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [shop, setShop] = useState<Shop | null>(null);
  const [staff, setStaff] = useState<ShopStaffUser | null>(null);
  const [busy, setBusy] = useState(false);
  const signingOutRef = useRef(false);

  const applySession = useCallback(async (userId: string, email: string) => {
    const resolved = await resolveShopSession(userId, email);
    if (resolved.shop && resolved.staff) {
      setShop(resolved.shop);
      setStaff(resolved.staff);
      await persistSession(resolved.staff);
      return true;
    }
    setShop(null);
    setStaff(null);
    await AsyncStorage.removeItem(SESSION_KEY);
    return false;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = getSupabase();
        if (supabase) {
          const { data } = await supabase.auth.getSession();
          const user = data.session?.user;
          if (user?.email && user.id) {
            await applySession(user.id, user.email);
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
  }, [applySession]);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (signingOutRef.current || isStaffInviteLocked()) return;
      if (event === 'SIGNED_OUT' || !session?.user?.email || !session.user.id) {
        setShop(null);
        setStaff(null);
        await AsyncStorage.removeItem(SESSION_KEY);
        return;
      }
      await applySession(session.user.id, session.user.email);
    });
    return () => data.subscription.unsubscribe();
  }, [applySession]);

  const login = useCallback(async (email: string, password: string) => {
    setBusy(true);
    try {
      const normalized = email.trim().toLowerCase();
      const supabase = getSupabase();
      if (!supabase) return 'not_configured';

      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalized,
        password: password.trim(),
      });
      if (error || !data.user?.email) return 'invalid_credentials';

      const ok = await applySession(data.user.id, data.user.email);
      if (!ok) {
        await supabase.auth.signOut();
        return 'shop_not_found';
      }

      return 'ok';
    } finally {
      setBusy(false);
    }
  }, [applySession]);

  const logout = useCallback(async () => {
    signingOutRef.current = true;
    setShop(null);
    setStaff(null);
    try {
      await AsyncStorage.removeItem(SESSION_KEY);
      await getSupabase()?.auth.signOut();
    } finally {
      signingOutRef.current = false;
    }
  }, []);

  const value = useMemo(
    () => ({
      ready,
      shop,
      staff,
      isOwner: staff?.role === 'owner',
      isBranchManager: staff?.role === 'branch_manager',
      busy,
      login,
      logout,
    }),
    [ready, shop, staff, busy, login, logout],
  );

  return <ShopAuthContext.Provider value={value}>{children}</ShopAuthContext.Provider>;
}

export function useShopAuth(): ShopAuthContextValue {
  const ctx = useContext(ShopAuthContext);
  if (!ctx) throw new Error('useShopAuth must be used within ShopAuthProvider');
  return ctx;
}
