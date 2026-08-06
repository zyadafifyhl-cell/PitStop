import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import type { StoreCategoryFilter } from '@/lib/store/types';

type Props = {
  value: StoreCategoryFilter;
  onChange: (value: StoreCategoryFilter) => void;
};

const TABS: Array<{ id: StoreCategoryFilter; labelKey: 'store_cat_all' | 'store_cat_parts' | 'store_cat_accessories' }> = [
  { id: 'all', labelKey: 'store_cat_all' },
  { id: 'spare_parts', labelKey: 'store_cat_parts' },
  { id: 'accessories', labelKey: 'store_cat_accessories' },
];

export function StoreCategoryTabs({ value, onChange }: Props) {
  const theme = useAppTheme();
  const { t } = useI18n();

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {TABS.map((tab) => {
        const active = value === tab.id;
        return (
          <Pressable
            key={tab.id}
            onPress={() => onChange(tab.id)}
            style={[
              styles.chip,
              {
                backgroundColor: active ? theme.accent : theme.bgElevated,
                borderColor: active ? theme.accent : theme.border,
              },
            ]}>
            <Text style={[styles.chipText, { color: active ? theme.onAccent : theme.text }]}>{t(tab.labelKey)}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingVertical: 2 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 },
  chipText: { fontSize: 13, fontWeight: '800' },
});
