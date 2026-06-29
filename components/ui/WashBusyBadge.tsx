import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';

const VACATION_AMBER = '#D97706';
const VACATION_AMBER_SOFT = '#FEF3C7';

export type WashCustomerStatus = 'busy' | 'closed' | 'vacation';

type Props = {
  status: WashCustomerStatus;
  compact?: boolean;
  vacationReturnDate?: string;
};

function formatReturnDate(ymd: string | undefined, locale: 'en' | 'ar'): string | null {
  if (!ymd?.trim()) return null;
  const parsed = new Date(`${ymd.trim()}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-GB');
}

export function WashStatusBadge({ status, compact, vacationReturnDate }: Props) {
  const theme = useAppTheme();
  const { t, locale } = useI18n();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (status !== 'busy') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, status]);

  const returnLabel = formatReturnDate(vacationReturnDate, locale);

  if (status === 'busy') {
    return (
      <View
        style={[
          styles.wrap,
          compact && styles.wrapCompact,
          { backgroundColor: `${theme.danger}18`, borderColor: theme.danger },
        ]}>
        <Animated.View style={[styles.dot, { backgroundColor: theme.danger, opacity: pulse }]} />
        <FontAwesome name="exclamation-circle" size={compact ? 12 : 14} color={theme.danger} />
        <Text style={[styles.text, compact && styles.textCompact, { color: theme.danger }]}>
          {t('wash_busy_customer_notice')}
        </Text>
      </View>
    );
  }

  if (status === 'closed') {
    return (
      <View
        style={[
          styles.wrap,
          compact && styles.wrapCompact,
          { backgroundColor: theme.bgElevated, borderColor: theme.border },
        ]}>
        <FontAwesome name="lock" size={compact ? 12 : 14} color={theme.textMuted} />
        <Text style={[styles.text, compact && styles.textCompact, { color: theme.textMuted }]}>
          {t('wash_closed_customer_notice')}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.wrap,
        compact && styles.wrapCompact,
        { backgroundColor: VACATION_AMBER_SOFT, borderColor: VACATION_AMBER },
      ]}>
      <FontAwesome name="plane" size={compact ? 12 : 14} color={VACATION_AMBER} />
      <View style={styles.vacationTextWrap}>
        <Text style={[styles.text, compact && styles.textCompact, { color: VACATION_AMBER }]}>
          {t('wash_vacation_customer_notice')}
        </Text>
        {returnLabel ? (
          <Text style={[styles.vacationSub, compact && styles.vacationSubCompact, { color: VACATION_AMBER }]}>
            {t('wash_vacation_customer_return').replace('{date}', returnLabel)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** @deprecated Use WashStatusBadge with status="busy" */
export function WashBusyBadge({ compact }: { compact?: boolean }) {
  return <WashStatusBadge status="busy" compact={compact} />;
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
  },
  wrapCompact: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  text: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  textCompact: {
    flex: 0,
    fontSize: 12,
    lineHeight: 16,
  },
  vacationTextWrap: { flex: 1, gap: 2 },
  vacationSub: { fontSize: 12, fontWeight: '600', lineHeight: 16 },
  vacationSubCompact: { fontSize: 11, lineHeight: 14 },
});
