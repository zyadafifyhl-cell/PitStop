import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
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
  winch: 'truck',
};

export function ServiceOptionCard({ type, title, subtitle, onPress }: Props) {
  const theme = useAppTheme();
  const accent = theme.accent;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}>
      <LinearGradient
        colors={[theme.card, theme.bgElevated]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, { borderColor: theme.border }]}>
        <View style={[styles.iconWrap, { backgroundColor: theme.accentSoft }]}>
          <FontAwesome name={ICONS[type]} size={28} color={accent} />
        </View>
        <View style={styles.textWrap}>
          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
          <Text style={[styles.subtitle, { color: theme.textMuted }]}>{subtitle}</Text>
        </View>
        <FontAwesome name="chevron-right" size={16} color={theme.textDim} />
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  pressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: { flex: 1 },
  title: { fontSize: 18, fontWeight: '800', marginBottom: 4 },
  subtitle: { fontSize: 13, lineHeight: 18 },
});
