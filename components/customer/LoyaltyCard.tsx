import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { LOYALTY_POINTS_PER_DONE_BOOKING } from '@/lib/booking/loyaltyPointsStorage';

type Props = {
  points: number;
};

export function LoyaltyCard({ points }: Props) {
  const theme = useAppTheme();
  const { t } = useI18n();

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.header}>
        <FontAwesome name="star" size={18} color={theme.accent} />
        <Text style={[styles.title, { color: theme.text }]}>{t('loyalty_points_card_title')}</Text>
      </View>
      <View style={[styles.pointsRow, { backgroundColor: theme.accentSoft, borderColor: theme.accent }]}>
        <Text style={[styles.pointsValue, { color: theme.accent }]}>{points}</Text>
        <Text style={[styles.pointsLabel, { color: theme.textMuted }]}>{t('loyalty_points_card_label')}</Text>
      </View>
      <Text style={[styles.lead, { color: theme.textMuted }]}>
        {t('loyalty_points_card_lead').replace('{points}', String(LOYALTY_POINTS_PER_DONE_BOOKING))}
      </Text>
      <Pressable
        onPress={() => router.push('/points-marketplace')}
        style={[styles.marketBtn, { borderColor: theme.accent, backgroundColor: theme.bgElevated }]}>
        <Text style={[styles.marketBtnText, { color: theme.accent }]}>{t('loyalty_marketplace_link')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  title: { fontSize: 17, fontWeight: '800' },
  pointsRow: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  pointsValue: { fontSize: 36, fontWeight: '900' },
  pointsLabel: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  lead: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
  marketBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
  },
  marketBtnText: { fontSize: 13, fontWeight: '800' },
});
