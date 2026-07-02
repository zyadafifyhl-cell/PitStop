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
      <View style={[styles.topAccent, { backgroundColor: theme.accentSoft }]} />
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      {subtitle ? <Text style={[styles.subtitle, { color: theme.textMuted }]}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#0EA5FF',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  topAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    height: 1.5,
  },
  title: { fontSize: 17, fontWeight: '900', marginBottom: 4 },
  subtitle: { fontSize: 13, lineHeight: 19, marginBottom: 12 },
});
