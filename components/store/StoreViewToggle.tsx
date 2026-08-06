import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';

export type StoreViewMode = 'list' | 'map' | 'products';

type Props = {
  value: StoreViewMode;
  onChange: (mode: StoreViewMode) => void;
};

const MODES: StoreViewMode[] = ['list', 'map', 'products'];

export function StoreViewToggle({ value, onChange }: Props) {
  const theme = useAppTheme();
  const { t } = useI18n();

  function label(mode: StoreViewMode): string {
    if (mode === 'list') return t('location_list_view');
    if (mode === 'map') return t('location_map_view');
    return t('store_view_products');
  }

  return (
    <View style={styles.row}>
      {MODES.map((mode) => {
        const active = value === mode;
        return (
          <Pressable
            key={mode}
            onPress={() => onChange(mode)}
            style={[
              styles.btn,
              {
                borderColor: active ? theme.accent : theme.border,
                backgroundColor: active ? theme.accent : theme.bgElevated,
              },
            ]}>
            <Text style={[styles.text, { color: active ? theme.onAccent : theme.textMuted }]} numberOfLines={1}>
              {label(mode)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  btn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  text: { fontSize: 12, fontWeight: '800', textAlign: 'center' },
});
