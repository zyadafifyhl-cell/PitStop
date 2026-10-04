import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BOXED_OVERLAY } from '@/constants/Theme';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import type { TranslationKey } from '@/lib/i18n/strings';
import { logShopExpense } from '@/lib/posRepository';
import type { ShopExpenseCategory } from '@/lib/posTypes';
import { logAndGetSafeErrorMessage } from '@/lib/errors/userError';

const CATEGORIES: ShopExpenseCategory[] = [
  'raw_materials',
  'utilities',
  'staff_advance',
  'staff_wage',
  'tea_food',
  'maintenance',
  'other',
];

type Props = {
  visible: boolean;
  shopId: string;
  onClose: () => void;
  onSaved?: () => void;
};

export function LogExpenseModal({ visible, shopId, onClose, onSaved }: Props) {
  const theme = useAppTheme();
  const { t, isRTL } = useI18n();
  const [category, setCategory] = useState<ShopExpenseCategory>('raw_materials');
  const [itemName, setItemName] = useState('');
  const [otherLabel, setOtherLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setCategory('raw_materials');
    setItemName('');
    setOtherLabel('');
    setAmount('');
    setError('');
    setBusy(false);
  }, [visible]);

  async function onSubmit() {
    const value = Number(amount);
    const recordedName = category === 'other' ? otherLabel.trim() : itemName.trim();
    if (category === 'other' && !otherLabel.trim()) {
      setError(t('pos_expense_other_required'));
      return;
    }
    if (!recordedName || !Number.isFinite(value) || value <= 0) {
      setError(t('pos_expense_invalid'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await logShopExpense({
        shopId,
        category,
        itemName: recordedName,
        amount: value,
        notes: category === 'other' ? otherLabel.trim() : undefined,
      });
      setItemName('');
      setOtherLabel('');
      setAmount('');
      onSaved?.();
      onClose();
    } catch (err) {
      setError(logAndGetSafeErrorMessage(err, t, 'pos.logExpense'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text }, isRTL && styles.rtl]}>{t('pos_expense_title')}</Text>
          <View style={styles.chips}>
            {CATEGORIES.map((item) => (
              <Pressable
                key={item}
                onPress={() => {
                  setCategory(item);
                  setError('');
                }}
                style={[
                  styles.chip,
                  {
                    borderColor: category === item ? theme.accent : theme.border,
                    backgroundColor: category === item ? theme.accentSoft : theme.bgElevated,
                  },
                ]}>
                <Text style={{ color: category === item ? theme.accent : theme.text, fontWeight: '700', fontSize: 12 }}>
                  {t(`pos_expense_cat_${item}` as TranslationKey)}
                </Text>
              </Pressable>
            ))}
          </View>
          {category === 'other' ? (
            <TextInput
              value={otherLabel}
              onChangeText={setOtherLabel}
              placeholder={t('pos_expense_other_placeholder')}
              placeholderTextColor={theme.textDim}
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bgElevated }]}
            />
          ) : (
            <TextInput
              value={itemName}
              onChangeText={setItemName}
              placeholder={t('pos_expense_item')}
              placeholderTextColor={theme.textDim}
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bgElevated }]}
            />
          )}
          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder={t('pos_expense_amount')}
            placeholderTextColor={theme.textDim}
            style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bgElevated }]}
          />
          {error ? <Text style={{ color: theme.danger, marginBottom: 8 }}>{error}</Text> : null}
          <Pressable
            onPress={onSubmit}
            disabled={busy}
            style={[styles.primary, { backgroundColor: theme.accent, opacity: busy ? 0.7 : 1 }]}>
            {busy ? <ActivityIndicator color={theme.onAccent} /> : (
              <Text style={[styles.primaryText, { color: theme.onAccent }]}>{t('pos_expense_save')}</Text>
            )}
          </Pressable>
          <Pressable onPress={onClose} style={[styles.secondary, { borderColor: theme.border }]}>
            <Text style={{ color: theme.text, fontWeight: '700' }}>{t('alert_cancel')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: BOXED_OVERLAY.backdrop,
  card: { ...BOXED_OVERLAY.card, maxWidth: 460 },
  title: { fontSize: 20, fontWeight: '800', marginBottom: 12 },
  rtl: { textAlign: 'right' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 },
  primary: { borderRadius: 12, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontWeight: '800', fontSize: 15 },
  secondary: { marginTop: 8, borderWidth: 1, borderRadius: 12, minHeight: 42, alignItems: 'center', justifyContent: 'center' },
});
