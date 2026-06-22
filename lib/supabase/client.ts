import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

import { supabaseAuthStorage } from '@/lib/supabase/authStorage';

let singleton: SupabaseClient | null = null;

const FALLBACK_SUPABASE_URL = 'https://qlopvpyeawauepsyrirz.supabase.co';
const FALLBACK_SUPABASE_ANON_KEY = 'sb_publishable_E8MDOZz72ve_Q0ZqDMdVQw_T-mJkWbE';

function readSupabaseEnv(): { url?: string; anon?: string } {
  const extra = Constants.expoConfig?.extra as
    | { supabaseUrl?: string; supabaseAnonKey?: string }
    | undefined;
  return {
    url: process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra?.supabaseUrl ?? FALLBACK_SUPABASE_URL,
    anon: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? extra?.supabaseAnonKey ?? FALLBACK_SUPABASE_ANON_KEY,
  };
}

export function isSupabaseConfigured(): boolean {
  const { url, anon } = readSupabaseEnv();
  return typeof url === 'string' && url.startsWith('http') && typeof anon === 'string' && anon.length > 0;
}

export function getSupabase(): SupabaseClient | null {
  const { url, anon } = readSupabaseEnv();
  if (!isSupabaseConfigured()) return null;
  if (!singleton) {
    singleton = createClient(url!, anon!, {
      auth: {
        storage: supabaseAuthStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
  }
  return singleton;
}
