import FontAwesome from '@expo/vector-icons/FontAwesome';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';

type Props = {
  rating: number;
  count: number;
  compact?: boolean;
};

export function StoreStarRating({ rating, count, compact = false }: Props) {
  const theme = useAppTheme();
  const { locale } = useI18n();
  const fullStars = Math.max(0, Math.min(5, Math.round(rating)));
  const starSize = compact ? 10 : 12;

  return (
    <View style={[styles.row, compact && styles.rowCompact]}>
      {Array.from({ length: 5 }).map((_, index) => (
        <FontAwesome
          key={index}
          name={index < fullStars ? 'star' : 'star-o'}
          size={starSize}
          color={index < fullStars ? theme.text : theme.textDim}
        />
      ))}
      <Text style={[compact ? styles.countCompact : styles.count, { color: theme.textDim }]}>
        ({count.toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-EG')})
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 3 },
  rowCompact: { marginTop: 2, gap: 1 },
  count: { fontSize: 11, marginLeft: 3, fontWeight: '600' },
  countCompact: { fontSize: 9, marginLeft: 2, fontWeight: '600' },
});
