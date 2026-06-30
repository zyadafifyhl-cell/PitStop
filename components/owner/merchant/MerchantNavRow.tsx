import FontAwesome from '@expo/vector-icons/FontAwesome';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppThemeTokens } from '@/constants/Theme';
import { useI18n } from '@/context/I18nContext';

type Props = {
  theme: AppThemeTokens;
  label: string;
  subtitle?: string;
  onPress: () => void;
  showDivider?: boolean;
  destructive?: boolean;
};

export function MerchantNavRow({
  theme,
  label,
  subtitle,
  onPress,
  showDivider = true,
  destructive = false,
}: Props) {
  const { isRTL } = useI18n();
  const chevron = isRTL ? 'chevron-left' : 'chevron-right';
  const labelColor = destructive ? theme.danger : theme.text;
  const subtitleColor = destructive ? theme.danger : theme.textMuted;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        showDivider ? { borderBottomColor: theme.border, borderBottomWidth: 1 } : null,
        pressed ? styles.pressed : null,
      ]}>
      <View style={styles.textWrap}>
        <Text style={[styles.label, { color: labelColor }, isRTL && styles.textRtl]}>{label}</Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: subtitleColor }, isRTL && styles.textRtl]}>{subtitle}</Text>
        ) : null}
      </View>
      <FontAwesome name={chevron} size={14} color={destructive ? theme.danger : theme.textDim} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    gap: 12,
  },
  pressed: { opacity: 0.88 },
  textWrap: { flex: 1 },
  textRtl: { textAlign: 'right' },
  label: { fontSize: 15, fontWeight: '700' },
  subtitle: { fontSize: 13, lineHeight: 18, marginTop: 3 },
});
