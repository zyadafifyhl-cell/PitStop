import FontAwesome from '@expo/vector-icons/FontAwesome';
import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import type { AppThemeTokens } from '@/constants/Theme';
import { useAppTheme } from '@/context/ThemePreferenceContext';

type Props = {
  theme?: Partial<AppThemeTokens>;
  title: string;
  subtitle?: string;
  icon?: React.ComponentProps<typeof FontAwesome>['name'];
  iconColor?: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

export function OwnerSectionCard({ theme, title, subtitle, icon, iconColor, style, children }: Props) {
  const contextTheme = useAppTheme();
  const cardColor = theme?.card ?? contextTheme.card;
  const borderColor = theme?.border ?? contextTheme.border;
  const accentColor = theme?.brand ?? contextTheme.brand;
  const titleColor = theme?.text ?? contextTheme.text;
  const subtitleColor = theme?.textMuted ?? contextTheme.textMuted;

  return (
    <View style={[styles.card, { backgroundColor: cardColor, borderColor }, style]}>
      <View style={[styles.topAccent, { backgroundColor: accentColor }]} />
      <View style={styles.titleRow}>
        {icon ? <FontAwesome name={icon} size={17} color={iconColor ?? contextTheme.brand} /> : null}
        <Text style={[styles.title, { color: titleColor }]}>{title}</Text>
      </View>
      {subtitle ? <Text style={[styles.subtitle, { color: subtitleColor }]}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  topAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    height: 1,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  title: { flex: 1, fontSize: 17, fontWeight: '900' },
  subtitle: { fontSize: 13, lineHeight: 19, marginBottom: 12 },
});
