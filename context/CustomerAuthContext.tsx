import * as Linking from 'expo-linking';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { isStrongPassword } from '@/lib/authValidation';
import {
  deleteCustomerAccountRemote,
  purgeCustomerLocalData,
  updateCustomerProfile,
} from '@/lib/account/customerAccountRepository';
import type { Customer } from '@/lib/booking/customers';
import {
  getShopByOwnerEmail,
  isShopStaffEmailRemote,
} from '@/lib/booking/catalogRepository';
import { normalizePhoneE164 } from '@/lib/phone';
import { beginAuthMutation, endAuthMutation, isAuthMutationInProgress } from '@/lib/auth/authMutationLock';
import { tabAuthStorage } from '@/lib/storage/webTabAuthStorage';
import { getSupabase } from '@/lib/supabase/client';
import { signOutCurrentTab } from '@/lib/supabase/webTabAuthIsolation';

const SESSION_KEY = '@pitstop/customer-session';
const GUEST_KEY = '@pitstop/guest-session';
type LoginResult = 'ok' | 'invalid' | 'email_not_confirmed' | 'email_login_disabled' | 'not_configured';
type RegisterResult = 'ok' | 'check_email' | 'email_taken' | 'invalid' | 'weak_password' | 'not_configured';
type UpdateProfileResult = 'ok' | 'invalid' | 'not_configured' | 'email_taken' | 'weak_password';
type DeleteAccountResult = 'ok' | 'invalid' | 'not_configured';

type CustomerAuthContextValue = {
  ready: boolean;
  customer: Customer | null;
  isGuest: boolean;
  /** True while Supabase has an active session (even before customer profile resolves). */
  hasSession: boolean;
  busy: boolean;
  continueAsGuest: () => Promise<void>;
  login: (email: string, password: string) => Promise<LoginResult>;
  register: (input: {
    name: string;
    email: string;
    phone: string;
    password: string;
  }) => Promise<RegisterResult>;
  resetPassword: (email: string) => Promise<'ok' | 'invalid' | 'not_configured'>;
  verifyPassword: (password: string) => Promise<'ok' | 'invalid' | 'not_configured'>;
  updateProfile: (input: {
    name: string;
    email: string;
    phone: string;
    password?: string;
  }) => Promise<UpdateProfileResult>;
  deleteAccount: () => Promise<DeleteAccountResult>;
  logout: () => Promise<void>;
};

const CustomerAuthContext = createContext<CustomerAuthContextValue | null>(null);

