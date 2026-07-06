import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { I18nManager, Platform } from 'react-native';

import {
  type Locale,
  type TranslationKey,
  translate,
  tp,
} from '@/lib/i18n/strings';
import { syncCustomerPreferredLocaleRemote } from '@/lib/booking/customerLocaleRepository';
import { getSupabase } from '@/lib/supabase/client';

const STORAGE_KEY = '@pitstop/locale';

function deviceDefaultLocale(): Locale {
  try {
    const code = Localization.getLocales()[0]?.languageCode ?? 'en';
    return code.startsWith('ar') ? 'ar' : 'en';
  } catch {
    return 'en';
  }
}

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => Promise<void>;
  t: (key: TranslationKey) => string;
  tp: (key: TranslationKey, vars: Record<string, string>) => string;
  isRTL: boolean;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(deviceDefaultLocale);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && (saved === 'ar' || saved === 'en')) {
          setLocaleState(saved);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const rtl = locale === 'ar';
    if (Platform.OS === 'web') {
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('dir', rtl ? 'rtl' : 'ltr');
        document.documentElement.setAttribute('lang', rtl ? 'ar' : 'en');
      }
    } else {
      I18nManager.allowRTL(true);
      if (I18nManager.isRTL !== rtl) {
        I18nManager.forceRTL(rtl);
      }
    }
  }, [locale]);

  const setLocale = useCallback(async (next: Locale) => {
    setLocaleState(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }

    const supabase = getSupabase();
    if (supabase) {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user?.id;
      if (userId) {
        void syncCustomerPreferredLocaleRemote(userId, next);
      }
    }
  }, []);

  const t = useCallback((key: TranslationKey) => translate(locale, key), [locale]);

  const tparams = useCallback(
    (key: TranslationKey, vars: Record<string, string>) => tp(locale, key, vars),
    [locale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t,
      tp: tparams,
      isRTL: locale === 'ar',
    }),
    [locale, setLocale, t, tparams],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return ctx;
}
