import FontAwesome from '@expo/vector-icons/FontAwesome';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/context/ThemePreferenceContext';

type Props = {
  title: string;
  subtitle: string;
  shopCount: number;
  shopCountLabel: string;
  onPress: () => void;
};

export function AreaCard({ title, subtitle, shopCount, shopCountLabel, onPress }: Props) {
  const theme = useAppTheme();

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={[styles.iconWrap, { backgroundColor: theme.accentSoft }]}>
          <FontAwesome name="map-marker" size={22} color={theme.accent} />
        </View>
        <View style={styles.textWrap}>
          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
          <Text style={[styles.subtitle, { color: theme.textMuted }]}>{subtitle}</Text>
          <Text style={[styles.count, { color: theme.accent }]}>
            {shopCount} {shopCountLabel}
          </Text>
        </View>
        <FontAwesome name="angle-right" size={22} color={theme.textDim} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  pressed: { opacity: 0.9 },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: { flex: 1 },
  title: { fontSize: 17, fontWeight: '700', marginBottom: 2 },
  subtitle: { fontSize: 13 },
  count: { fontSize: 12, fontWeight: '600', marginTop: 6 },
});
