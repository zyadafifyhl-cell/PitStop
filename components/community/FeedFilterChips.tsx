import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import type { FeedSortMode } from '@/lib/community/types';

type Props = {
  value: FeedSortMode;
  onChange: (mode: FeedSortMode) => void;
};

export function FeedFilterChips({ value, onChange }: Props) {
  const { t } = useI18n();
  const theme = useAppTheme();

  const options: { id: FeedSortMode; label: string }[] = [
    { id: 'latest', label: t('feed_filter_latest') },
    { id: 'popular', label: t('feed_filter_popular') },
  ];

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {options.map((option) => {
        const active = value === option.id;
        return (
          <Pressable
            key={option.id}
            onPress={() => onChange(option.id)}
            style={[
              styles.chip,
              {
                backgroundColor: active ? theme.accentSoft : theme.bgElevated,
                borderColor: active ? theme.accent : theme.border,
              },
            ]}>
            <Text style={{ color: active ? theme.accent : theme.textMuted, fontWeight: '800', fontSize: 13 }}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingVertical: 4 },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
});
