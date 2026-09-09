import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme, type ColorSchemeName } from 'react-native';

import { APP_THEMES, type AppThemeTokens } from '@/constants/Theme';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = '@pitstop/theme-preference';

type ThemePreferenceContextValue = {
  preference: ThemePreference;
  effectivePreference: 'light' | 'dark';
  theme: AppThemeTokens;
  setPreference: (preference: ThemePreference) => Promise<void>;
};

const ThemePreferenceContext = createContext<ThemePreferenceContextValue | null>(null);

function resolveEffective(preference: ThemePreference, systemScheme: ColorSchemeName): 'light' | 'dark' {
  if (preference === 'system') {
    return systemScheme === 'dark' ? 'dark' : 'light';
  }
  return preference;
}

export function ThemePreferenceProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('light');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && (saved === 'light' || saved === 'dark' || saved === 'system')) {
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

  const effectivePreference = resolveEffective(preference, systemScheme);

  const value = useMemo(
    () => ({
      preference,
      effectivePreference,
      theme: APP_THEMES[effectivePreference],
      setPreference,
    }),
    [preference, effectivePreference, setPreference],
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
