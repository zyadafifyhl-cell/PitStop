import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { BOXED_OVERLAY } from '@/constants/Theme';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { DELAY_MINUTE_OPTIONS, DELAY_REASON_KEYS, type DelayReasonKey } from '@/lib/booking/storage';
import type { TranslationKey } from '@/lib/i18n/strings';

const REASON_LABEL_KEYS: Record<DelayReasonKey, TranslationKey> = {
  traffic: 'owner_delay_reason_traffic',
  detailing: 'owner_delay_reason_detailing',
  previous_car: 'owner_delay_reason_previous_car',
};

type Props = {
  visible: boolean;
  /** Shown under the title, e.g. customer name and time. */
  subtitle?: string;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (minutes: number, reason?: DelayReasonKey) => Promise<void> | void;
};

export function DelayBookingModal({ visible, subtitle, busy, onClose, onSubmit }: Props) {
  const theme = useAppTheme();
  const { t, tp } = useI18n();
  const [minutes, setMinutes] = useState<number>(DELAY_MINUTE_OPTIONS[0]);
  const [reason, setReason] = useState<DelayReasonKey | undefined>(undefined);

  useEffect(() => {
    if (!visible) return;
    setMinutes(DELAY_MINUTE_OPTIONS[0]);
    setReason(undefined);
  }, [visible]);

  function chipStyle(active: boolean) {
    return [
      styles.chip,
      {
        backgroundColor: active ? theme.accent : theme.bgElevated,
        borderColor: active ? theme.accent : theme.border,
      },
    ];
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text }]}>{t('owner_delay_title')}</Text>
          <Text style={[styles.lead, { color: theme.textMuted }]}>
            {subtitle ? `${subtitle} · ` : ''}
            {t('owner_delay_lead')}
          </Text>

          <Text style={[styles.label, { color: theme.text }]}>{t('owner_delay_duration')}</Text>
          <View style={styles.chips}>
            {DELAY_MINUTE_OPTIONS.map((option) => {
              const active = option === minutes;
              return (
                <Pressable key={option} onPress={() => setMinutes(option)} style={chipStyle(active)}>
                  <Text style={[styles.chipText, { color: active ? theme.onAccent : theme.text }]}>
                    {tp('owner_delay_minutes', { n: String(option) })}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.label, { color: theme.text }]}>{t('owner_delay_reason_optional')}</Text>
          <View style={styles.chips}>
            {DELAY_REASON_KEYS.map((key) => {
              const active = key === reason;
              return (
                <Pressable
                  key={key}
                  onPress={() => setReason(active ? undefined : key)}
                  style={chipStyle(active)}>
                  <Text style={[styles.chipText, { color: active ? theme.onAccent : theme.text }]}>
                    {t(REASON_LABEL_KEYS[key])}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.actions}>
            <Pressable onPress={onClose} style={[styles.secondary, { borderColor: theme.border }]}>
              <Text style={[styles.actionText, { color: theme.text }]}>{t('alert_cancel')}</Text>
            </Pressable>
            <Pressable
              onPress={() => void onSubmit(minutes, reason)}
              disabled={busy}
              style={[styles.primary, { backgroundColor: theme.accent, opacity: busy ? 0.6 : 1 }]}>
              {busy ? (
                <ActivityIndicator color={theme.onAccent} />
              ) : (
                <Text style={[styles.actionText, { color: theme.onAccent }]}>{t('owner_delay_send')}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: BOXED_OVERLAY.backdrop,
  card: {
    ...BOXED_OVERLAY.card,
    borderWidth: 1,
    padding: 16,
  },
  title: { fontSize: 18, fontWeight: '800' },
  lead: { fontSize: 13, marginTop: 4, marginBottom: 6 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontWeight: '700', fontSize: 13 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 16 },
  secondary: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    flex: 1,
    borderRadius: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { fontWeight: '800', fontSize: 14 },
});
