import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { G, Rect, Text as SvgText } from 'react-native-svg';

import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import type { TranslationKey } from '@/lib/i18n/strings';
import type { PeakHourBucket, PeakWeekdayBucket } from '@/lib/posTypes';

type Props = {
  hours: PeakHourBucket[];
  weekdays: PeakWeekdayBucket[];
};

const CHART_HEIGHT = 168;
const PLOT_TOP = 22;
const PLOT_BOTTOM = 36;
const SIDE_PAD = 8;

function formatClockHour(hour: number, locale: 'en' | 'ar'): string {
  const period = hour >= 12 ? (locale === 'ar' ? 'م' : 'PM') : locale === 'ar' ? 'ص' : 'AM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${period}`;
}

function formatClockTime(hour: number, locale: 'en' | 'ar'): string {
  const period = hour >= 12 ? (locale === 'ar' ? 'م' : 'PM') : locale === 'ar' ? 'ص' : 'AM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return locale === 'ar' ? `${h12}:00 ${period}` : `${h12}:00 ${period}`;
}

export function PeakHoursChart({ hours, weekdays }: Props) {
  const theme = useAppTheme();
  const { t, locale } = useI18n();
  const [chartWidth, setChartWidth] = useState(0);
  const [activeHour, setActiveHour] = useState<number | null>(null);

  const displayHours = useMemo(() => {
    const withCounts = hours.filter((bucket) => bucket.count > 0).map((bucket) => bucket.hour);
    const start = withCounts.length ? Math.min(8, ...withCounts) : 8;
    const end = withCounts.length ? Math.max(22, ...withCounts) : 22;
    return hours.filter((bucket) => bucket.hour >= start && bucket.hour <= end);
  }, [hours]);

  const maxCount = Math.max(1, ...displayHours.map((bucket) => bucket.count));
  const peakHour = useMemo(() => {
    return displayHours.reduce((best, bucket) => (bucket.count > best.count ? bucket : best), displayHours[0] ?? {
      hour: 9,
      count: 0,
      isPeak: false,
    });
  }, [displayHours]);

  const busiestDay = useMemo(() => {
    return weekdays.reduce((best, day) => (day.count > best.count ? day : best), weekdays[0] ?? {
      weekday: 6,
      label: 'Sat',
      count: 0,
    });
  }, [weekdays]);

  const peakWindow = useMemo(() => {
    const start = peakHour.hour;
    const end = Math.min(23, start + 2);
    return `${formatClockTime(start, locale)} – ${formatClockTime(end, locale)}`;
  }, [locale, peakHour.hour]);

  const quietestLabel = useMemo(() => {
    const ranked = [...weekdays].sort((a, b) => a.count - b.count);
    const first = ranked[0];
    const second = ranked[1] ?? ranked[0];
    const morning = hours.filter((bucket) => bucket.hour >= 8 && bucket.hour < 12);
    const morningAvg = morning.reduce((sum, bucket) => sum + bucket.count, 0) / Math.max(1, morning.length);
    const dayAvg = hours.reduce((sum, bucket) => sum + bucket.count, 0) / Math.max(1, hours.length);
    const when = morningAvg <= dayAvg ? t('pos_peak_mornings') : t('pos_peak_afternoons');
    const days = first && second && first.weekday !== second.weekday
      ? `${t(`pos_weekday_${first.weekday}` as TranslationKey)} – ${t(`pos_weekday_${second.weekday}` as TranslationKey)}`
      : t(`pos_weekday_${first?.weekday ?? 1}` as TranslationKey);
    return t('pos_peak_quietest_value').replace('{days}', days).replace('{when}', when);
  }, [hours, t, weekdays]);

  const plotHeight = CHART_HEIGHT - PLOT_TOP - PLOT_BOTTOM;
  const barSlot = displayHours.length ? (Math.max(chartWidth - SIDE_PAD * 2, 0) / displayHours.length) : 0;
  const barWidth = Math.max(6, barSlot * 0.58);

  return (
    <View style={styles.wrap}>
      <View
        onLayout={(event) => setChartWidth(Math.floor(event.nativeEvent.layout.width))}
        style={[styles.chartBox, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
        {chartWidth > 0 ? (
          <Svg width={chartWidth} height={CHART_HEIGHT} pointerEvents="none">
            {displayHours.map((bucket, index) => {
              const barH = Math.max(bucket.count > 0 ? 6 : 2, Math.round((bucket.count / maxCount) * plotHeight));
              const x = SIDE_PAD + index * barSlot + (barSlot - barWidth) / 2;
              const y = PLOT_TOP + plotHeight - barH;
              const isPeak = bucket.hour === peakHour.hour && peakHour.count > 0;
              const isActive = activeHour === bucket.hour;
              const showLabel = bucket.hour % 2 === 0 || isPeak;
              return (
                <G key={bucket.hour} pointerEvents="none">
                  <Rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={barH}
                    rx={4}
                    fill={isPeak ? theme.accent : isActive ? theme.accentHover : theme.textDim}
                    opacity={bucket.count === 0 ? 0.28 : 1}
                    pointerEvents="none"
                  />
                  {isPeak ? (
                    <SvgText
                      x={x + barWidth / 2}
                      y={Math.max(12, y - 6)}
                      fill={theme.accent}
                      fontSize="10"
                      fontWeight="800"
                      textAnchor="middle">
                      {t('pos_peak_badge')}
                    </SvgText>
                  ) : null}
                  {showLabel ? (
                    <SvgText
                      x={x + barWidth / 2}
                      y={CHART_HEIGHT - 12}
                      fill={theme.textMuted}
                      fontSize="10"
                      fontWeight="700"
                      textAnchor="middle">
                      {formatClockHour(bucket.hour, locale)}
                    </SvgText>
                  ) : null}
                </G>
              );
            })}
          </Svg>
        ) : null}
        {chartWidth > 0 ? (
          <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
            {displayHours.map((bucket, index) => {
              const x = SIDE_PAD + index * barSlot;
              return (
                <Pressable
                  key={`hit-${bucket.hour}`}
                  onPress={() => setActiveHour(bucket.hour)}
                  onHoverIn={() => setActiveHour(bucket.hour)}
                  onHoverOut={() => setActiveHour((current) => (current === bucket.hour ? null : current))}
                  style={[styles.hit, { left: x, width: barSlot }]}
                />
              );
            })}
          </View>
        ) : null}
        {activeHour != null ? (
          <View pointerEvents="none" style={[styles.tooltip, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.tooltipText, { color: theme.text }]}>
              {t('pos_peak_tooltip')
                .replace('{hour}', formatClockTime(activeHour, locale))
                .replace('{count}', String(displayHours.find((bucket) => bucket.hour === activeHour)?.count ?? 0))}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.statsRow}>
        <StatCard
          title={t('pos_peak_busiest')}
          value={t('pos_peak_busiest_value')
            .replace('{day}', t(`pos_weekday_${busiestDay.weekday}` as TranslationKey))
            .replace('{count}', String(busiestDay.count))}
        />
        <StatCard title={t('pos_peak_window')} value={peakHour.count > 0 ? peakWindow : t('pos_peak_empty')} />
        <StatCard title={t('pos_peak_quietest')} value={quietestLabel} />
      </View>
    </View>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  const theme = useAppTheme();
  return (
    <View style={[styles.statCard, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
      <Text style={[styles.statTitle, { color: theme.textMuted }]}>{title}</Text>
      <Text style={[styles.statValue, { color: theme.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', overflow: 'hidden' },
  chartBox: {
    width: '100%',
    height: CHART_HEIGHT,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  hit: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  tooltip: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: '92%',
  },
  tooltipText: { fontSize: 12, fontWeight: '800' },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  statCard: { flexGrow: 1, flexBasis: '30%', minWidth: 140, borderWidth: 1, borderRadius: 14, padding: 12 },
  statTitle: { fontSize: 11, fontWeight: '800', marginBottom: 6 },
  statValue: { fontSize: 13, lineHeight: 18, fontWeight: '800' },
});
