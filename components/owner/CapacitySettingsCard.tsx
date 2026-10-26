import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput } from 'react-native';

import { OwnerSectionCard } from '@/components/owner/OwnerSectionCard';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { DEFAULT_CLOSING_TIME, DEFAULT_OPENING_TIME, DEFAULT_TOTAL_BAYS } from '@/lib/booking/bayCapacity';
import { normalizeTimeHm } from '@/lib/booking/format';

type Props = {
  totalBays?: number;
  openingTime?: string;
  closingTime?: string;
  saving?: boolean;
  onSave: (input: {
    totalBays: number;
    openingTime: string;
    closingTime: string;
  }) => Promise<void> | void;
};

export function CapacitySettingsCard({
  totalBays,
  openingTime,
  closingTime,
  saving,
  onSave,
}: Props) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const [bays, setBays] = useState(String(totalBays ?? DEFAULT_TOTAL_BAYS));
  const [openTime, setOpenTime] = useState(openingTime || DEFAULT_OPENING_TIME);
  const [closeTime, setCloseTime] = useState(closingTime || DEFAULT_CLOSING_TIME);
  const [error, setError] = useState('');

  useEffect(() => {
    setBays(String(totalBays ?? DEFAULT_TOTAL_BAYS));
    setOpenTime(openingTime || DEFAULT_OPENING_TIME);
    setCloseTime(closingTime || DEFAULT_CLOSING_TIME);
  }, [totalBays, openingTime, closingTime]);

  async function handleSave() {
    const nextBays = Number(bays);
    const open = normalizeTimeHm(openTime);
    const close = normalizeTimeHm(closeTime);
    if (!Number.isFinite(nextBays) || nextBays < 1 || !open || !close) {
      setError(t('capacity_invalid'));
      return;
    }
    setError('');
    await onSave({
      totalBays: Math.round(nextBays),
      openingTime: open,
      closingTime: close,
    });
  }

  const fieldStyle = [
    styles.input,
    { color: theme.text, borderColor: theme.border, backgroundColor: theme.bgElevated },
  ];

  return (
    <OwnerSectionCard theme={theme} title={t('capacity_title')} subtitle={t('capacity_lead')} icon="th">
      <Text style={[styles.label, { color: theme.text }]}>{t('capacity_bays_label')}</Text>
      <TextInput
        value={bays}
        onChangeText={setBays}
        keyboardType="number-pad"
        placeholder="3"
        placeholderTextColor={theme.textDim}
        style={fieldStyle}
      />

      <Text style={[styles.label, { color: theme.text }]}>{t('capacity_hours_label')}</Text>
      <Text style={[styles.hint, { color: theme.textMuted }]}>{t('shop_manage_time_format_hint')}</Text>
      <Text style={[styles.label, { color: theme.text }]}>{t('capacity_open_label')}</Text>
      <TextInput
        value={openTime}
        onChangeText={setOpenTime}
        placeholder={DEFAULT_OPENING_TIME}
        placeholderTextColor={theme.textDim}
        style={fieldStyle}
      />
      <Text style={[styles.label, { color: theme.text }]}>{t('capacity_close_label')}</Text>
      <TextInput
        value={closeTime}
        onChangeText={setCloseTime}
        placeholder={DEFAULT_CLOSING_TIME}
        placeholderTextColor={theme.textDim}
        style={fieldStyle}
      />

      {error ? <Text style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}

      <Pressable
        onPress={() => void handleSave()}
        disabled={saving}
        style={[styles.saveBtn, { backgroundColor: theme.accent, opacity: saving ? 0.7 : 1 }]}>
        {saving ? (
          <ActivityIndicator color={theme.onAccent} />
        ) : (
          <Text style={[styles.saveText, { color: theme.onAccent }]}>{t('capacity_save')}</Text>
        )}
      </Pressable>
    </OwnerSectionCard>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '700', marginBottom: 6, marginTop: 8 },
  hint: { fontSize: 12, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  error: { fontSize: 13, fontWeight: '700', marginTop: 8 },
  saveBtn: {
    marginTop: 14,
    borderRadius: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: { fontWeight: '800', fontSize: 15 },
});
