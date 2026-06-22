import FontAwesome from '@expo/vector-icons/FontAwesome';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppTheme } from '@/constants/Theme';

type Props = {
  title: string;
  subtitle: string;
  shopCount: number;
  shopCountLabel: string;
  onPress: () => void;
};

export function AreaCard({ title, subtitle, shopCount, shopCountLabel, onPress }: Props) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}>
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <FontAwesome name="map-marker" size={22} color={AppTheme.accent} />
        </View>
        <View style={styles.textWrap}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          <Text style={styles.count}>
            {shopCount} {shopCountLabel}
          </Text>
        </View>
        <FontAwesome name="angle-right" size={22} color={AppTheme.textDim} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  pressed: { opacity: 0.9 },
  card: {
    backgroundColor: AppTheme.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: AppTheme.border,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: AppTheme.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: { flex: 1 },
  title: { color: AppTheme.text, fontSize: 17, fontWeight: '700', marginBottom: 2 },
  subtitle: { color: AppTheme.textMuted, fontSize: 13 },
  count: { color: AppTheme.accent, fontSize: 12, fontWeight: '600', marginTop: 6 },
});
