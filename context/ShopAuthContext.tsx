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

import { registerShopOwner, type RegisterShopOwnerInput } from '@/lib/shop/ownerRegistrationRepository';
import {
  resolveShopSession,
  type AppStaffUser,
  type ShopStaffUser,
} from '@/lib/shop/shopStaffUser';
import type { Shop } from '@/lib/booking/types';
import { isStaffInviteLocked } from '@/lib/auth/staffInviteLock';
import { beginAuthMutation, endAuthMutation, isAuthMutationInProgress } from '@/lib/auth/authMutationLock';
import { getSupabase } from '@/lib/supabase/client';

export type ShopLoginResult =
  | 'ok'
  | 'ok_admin'
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'email_login_disabled'
  | 'shop_not_found'
  | 'pending_approval'
  | 'not_configured';

export type ShopRegisterResult =
  | 'ok'
  | 'email_taken'
  | 'weak_password'
  | 'invalid'
  | 'not_configured';

type ShopAuthContextValue = {
  ready: boolean;
  shop: Shop | null;
  staff: AppStaffUser | null;
  shopStaff: ShopStaffUser | null;
  isOwner: boolean;
  isBranchManager: boolean;
  isAdmin: boolean;
  isPendingOwner: boolean;
  busy: boolean;
  login: (email: string, password: string) => Promise<ShopLoginResult>;
  registerOwner: (input: RegisterShopOwnerInput) => Promise<ShopRegisterResult>;
  logout: () => Promise<void>;
};

const ShopAuthContext = createContext<ShopAuthContextValue | null>(null);

const SESSION_KEY = '@pitstop/shop-session';

async function persistSession(staff: AppStaffUser): Promise<void> {
  await AsyncStorage.setItem(SESSION_KEY, staff.email);
}

export function ShopAuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [shop, setShop] = useState<Shop | null>(null);
  const [staff, setStaff] = useState<AppStaffUser | null>(null);
  const [shopStaff, setShopStaff] = useState<ShopStaffUser | null>(null);
  const [busy, setBusy] = useState(false);
  const signingOutRef = useRef(false);

  const applySession = useCallback(async (userId: string, email: string) => {
    const resolved = await resolveShopSession(userId, email);
    if (resolved.staff) {
      setStaff(resolved.staff);
      setShopStaff(resolved.shopStaff);
      setShop(resolved.shop);
      await persistSession(resolved.staff);
      return resolved;
    }
    setShop(null);
    setStaff(null);
    setShopStaff(null);
    await AsyncStorage.removeItem(SESSION_KEY);
    return resolved;
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
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (signingOutRef.current || isStaffInviteLocked() || isAuthMutationInProgress()) return;
      // Defer Supabase calls — async work inside this callback deadlocks signInWithPassword.
      setTimeout(() => {
        if (isAuthMutationInProgress()) return;
        void (async () => {
          if (event === 'SIGNED_OUT' || !session?.user?.email || !session.user.id) {
            setShop(null);
            setStaff(null);
            setShopStaff(null);
            await AsyncStorage.removeItem(SESSION_KEY);
            return;
          }
          await applySession(session.user.id, session.user.email);
        })();
      }, 0);
    });
    return () => data.subscription.unsubscribe();
  }, [applySession]);

  const login = useCallback(async (email: string, password: string) => {
    beginAuthMutation();
    setBusy(true);
    try {
      const normalized = email.trim().toLowerCase();
      const supabase = getSupabase();
      if (!supabase) return 'not_configured';

      const authPromise = supabase.auth.signInWithPassword({
        email: normalized,
        password: password.trim(),
      });
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('timeout')), 20000);
      });

      const { data, error } = await Promise.race([authPromise, timeoutPromise]);
      if (error || !data.user?.email) {
        const message = error?.message.toLowerCase() ?? '';
        if (message.includes('email logins are disabled')) return 'email_login_disabled';
        if (message.includes('email not confirmed')) return 'email_not_confirmed';
        return 'invalid_credentials';
      }

      const resolved = await applySession(data.user.id, data.user.email);
      if (!resolved.staff) {
        await supabase.auth.signOut();
        return 'shop_not_found';
      }

      if (resolved.staff.role === 'pending_owner') {
        return 'pending_approval';
      }

      if (resolved.staff.role === 'admin') {
        return 'ok_admin';
      }

      if (!resolved.shop || !resolved.shopStaff) {
        await supabase.auth.signOut();
        return 'shop_not_found';
      }

      return 'ok';
    } catch (error) {
      if (error instanceof Error && error.message === 'timeout') return 'not_configured';
      return 'invalid_credentials';
    } finally {
      endAuthMutation();
      setBusy(false);
    }
  }, [applySession]);

  const registerOwner = useCallback(async (input: RegisterShopOwnerInput) => {
    beginAuthMutation();
    setBusy(true);
    try {
      const result = await registerShopOwner(input);
      if (result !== 'ok') return result;

      const supabase = getSupabase();
      const session = await supabase?.auth.getSession();
      const user = session?.data.session?.user;
      if (user?.email) {
        await applySession(user.id, user.email);
      }
      return 'ok';
    } finally {
      endAuthMutation();
      setBusy(false);
    }
  }, [applySession]);

  const logout = useCallback(async () => {
    signingOutRef.current = true;
    setShop(null);
    setStaff(null);
    setShopStaff(null);
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
      shopStaff,
      isOwner: staff?.role === 'owner',
      isBranchManager: staff?.role === 'branch_manager',
      isAdmin: staff?.role === 'admin',
      isPendingOwner: staff?.role === 'pending_owner',
      busy,
      login,
      registerOwner,
      logout,
    }),
    [ready, shop, staff, shopStaff, busy, login, registerOwner, logout],
  );

  return <ShopAuthContext.Provider value={value}>{children}</ShopAuthContext.Provider>;
}

export function useShopAuth(): ShopAuthContextValue {
  const ctx = useContext(ShopAuthContext);
  if (!ctx) throw new Error('useShopAuth must be used within ShopAuthProvider');
  return ctx;
}
