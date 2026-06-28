import FontAwesome from '@expo/vector-icons/FontAwesome';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { LOYALTY_STAMPS_GOAL } from '@/lib/booking/loyaltyStampsStorage';

type Props = {
  stamps: number;
};

export function LoyaltyCard({ stamps }: Props) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const filled = Math.min(stamps, LOYALTY_STAMPS_GOAL);

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.header}>
        <FontAwesome name="ticket" size={18} color={theme.accent} />
        <Text style={[styles.title, { color: theme.text }]}>{t('loyalty_card_title')}</Text>
      </View>
      <Text style={[styles.lead, { color: theme.textMuted }]}>{t('loyalty_card_lead')}</Text>
      <View style={styles.stampsRow}>
        {Array.from({ length: LOYALTY_STAMPS_GOAL }, (_, index) => {
          const active = index < filled;
          return (
            <View
              key={index}
              style={[
                styles.stamp,
                {
                  backgroundColor: active ? theme.accentSoft : theme.bgElevated,
                  borderColor: active ? theme.accent : theme.border,
                },
              ]}>
              <FontAwesome
                name="car"
                size={18}
                color={active ? theme.accent : theme.textDim}
              />
            </View>
          );
        })}
      </View>
      <Text style={[styles.progress, { color: theme.text }]}>
        {t('loyalty_card_progress').replace('{count}', String(filled)).replace('{goal}', String(LOYALTY_STAMPS_GOAL))}
      </Text>
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
    marginBottom: 6,
  },
  title: { fontSize: 17, fontWeight: '800' },
  lead: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
  stampsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  stamp: {
    width: 52,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progress: { fontSize: 14, fontWeight: '700' },
});
