import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';

type Props = {
  kind: 'universal' | 'fits';
};

export function StoreCompatibilityBadge({ kind }: Props) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const isUniversal = kind === 'universal';

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: isUniversal ? theme.greenSoft : theme.accentSoft,
          borderColor: isUniversal ? theme.green : theme.accent,
        },
      ]}>
      <Text style={[styles.text, { color: isUniversal ? theme.green : theme.accent }]}>
        {isUniversal ? t('store_badge_universal') : t('store_badge_fits')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  text: { fontSize: 10, fontWeight: '800', letterSpacing: 0.2 },
});
