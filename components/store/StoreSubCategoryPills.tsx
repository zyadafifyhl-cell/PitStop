import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { subCategoryLabel } from '@/lib/store/constants';
import type { StoreProductCategory } from '@/lib/store/types';

type Props = {
  category: StoreProductCategory | 'all';
  value: string | 'all';
  onChange: (value: string | 'all') => void;
  availableSubCategories: string[];
};

export function StoreSubCategoryPills({ category, value, onChange, availableSubCategories }: Props) {
  const theme = useAppTheme();
  const { t, locale } = useI18n();

  const pills = ['all', ...availableSubCategories];

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {pills.map((pill) => {
        const active = value === pill;
        const label = pill === 'all' ? t('store_subcat_all') : subCategoryLabel(pill, locale, category);
        return (
          <Pressable
            key={pill}
            onPress={() => onChange(pill)}
            style={[
              styles.chip,
              {
                backgroundColor: active ? theme.cardHover : theme.bgElevated,
                borderColor: active ? theme.accent : theme.border,
              },
            ]}>
            <Text style={[styles.chipText, { color: active ? theme.accent : theme.textMuted }]}>{label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingVertical: 2 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { fontSize: 12, fontWeight: '700' },
});
