import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { AppThemeTokens } from '@/constants/Theme';

type Props = {
  theme: AppThemeTokens;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

export function OwnerSectionCard({ theme, title, subtitle, children }: Props) {
  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      {subtitle ? <Text style={[styles.subtitle, { color: theme.textMuted }]}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  title: { fontSize: 17, fontWeight: '900', marginBottom: 4 },
  subtitle: { fontSize: 13, lineHeight: 19, marginBottom: 12 },
});
