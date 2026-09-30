import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BOXED_OVERLAY } from '@/constants/Theme';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { formatEgp } from '@/lib/booking/reporting';
import { closePosShift, getOpenPosShift } from '@/lib/posRepository';
import type { PosShift } from '@/lib/posTypes';
import { logAndGetSafeErrorMessage } from '@/lib/errors/userError';

type Props = {
  visible: boolean;
  shopId: string;
  onClose: () => void;
  onClosed?: (shift: PosShift) => void;
};

export function EndShiftModal({ visible, shopId, onClose, onClosed }: Props) {
  const theme = useAppTheme();
  const { t, locale, isRTL } = useI18n();
  const [shift, setShift] = useState<PosShift | null>(null);
  const [counted, setCounted] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setCounted('');
    setError('');
    void getOpenPosShift(shopId).then(setShift);
  }, [visible, shopId]);

  async function onSubmit() {
    if (!shift) return;
    const actual = Number(counted);
    if (!Number.isFinite(actual) || actual < 0) {
      setError(t('pos_shift_counted_invalid'));
      return;
    }
    setBusy(true);
    try {
      const closed = await closePosShift(shift.id, actual);
      onClosed?.(closed);
      onClose();
    } catch (err) {
      setError(logAndGetSafeErrorMessage(err, t, 'pos.closeShift'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text }, isRTL && styles.rtl]}>{t('pos_shift_end_title')}</Text>
          {!shift ? (
            <Text style={[styles.meta, { color: theme.textMuted }]}>{t('pos_shift_none_open')}</Text>
          ) : (
            <>
              <Row label={t('pos_shift_opening_float')} value={formatEgp(shift.openingCashFloat, locale)} theme={theme} />
              <Row label={t('pos_shift_expected_cash')} value={formatEgp(shift.systemCashExpected, locale)} theme={theme} />
              <Text style={[styles.meta, { color: theme.textMuted, marginTop: 12 }, isRTL && styles.rtl]}>
                {t('pos_shift_counted_label')}
              </Text>
              <TextInput
                value={counted}
                onChangeText={setCounted}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={theme.textDim}
                style={[
                  styles.input,
                  { color: theme.text, borderColor: theme.border, backgroundColor: theme.bgElevated },
                ]}
              />
              {error ? <Text style={{ color: theme.danger, marginTop: 8 }}>{error}</Text> : null}
            </>
          )}
          <Pressable
            onPress={onSubmit}
            disabled={busy || !shift}
            style={[styles.primary, { backgroundColor: theme.accent, opacity: busy || !shift ? 0.65 : 1 }]}>
            {busy ? <ActivityIndicator color={theme.onAccent} /> : (
              <Text style={[styles.primaryText, { color: theme.onAccent }]}>{t('pos_shift_end_confirm')}</Text>
            )}
          </Pressable>
          <Pressable onPress={onClose} style={[styles.secondary, { borderColor: theme.border }]}>
            <Text style={[styles.secondaryText, { color: theme.text }]}>{t('alert_cancel')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function Row({
  label,
  value,
  theme,
}: {
  label: string;
  value: string;
  theme: { text: string; textMuted: string };
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.meta, { color: theme.textMuted }]}>{label}</Text>
      <Text style={[styles.value, { color: theme.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: BOXED_OVERLAY.backdrop,
  card: { ...BOXED_OVERLAY.card, maxWidth: 440 },
  title: { fontSize: 20, fontWeight: '800', marginBottom: 12 },
  rtl: { textAlign: 'right' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 6 },
  meta: { fontSize: 13, fontWeight: '600' },
  value: { fontSize: 14, fontWeight: '800' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginTop: 6 },
  primary: { marginTop: 16, borderRadius: 12, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 15, fontWeight: '800' },
  secondary: { marginTop: 8, borderWidth: 1, borderRadius: 12, minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 14, fontWeight: '700' },
});
