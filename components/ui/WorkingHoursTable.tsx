import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/context/ThemePreferenceContext';
import { useI18n } from '@/context/I18nContext';
import type { WeeklyHoursDisplayRow } from '@/lib/booking/shopSchedule';

type Props = {
  rows: WeeklyHoursDisplayRow[];
};

export function WorkingHoursTable({ rows }: Props) {
  const theme = useAppTheme();
  const { t } = useI18n();

  return (
    <View style={[styles.table, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
      <View style={[styles.headerRow, { borderBottomColor: theme.border, backgroundColor: theme.card }]}>
        <Text style={[styles.headerCell, styles.dayCol, { color: theme.textMuted }]}>{t('shop_hours_col_day')}</Text>
        <Text style={[styles.headerCell, styles.hoursCol, { color: theme.textMuted }]}>{t('shop_hours_col_hours')}</Text>
        <Text style={[styles.headerCell, styles.statusCol, { color: theme.textMuted }]}>{t('shop_hours_col_status')}</Text>
      </View>
      {rows.map((row, index) => {
        const statusBg = row.closed ? 'rgba(220, 38, 38, 0.12)' : theme.greenSoft;
        const statusColor = row.closed ? theme.danger : theme.green;
        return (
          <View
            key={row.day}
            style={[
              styles.bodyRow,
              {
                borderBottomColor: theme.border,
                borderBottomWidth: index === rows.length - 1 ? 0 : StyleSheet.hairlineWidth,
                backgroundColor: row.isToday ? theme.accentSoft : 'transparent',
              },
            ]}>
            <Text style={[styles.dayCell, styles.dayCol, { color: theme.text, fontWeight: row.isToday ? '800' : '600' }]}>
              {row.dayLabel}
              {row.isToday ? ` · ${t('shop_hours_today')}` : ''}
            </Text>
            <Text style={[styles.hoursCell, styles.hoursCol, { color: row.closed ? theme.textDim : theme.text }]}>
              {row.closed ? '—' : row.hoursLabel}
            </Text>
            <View style={[styles.statusCol, styles.statusWrap]}>
              <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
                <Text style={[styles.statusText, { color: statusColor }]}>
                  {row.closed ? t('shop_hours_status_closed') : t('shop_hours_status_open')}
                </Text>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  table: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  headerCell: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  dayCell: { fontSize: 14 },
  hoursCell: { fontSize: 13, fontWeight: '600' },
  dayCol: { flex: 1.1 },
  hoursCol: { flex: 1.2 },
  statusCol: { flex: 0.9 },
  statusWrap: { alignItems: 'flex-start' },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusText: { fontSize: 11, fontWeight: '800' },
});
