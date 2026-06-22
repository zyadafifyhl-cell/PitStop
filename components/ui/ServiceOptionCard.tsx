import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppTheme, SERVICE_COLORS } from '@/constants/Theme';
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
  const accent = SERVICE_COLORS[type];

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}>
      <LinearGradient
        colors={[AppTheme.card, AppTheme.bgElevated]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}>
        <View style={[styles.iconWrap, { backgroundColor: `${accent}22` }]}>
          <FontAwesome name={ICONS[type]} size={28} color={accent} />
        </View>
        <View style={styles.textWrap}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        <FontAwesome name="chevron-right" size={16} color={AppTheme.textDim} />
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
    borderColor: AppTheme.border,
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
  title: { color: AppTheme.text, fontSize: 18, fontWeight: '800', marginBottom: 4 },
  subtitle: { color: AppTheme.textMuted, fontSize: 13, lineHeight: 18 },
});
