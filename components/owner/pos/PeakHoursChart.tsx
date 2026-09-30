import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import type { TranslationKey } from '@/lib/i18n/strings';
import type { PeakHourBucket, PeakWeekdayBucket } from '@/lib/posTypes';

type Props = {
  hours: PeakHourBucket[];
  weekdays: PeakWeekdayBucket[];
};

export function PeakHoursChart({ hours, weekdays }: Props) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const maxHour = Math.max(1, ...hours.map((h) => h.count));
  const maxDay = Math.max(1, ...weekdays.map((d) => d.count));

  return (
    <View>
      <Text style={[styles.caption, { color: theme.textMuted }]}>{t('pos_peak_hourly')}</Text>
      <View style={styles.hourRow}>
        {hours.map((bucket) => (
          <View key={bucket.hour} style={styles.hourCol}>
            <View style={[styles.track, { backgroundColor: theme.bgElevated }]}>
              <View
                style={{
                  height: `${Math.round((bucket.count / maxHour) * 100)}%`,
                  width: '100%',
                  backgroundColor: bucket.isPeak ? theme.accent : theme.textDim,
                  borderRadius: 3,
                }}
              />
            </View>
            {bucket.hour % 3 === 0 ? (
              <Text style={[styles.tick, { color: theme.textDim }]}>{bucket.hour}</Text>
            ) : null}
          </View>
        ))}
      </View>
      <Text style={[styles.caption, { color: theme.textMuted, marginTop: 14 }]}>{t('pos_peak_weekly')}</Text>
      {weekdays.map((day) => (
        <View key={day.weekday} style={styles.dayRow}>
          <Text style={[styles.dayLabel, { color: theme.textMuted }]}>
            {t(`pos_weekday_${day.weekday}` as TranslationKey)}
          </Text>
          <View style={[styles.dayTrack, { backgroundColor: theme.bgElevated }]}>
            <View
              style={{
                width: `${Math.round((day.count / maxDay) * 100)}%`,
                height: 8,
                borderRadius: 99,
                backgroundColor: theme.accent,
              }}
            />
          </View>
          <Text style={[styles.dayCount, { color: theme.text }]}>{day.count}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  caption: { fontSize: 12, fontWeight: '700', marginBottom: 8 },
  hourRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 92 },
  hourCol: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  track: { flex: 1, width: '100%', justifyContent: 'flex-end', borderRadius: 4, overflow: 'hidden' },
  tick: { fontSize: 8, marginTop: 4 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  dayLabel: { width: 36, fontSize: 12, fontWeight: '700' },
  dayTrack: { flex: 1, height: 8, borderRadius: 99, overflow: 'hidden' },
  dayCount: { width: 28, fontSize: 12, fontWeight: '800', textAlign: 'right' },
});
