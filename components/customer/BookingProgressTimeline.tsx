import FontAwesome from '@expo/vector-icons/FontAwesome';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import type { BookingStatus } from '@/lib/booking/types';

const TRACK_STATUSES = ['pending', 'confirmed', 'in_progress', 'done'] as const;
type TrackStatus = (typeof TRACK_STATUSES)[number];

type Props = {
  status: BookingStatus;
};

function stepIndex(status: BookingStatus): number {
  if (status === 'pending') return 0;
  if (status === 'confirmed') return 1;
  if (status === 'in_progress') return 2;
  if (status === 'done') return 3;
  return 0;
}

export function BookingProgressTimeline({ status }: Props) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const activeIdx = stepIndex(status);

  const labels: Record<TrackStatus, string> = {
    pending: t('booking_progress_pending'),
    confirmed: t('booking_progress_confirmed'),
    in_progress: t('booking_progress_in_progress'),
    done: t('booking_progress_done'),
  };

  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: theme.textMuted }]}>{t('booking_progress_title')}</Text>
      <View style={styles.row}>
        {TRACK_STATUSES.map((step, index) => {
          const reached = index <= activeIdx;
          const isCurrent = index === activeIdx;
          const tint = reached ? theme.accent : theme.textDim;
          const lineActive = index < activeIdx;

          return (
            <View key={step} style={styles.stepCol}>
              <View style={styles.stepTop}>
                {index > 0 ? (
                  <View
                    style={[
                      styles.connector,
                      { backgroundColor: lineActive ? theme.accent : theme.border },
                    ]}
                  />
                ) : null}
                <View
                  style={[
                    styles.circle,
                    {
                      backgroundColor: reached ? theme.accentSoft : theme.bgElevated,
                      borderColor: isCurrent ? theme.accent : reached ? theme.accent : theme.border,
                    },
                  ]}>
                  <FontAwesome
                    name={reached ? 'check-circle' : 'circle-o'}
                    size={16}
                    color={tint}
                  />
                </View>
                {index < TRACK_STATUSES.length - 1 ? (
                  <View
                    style={[
                      styles.connector,
                      { backgroundColor: index < activeIdx ? theme.accent : theme.border },
                    ]}
                  />
                ) : null}
              </View>
              <Text
                style={[
                  styles.label,
                  {
                    color: isCurrent ? theme.text : reached ? theme.textMuted : theme.textDim,
                    fontWeight: isCurrent ? '800' : '600',
                  },
                ]}
                numberOfLines={2}>
                {labels[step]}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 4, marginBottom: 4 },
  title: { fontSize: 12, fontWeight: '700', marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  stepCol: { flex: 1, alignItems: 'center' },
  stepTop: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  connector: { flex: 1, height: 3, borderRadius: 999 },
  circle: {
    width: 28,
    height: 28,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 10, textAlign: 'center', lineHeight: 13, paddingHorizontal: 2 },
});
