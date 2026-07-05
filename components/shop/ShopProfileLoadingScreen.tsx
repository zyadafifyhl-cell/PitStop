import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { PitStopEgWordmark } from '@/components/ui/PitStopEgWordmark';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';

export function ShopProfileLoadingScreen() {
  const theme = useAppTheme();
  const { t } = useI18n();

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <View style={styles.centerBlock}>
        <PitStopEgWordmark size="hero" style={styles.wordmark} />
        <ActivityIndicator size="large" color={theme.accent} style={styles.spinner} />
        <Text style={[styles.loadingText, { color: theme.textMuted }]}>{t('shop_profile_loading')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  wordmark: {
    transform: [{ scale: 1.65 }],
  },
  spinner: {
    marginTop: 20,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
});
