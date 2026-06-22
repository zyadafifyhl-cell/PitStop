import type { Session } from '@supabase/supabase-js';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import * as garageSync from '@/lib/garageSync';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';

type AuthContextValue = {
  configured: boolean;
  ready: boolean;
  session: Session | null;
  phoneBusy: boolean;
  sendOtp: (phoneE164: string) => Promise<void>;
  verifyOtp: (phoneE164: string, token: string, displayName?: string | null) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const configured = useMemo(() => isSupabaseConfigured(), []);
  const sb = useMemo(() => getSupabase(), []);

  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [phoneBusy, setPhoneBusy] = useState(false);

  useEffect(() => {
    if (!sb) {
      setReady(true);
      return;
    }
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setReady(true);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => sub.subscription.unsubscribe();
  }, [sb]);

  useEffect(() => {
    if (!sb || !session?.user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const pulled = await garageSync.downloadGarageSnapshot(session.user.id);
        if (!cancelled && !pulled) await garageSync.uploadGarageSnapshot(session.user.id);
      } catch (e) {
        console.warn('Garage cloud sync after sign-in:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sb, session?.user?.id]);

  const sendOtp = useCallback(
    async (phoneE164: string) => {
      if (!sb) throw new Error('Cloud auth is not configured');
      setPhoneBusy(true);
      try {
        const { error } = await sb.auth.signInWithOtp({
          phone: phoneE164,
          options: { shouldCreateUser: true },
        });
        if (error) throw error;
      } finally {
        setPhoneBusy(false);
      }
    },
    [sb],
  );

  const verifyOtp = useCallback(
    async (phoneE164: string, token: string, displayName?: string | null) => {
      if (!sb) throw new Error('Cloud auth is not configured');
      setPhoneBusy(true);
      try {
        const { data, error } = await sb.auth.verifyOtp({
          phone: phoneE164,
          token,
          type: 'sms',
        });
        if (error) throw error;
        const trimmed = displayName?.trim();
        if (trimmed && data.user) {
          const { error: metaErr } = await sb.auth.updateUser({
            data: { full_name: trimmed },
          });
          if (metaErr) console.warn('Saving display name:', metaErr);
          const { error: profErr } = await sb.from('profiles').upsert(
            {
              id: data.user.id,
              display_name: trimmed,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'id' },
          );
          if (profErr) console.warn('profiles row:', profErr);
        }
      } finally {
        setPhoneBusy(false);
      }
    },
    [sb],
  );

  const signOut = useCallback(async () => {
    if (!sb) return;
    await sb.auth.signOut();
  }, [sb]);

  const value = useMemo(
    () => ({
      configured,
      ready,
      session,
      phoneBusy,
      sendOtp,
      verifyOtp,
      signOut,
    }),
    [configured, ready, session, phoneBusy, sendOtp, verifyOtp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
