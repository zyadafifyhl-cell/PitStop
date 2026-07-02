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
        <View style={[styles.iconChip, { backgroundColor: theme.accentSoft }]}>
          <FontAwesome name="star" size={16} color={theme.accent} />
        </View>
        <Text style={[styles.title, { color: theme.text }]}>{t('loyalty_points_card_title')}</Text>
      </View>
      <View style={[styles.pointsRow, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
        <Text style={[styles.pointsValue, { color: theme.accent }]}>{points}</Text>
        <Text style={[styles.pointsLabel, { color: theme.textMuted }]}>{t('loyalty_points_card_label')}</Text>
      </View>
      <Text style={[styles.lead, { color: theme.textMuted }]}>
        {t('loyalty_points_card_lead').replace('{points}', String(LOYALTY_POINTS_PER_DONE_BOOKING))}
      </Text>
      <Pressable
        onPress={() => router.push('/points-marketplace')}
        style={[styles.marketBtn, { backgroundColor: theme.accent }]}>
        <Text style={[styles.marketBtnText, { color: theme.onAccent }]}>{t('loyalty_marketplace_link')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  iconChip: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  pointsRow: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  pointsValue: { fontSize: 40, fontWeight: '900' },
  pointsLabel: { fontSize: 12, fontWeight: '700', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.6 },
  lead: { fontSize: 13, lineHeight: 18, marginBottom: 14 },
  marketBtn: {
    borderRadius: 28,
    paddingVertical: 13,
    alignItems: 'center',
  },
  marketBtnText: { fontSize: 14, fontWeight: '800' },
});
