import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { isStrongPassword } from '@/lib/authValidation';
import type { Customer } from '@/lib/booking/customers';
import { normalizePhoneE164 } from '@/lib/phone';
import { getSupabase } from '@/lib/supabase/client';

const SESSION_KEY = '@pitstop/customer-session';
const GUEST_KEY = '@pitstop/guest-session';
type LoginResult = 'ok' | 'invalid' | 'email_not_confirmed' | 'not_configured';
type RegisterResult = 'ok' | 'check_email' | 'email_taken' | 'invalid' | 'weak_password' | 'not_configured';

type CustomerAuthContextValue = {
  ready: boolean;
  customer: Customer | null;
  isGuest: boolean;
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
  logout: () => Promise<void>;
};

const CustomerAuthContext = createContext<CustomerAuthContextValue | null>(null);

export function CustomerAuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [busy, setBusy] = useState(false);

  const customerFromUser = useCallback((user: {
    id: string;
    email?: string;
    email_confirmed_at?: string | null;
    user_metadata?: Record<string, unknown>;
  }): Customer | null => {
    if (!user.email || !user.email_confirmed_at) return null;
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = getSupabase();
        if (supabase) {
          const { data } = await supabase.auth.getSession();
          const user = data.session?.user;
          const match = user ? customerFromUser(user) : null;
          if (!cancelled) {
            setCustomer(match);
            if (match) {
              setIsGuest(false);
              await AsyncStorage.removeItem(GUEST_KEY);
            } else {
              const guestSession = await AsyncStorage.getItem(GUEST_KEY);
              setIsGuest(guestSession === '1');
            }
          }
        } else {
          await AsyncStorage.removeItem(SESSION_KEY);
          if (!cancelled) {
            const guestSession = await AsyncStorage.getItem(GUEST_KEY);
            setIsGuest(guestSession === '1');
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
  }, [customerFromUser]);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const match = session?.user ? customerFromUser(session.user) : null;
      setCustomer(match);
      if (match) {
        setIsGuest(false);
        AsyncStorage.removeItem(GUEST_KEY).catch(() => {});
      }
    });
    return () => data.subscription.unsubscribe();
  }, [customerFromUser]);

  const continueAsGuest = useCallback(async () => {
    setCustomer(null);
    setIsGuest(true);
    await AsyncStorage.setItem(GUEST_KEY, '1');
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setBusy(true);
    try {
      const supabase = getSupabase();
      if (!supabase) return 'not_configured';
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) {
        const message = error.message.toLowerCase();
        if (message.includes('email not confirmed')) return 'email_not_confirmed';
        return 'invalid';
      }
      const match = data.user ? customerFromUser(data.user) : null;
      if (!match) {
        await supabase.auth.signOut();
        return 'email_not_confirmed';
      }
      await AsyncStorage.setItem(SESSION_KEY, match.id);
      await AsyncStorage.removeItem(GUEST_KEY);
      setIsGuest(false);
      setCustomer(match);
      return 'ok';
    } catch {
      return 'invalid';
    } finally {
      setBusy(false);
    }
  }, [customerFromUser]);

  const register = useCallback(
    async (input: { name: string; email: string; phone: string; password: string }) => {
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
            await AsyncStorage.setItem(SESSION_KEY, match.id);
            await AsyncStorage.removeItem(GUEST_KEY);
            setIsGuest(false);
            setCustomer(match);
            return 'ok';
          }
          await supabase.auth.signOut();
        }
        return 'check_email';
      } catch {
        return 'invalid';
      } finally {
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

  const logout = useCallback(async () => {
    await AsyncStorage.removeItem(SESSION_KEY);
    await AsyncStorage.removeItem(GUEST_KEY);
    await getSupabase()?.auth.signOut();
    setCustomer(null);
    setIsGuest(false);
  }, []);

  const value = useMemo(
    () => ({ ready, customer, isGuest, busy, continueAsGuest, login, register, resetPassword, verifyPassword, logout }),
    [ready, customer, isGuest, busy, continueAsGuest, login, register, resetPassword, verifyPassword, logout],
  );

  return <CustomerAuthContext.Provider value={value}>{children}</CustomerAuthContext.Provider>;
}

export function useCustomerAuth(): CustomerAuthContextValue {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) throw new Error('useCustomerAuth must be used within CustomerAuthProvider');
  return ctx;
}
