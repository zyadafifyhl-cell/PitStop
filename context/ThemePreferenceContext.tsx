import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, Platform } from 'react-native';

import { APP_THEMES, type AppThemeTokens } from '@/constants/Theme';

export type ThemePreference = 'light' | 'dark';

const STORAGE_KEY = '@pitstop/theme-preference';

type ThemePreferenceContextValue = {
  preference: ThemePreference;
  effectivePreference: 'light' | 'dark';
  theme: AppThemeTokens;
  setPreference: (preference: ThemePreference) => Promise<void>;
};

const ThemePreferenceContext = createContext<ThemePreferenceContextValue | null>(null);

function resolvePreference(saved: string | null): ThemePreference {
  if (saved === 'dark') return 'dark';
  return 'light';
}

export function ThemePreferenceProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('light');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled) {
          setPreferenceState(resolvePreference(saved));
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

  const effectivePreference = preference;
  const theme = APP_THEMES[effectivePreference];

  useEffect(() => {
    try {
      Appearance.setColorScheme(effectivePreference);
    } catch {
      // Older runtimes ignore explicit scheme.
    }
  }, [effectivePreference]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const root = document.documentElement;
    root.style.backgroundColor = theme.bg;
    root.style.colorScheme = effectivePreference;
    document.body.style.backgroundColor = theme.bg;
    document.body.style.color = theme.text;
    root.setAttribute('data-theme', effectivePreference);
    document.querySelectorAll('#root, #__next, [data-expo-root]').forEach((node) => {
      if (node instanceof HTMLElement) {
        node.style.backgroundColor = theme.bg;
        node.style.color = theme.text;
      }
    });
  }, [theme, effectivePreference]);

  const value = useMemo(
    () => ({
      preference,
      effectivePreference,
      theme,
      setPreference,
    }),
    [preference, effectivePreference, theme, setPreference],
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
