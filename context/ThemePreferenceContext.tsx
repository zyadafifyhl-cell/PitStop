import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { APP_THEMES, type AppThemeTokens } from '@/constants/Theme';

export type ThemePreference = 'light' | 'dark';

const STORAGE_KEY = '@pitstop/theme-preference';

type ThemePreferenceContextValue = {
  preference: ThemePreference;
  theme: AppThemeTokens;
  setPreference: (preference: ThemePreference) => Promise<void>;
};

const ThemePreferenceContext = createContext<ThemePreferenceContextValue | null>(null);

export function ThemePreferenceProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('dark');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && (saved === 'light' || saved === 'dark')) {
          setPreferenceState(saved);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = useCallback(async (next: ThemePreference) => {
    setPreferenceState(next);
    await AsyncStorage.setItem(STORAGE_KEY, next);
  }, []);

  const value = useMemo(
    () => ({
      preference,
      theme: APP_THEMES[preference],
      setPreference,
    }),
    [preference, setPreference],
  );

  return <ThemePreferenceContext.Provider value={value}>{children}</ThemePreferenceContext.Provider>;
}

export function useThemePreference(): ThemePreferenceContextValue {
  const ctx = useContext(ThemePreferenceContext);
  if (!ctx) throw new Error('useThemePreference must be used within ThemePreferenceProvider');
  return ctx;
}

export function useAppTheme(): AppThemeTokens {
  return useThemePreference().theme;
}
