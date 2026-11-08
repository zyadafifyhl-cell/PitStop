import FontAwesome from '@expo/vector-icons/FontAwesome';
import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import type { AppThemeTokens } from '@/constants/Theme';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';

type Props = {
  theme?: Partial<AppThemeTokens>;
  title: string;
  subtitle?: string;
  icon?: React.ComponentProps<typeof FontAwesome>['name'];
  iconColor?: string;
  headerExtra?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

export function OwnerSectionCard({ theme, title, subtitle, icon, iconColor, headerExtra, style, children }: Props) {
  const contextTheme = useAppTheme();
  const { isRTL } = useI18n();
  const cardColor = theme?.card ?? contextTheme.card;
  const borderColor = theme?.border ?? contextTheme.border;
  const accentColor = theme?.brand ?? contextTheme.brand;
  const titleColor = theme?.text ?? contextTheme.text;
  const subtitleColor = theme?.textMuted ?? contextTheme.textMuted;

  return (
    <View style={[styles.card, { backgroundColor: cardColor, borderColor }, style]}>
      <View style={[styles.topAccent, { backgroundColor: accentColor }]} />
      <View style={[styles.titleRow, isRTL && styles.titleRowRtl]}>
        {icon ? <FontAwesome name={icon} size={17} color={iconColor ?? contextTheme.brand} /> : null}
        <Text style={[styles.title, headerExtra ? styles.titleBeside : styles.titleFill, { color: titleColor }]} numberOfLines={headerExtra ? 1 : undefined}>
          {title}
        </Text>
        {headerExtra ? <View style={styles.headerExtra}>{headerExtra}</View> : null}
      </View>
      {subtitle ? <Text style={[styles.subtitle, { color: subtitleColor }]}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 16,
    marginBottom: 12,
    overflow: 'hidden',
  },
  topAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    height: 1,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  titleRowRtl: { flexDirection: 'row-reverse' },
  title: { fontSize: 17, fontWeight: '700' },
  titleFill: { flex: 1 },
  titleBeside: { flex: 1 },
  headerExtra: { width: 168, flexGrow: 0, flexShrink: 0 },
  subtitle: { fontSize: 13, lineHeight: 19, marginBottom: 12 },
});
