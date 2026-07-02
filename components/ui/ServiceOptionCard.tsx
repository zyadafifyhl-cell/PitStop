import FontAwesome from '@expo/vector-icons/FontAwesome';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/context/ThemePreferenceContext';
import type { ShopType } from '@/lib/booking/types';

type Props = {
  type: ShopType;
  title: string;
  subtitle: string;
  onPress: () => void;
};

const ICONS: Record<ShopType, React.ComponentProps<typeof FontAwesome>['name']> = {
  maintenance: 'wrench',
  wash: 'tint',
  parts: 'cogs',
  accessories: 'shopping-bag',
  winch: 'truck',
};

export function ServiceOptionCard({ type, title, subtitle, onPress }: Props) {
  const theme = useAppTheme();

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.card,
            borderColor: theme.border,
            borderLeftColor: theme.accent,
          },
        ]}>
        <View style={[styles.iconTile, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
          <FontAwesome name={ICONS[type]} size={24} color={theme.accent} />
        </View>
        <View style={styles.textWrap}>
          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
          <Text style={[styles.subtitle, { color: theme.textMuted }]}>{subtitle}</Text>
        </View>
        <View style={[styles.chevronWrap, { backgroundColor: theme.accentSoft }]}>
          <FontAwesome name="chevron-right" size={12} color={theme.accent} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    borderLeftWidth: 3,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  iconTile: {
    width: 52,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: { flex: 1 },
  title: { fontSize: 17, fontWeight: '800', marginBottom: 3, letterSpacing: 0.2 },
  subtitle: { fontSize: 13, lineHeight: 18 },
  chevronWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
