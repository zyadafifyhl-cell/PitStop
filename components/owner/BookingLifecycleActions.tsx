import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { bookingProgressSnapshot } from '@/lib/booking/bookingServiceLifecycle';
import type { Booking } from '@/lib/booking/types';

const COMPLETE_BLUE = '#1565C0';

type Props = {
  booking: Booking;
  showActions?: boolean;
  busy?: boolean;
  onMarkArrived?: () => void;
  onComplete?: () => void;
  onNoShow?: () => void;
};

export function BookingLifecycleActions({
  booking,
  showActions = true,
  busy,
  onMarkArrived,
  onComplete,
  onNoShow,
}: Props) {
  const theme = useAppTheme();
  const { t, tp } = useI18n();
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    if (booking.status !== 'in_progress') return;
    const timer = setInterval(() => setNowMs(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [booking.status, booking.id]);

  const progress = bookingProgressSnapshot(booking, nowMs);
  const showArrived = showActions && booking.status === 'confirmed' && !!onMarkArrived;
  const showComplete = showActions && booking.status === 'in_progress' && !!onComplete;
  const showNoShowBtn =
    showActions && (booking.status === 'confirmed' || booking.status === 'in_progress') && !!onNoShow;

  if (!progress && !showArrived && !showComplete && !showNoShowBtn) return null;

  return (
    <View style={styles.wrap}>
      {progress ? (
        <View
          style={[
            styles.timer,
            {
              backgroundColor: progress.isOverdue ? theme.warningSoft : theme.successSoft,
              borderColor: progress.isOverdue ? theme.warning : theme.success,
            },
          ]}>
          <Text style={[styles.timerText, { color: progress.isOverdue ? theme.warning : theme.success }]}>
            {progress.isOverdue
              ? t('booking_auto_complete_overdue')
              : tp('booking_progress_timer', {
                  elapsed: String(Math.min(progress.elapsedMinutes, progress.durationMinutes)),
                  duration: String(progress.durationMinutes),
                })}
          </Text>
          {!progress.isOverdue ? (
            <Text style={[styles.timerSub, { color: progress.isOverdue ? theme.warning : theme.success }]}>
              {tp('booking_auto_complete_in', { mins: String(progress.remainingMinutes) })}
            </Text>
          ) : null}
        </View>
      ) : null}

      {showArrived || showComplete || showNoShowBtn ? (
        <View style={styles.actions}>
          {showArrived ? (
            <Pressable
              onPress={onMarkArrived}
              disabled={busy}
              style={[styles.chipBtn, { backgroundColor: theme.success, borderColor: theme.success, opacity: busy ? 0.7 : 1 }]}>
              {busy ? (
                <ActivityIndicator color={theme.white} />
              ) : (
                <Text style={[styles.actionText, { color: theme.white }]}>{t('booking_action_arrived')}</Text>
              )}
            </Pressable>
          ) : null}
          {showComplete ? (
            <Pressable
              onPress={onComplete}
              disabled={busy}
              style={[styles.chipBtn, { backgroundColor: COMPLETE_BLUE, borderColor: COMPLETE_BLUE, opacity: busy ? 0.7 : 1 }]}>
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.actionText}>{t('booking_action_complete')}</Text>
              )}
            </Pressable>
          ) : null}
          {showNoShowBtn ? (
            <Pressable
              onPress={onNoShow}
              disabled={busy}
              style={[styles.chipBtn, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
              <Text style={[styles.chipBtnText, { color: theme.text }]}>{t('wash_action_no_show')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 10, gap: 8 },
  timer: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  timerText: { fontSize: 12, fontWeight: '800' },
  timerSub: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipBtn: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  chipBtnText: { fontWeight: '700', fontSize: 13 },
});