export function CustomerAuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [busy, setBusy] = useState(false);
  const signingOutRef = useRef(false);

  type AuthUser = {
    id: string;
    email?: string;
    email_confirmed_at?: string | null;
    user_metadata?: Record<string, unknown>;
  };

  const customerFromUser = useCallback((user: AuthUser, skipOwnerCheck = false): Customer | null => {
    if (!user.email || !user.email_confirmed_at) return null;
    if (!skipOwnerCheck && getShopByOwnerEmail(user.email)) return null;
    const metadata = user.user_metadata ?? {};
    const name = typeof metadata.name === 'string' && metadata.name.trim() ? metadata.name.trim() : user.email;
    const phone = typeof metadata.phone === 'string' ? metadata.phone : '';
    return {
      id: user.id,
      email: user.email,
      name,
      phone,
      password: '',
    };
  }, []);

  const resolveCustomerFromUser = useCallback(
    async (user: AuthUser): Promise<Customer | null> => {
      if (!user.email || !user.email_confirmed_at) return null;
      if (await isShopStaffEmailRemote(user.email)) return null;
      return customerFromUser(user, true);
    },
    [customerFromUser],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = getSupabase();
        if (supabase) {
          const { data } = await supabase.auth.getSession();
          const user = data.session?.user;
          setHasSession(!!user);
          const match = user ? await resolveCustomerFromUser(user) : null;
          if (!cancelled) {
            setCustomer(match);
            if (match) {
              setIsGuest(false);
              await tabAuthStorage.removeItem(GUEST_KEY);
            } else {
              setIsGuest(false);
              await tabAuthStorage.removeItem(GUEST_KEY);
            }
          }
        } else {
          setHasSession(false);
          await tabAuthStorage.removeItem(SESSION_KEY);
          if (!cancelled) {
            setIsGuest(false);
            await tabAuthStorage.removeItem(GUEST_KEY);
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
  }, [resolveCustomerFromUser]);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (signingOutRef.current || isAuthMutationInProgress()) return;
      // Defer Supabase calls — async work inside this callback deadlocks signInWithPassword.
      setTimeout(() => {
        if (isAuthMutationInProgress()) return;
        void (async () => {
          setHasSession(!!session?.user);
          const match = session?.user ? await resolveCustomerFromUser(session.user) : null;
          setCustomer(match);
          if (match) {
            setIsGuest(false);
            tabAuthStorage.removeItem(GUEST_KEY).catch(() => {});
          }
        })();
      }, 0);
    });
    return () => data.subscription.unsubscribe();
  }, [resolveCustomerFromUser]);

  const continueAsGuest = useCallback(async () => {
    setCustomer(null);
    setHasSession(false);
    setIsGuest(true);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    beginAuthMutation();
    setBusy(true);
    try {
      const supabase = getSupabase();
      if (!supabase) return 'not_configured';

      const authPromise = supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('timeout')), 20000);
      });

      const { data, error } = await Promise.race([authPromise, timeoutPromise]);
      if (error) {
        const message = error.message.toLowerCase();
        if (message.includes('email logins are disabled')) return 'email_login_disabled';
        if (message.includes('email not confirmed')) return 'email_not_confirmed';
        return 'invalid';
      }
      const match = data.user ? await resolveCustomerFromUser(data.user) : null;
      if (!match) {
        await supabase.auth.signOut();
        if (data.user && !data.user.email_confirmed_at) return 'email_not_confirmed';
        return 'invalid';
      }
      await tabAuthStorage.setItem(SESSION_KEY, match.id);
      await tabAuthStorage.removeItem(GUEST_KEY);
      setIsGuest(false);
      setHasSession(true);
      setCustomer(match);
      return 'ok';
    } catch (error) {
      if (error instanceof Error && error.message === 'timeout') return 'not_configured';
      return 'invalid';
    } finally {
      endAuthMutation();
      setBusy(false);
    }
  }, [customerFromUser, resolveCustomerFromUser]);

  const register = useCallback(
    async (input: { name: string; email: string; phone: string; password: string }) => {
      beginAuthMutation();
      setBusy(true);
      try {
        const supabase = getSupabase();
        if (!supabase) return 'not_configured';
        const name = input.name.trim();
        const email = input.email.trim().toLowerCase();
        const phone = normalizePhoneE164(input.phone);
        if (!name || !email.includes('@') || !phone) return 'invalid';
        if (!isStrongPassword(input.password)) return 'weak_password';

        const { data, error } = await supabase.auth.signUp({
          email,
          password: input.password,
          options: {
            data: { name, phone },
            emailRedirectTo: Linking.createURL('/welcome'),
          },
        });
        if (error) {
          const message = error.message.toLowerCase();
          if (message.includes('already') || message.includes('registered')) return 'email_taken';
          return 'invalid';
        }
        if (data.user?.identities && data.user.identities.length === 0) return 'email_taken';
        if (data.session?.user) {
          const match = customerFromUser(data.session.user);
          if (match) {
            await tabAuthStorage.setItem(SESSION_KEY, match.id);
            await tabAuthStorage.removeItem(GUEST_KEY);
            setIsGuest(false);
            setHasSession(true);
            setCustomer(match);
            return 'ok';
          }
          await supabase.auth.signOut();
        }
        return 'check_email';
      } catch {
        return 'invalid';
      } finally {
        endAuthMutation();
        setBusy(false);
      }
    },
    [customerFromUser],
  );

  const resetPassword = useCallback(
    async (email: string) => {
      try {
        const normalized = email.trim().toLowerCase();
        if (!normalized.includes('@')) return 'invalid';
        const supabase = getSupabase();
        if (!supabase) return 'not_configured';
        const { error } = await supabase.auth.resetPasswordForEmail(normalized, {
          redirectTo: Linking.createURL('/reset-password'),
        });
        return error ? 'invalid' : 'ok';
      } catch {
        return 'invalid';
      }
    },
    [],
  );

  const verifyPassword = useCallback(
    async (password: string) => {
      try {
        const email = customer?.email?.trim().toLowerCase();
        if (!email || !password.trim()) return 'invalid';
        const supabase = getSupabase();
        if (!supabase) return 'not_configured';
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return error ? 'invalid' : 'ok';
      } catch {
        return 'invalid';
      }
    },
    [customer?.email],
  );

  const updateProfile = useCallback(
    async (input: { name: string; email: string; phone: string; password?: string }) => {
      if (!customer?.id) return 'invalid';
      if (input.password?.trim() && !isStrongPassword(input.password)) return 'weak_password';
      const result = await updateCustomerProfile({
        userId: customer.id,
        name: input.name,
        email: input.email,
        phone: input.phone,
        password: input.password,
      });
      if (result !== 'ok') return result;

      const supabase = getSupabase();
      if (supabase) {
        const { data } = await supabase.auth.getUser();
        if (data.user) {
          const match = await resolveCustomerFromUser(data.user);
          if (match) setCustomer(match);
        }
      }
      return 'ok';
    },
    [customer?.id, resolveCustomerFromUser],
  );

  const logout = useCallback(async () => {
    signingOutRef.current = true;
    setCustomer(null);
    setIsGuest(false);
    setHasSession(false);
    try {
      await tabAuthStorage.multiRemove([SESSION_KEY, GUEST_KEY]);
      const supabase = getSupabase();
      if (supabase) await signOutCurrentTab(supabase.auth.signOut.bind(supabase.auth));
    } finally {
      signingOutRef.current = false;
    }
  }, []);

  const deleteAccount = useCallback(async () => {
    if (!customer?.id) return 'invalid';
    const result = await deleteCustomerAccountRemote();
    if (result !== 'ok') return result;
    await purgeCustomerLocalData(customer.id, customer.phone);
    await logout();
    return 'ok';
  }, [customer?.id, customer?.phone, logout]);

  const value = useMemo(
    () => ({
      ready,
      customer,
      isGuest,
      hasSession,
      busy,
      continueAsGuest,
      login,
      register,
      resetPassword,
      verifyPassword,
      updateProfile,
      deleteAccount,
      logout,
    }),
    [ready, customer, isGuest, hasSession, busy, continueAsGuest, login, register, resetPassword, verifyPassword, updateProfile, deleteAccount, logout],
  );

  return <CustomerAuthContext.Provider value={value}>{children}</CustomerAuthContext.Provider>;
}

export function useCustomerAuth(): CustomerAuthContextValue {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) throw new Error('useCustomerAuth must be used within CustomerAuthProvider');
  return ctx;
}
