import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { logAndGetSafeErrorMessage } from '@/lib/errors/userError';
import { employeePayDefaults, logEmployeePayroll, updateEmployeePayRates } from '@/lib/posRepository';
import type { DbBranchEmployee } from '@/lib/supabase/database.types';
import { userAlert } from '@/lib/ui/userAlert';

type Props = {
  shopId: string;
  employee: DbBranchEmployee;
  disabled?: boolean;
};

export function EmployeePayCard({ shopId, employee, disabled }: Props) {
  const theme = useAppTheme();
  const { t, isRTL } = useI18n();
  const [dailyWage, setDailyWage] = useState('0');
  const [commissionRate, setCommissionRate] = useState('0');
  const [monthlySalary, setMonthlySalary] = useState('0');
  const [advance, setAdvance] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const defaults = employeePayDefaults(employee);
    setDailyWage(defaults.dailyWage);
    setCommissionRate(defaults.commissionRate);
    setMonthlySalary(defaults.monthlySalary);
    setAdvance('');
  }, [employee]);

  async function onSavePay() {
    setBusy(true);
    try {
      const ok = await updateEmployeePayRates({
        employeeId: employee.id,
        dailyWage: Number(dailyWage) || 0,
        commissionRate: Number(commissionRate) || 0,
        monthlySalary: Number(monthlySalary) || 0,
      });
      if (!ok) {
        userAlert(t('walk_in_submit_fail_title'), t('store_owner_save_failed'));
        return;
      }
      userAlert(t('pos_employee_pay_saved'), t('pos_employee_pay_saved'));
    } finally {
      setBusy(false);
    }
  }

  async function onLogAdvance() {
    const amount = Number(advance);
    if (!Number.isFinite(amount) || amount <= 0) {
      userAlert(t('walk_in_missing_title'), t('pos_employee_advance_amount'));
      return;
    }
    setBusy(true);
    try {
      await logEmployeePayroll({
        shopId,
        employeeId: employee.id,
        type: 'advance_deduction',
        amount,
        notes: employee.full_name,
      });
      setAdvance('');
      userAlert(t('pos_employee_advance'), t('pos_employee_advance_ok'));
    } catch (error) {
      userAlert(t('walk_in_submit_fail_title'), logAndGetSafeErrorMessage(error, t, 'pos.logAdvance'));
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = [
    styles.input,
    {
      color: theme.text,
      borderColor: theme.border,
      backgroundColor: theme.bgElevated ?? theme.card,
      textAlign: (isRTL ? 'right' : 'left') as 'right' | 'left',
    },
  ];

  function labeledField(label: string, input: React.ReactNode) {
    return (
      <View style={styles.field}>
        <Text style={[styles.fieldLabel, { color: theme.textMuted }, isRTL && styles.rtl]}>{label}</Text>
        {input}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {labeledField(
        t('pos_employee_daily_wage'),
        <TextInput
          value={dailyWage}
          onChangeText={setDailyWage}
          keyboardType="decimal-pad"
          autoComplete="off"
          importantForAutofill="no"
          placeholder="0"
          placeholderTextColor={theme.textDim}
          style={inputStyle}
        />,
      )}
      {labeledField(
        t('pos_employee_commission'),
        <TextInput
          value={commissionRate}
          onChangeText={setCommissionRate}
          keyboardType="decimal-pad"
          autoComplete="off"
          importantForAutofill="no"
          placeholder="0"
          placeholderTextColor={theme.textDim}
          style={inputStyle}
        />,
      )}
      {labeledField(
        t('pos_employee_monthly'),
        <TextInput
          value={monthlySalary}
          onChangeText={setMonthlySalary}
          keyboardType="decimal-pad"
          autoComplete="off"
          importantForAutofill="no"
          placeholder="0"
          placeholderTextColor={theme.textDim}
          style={inputStyle}
        />,
      )}
      <Pressable
        onPress={() => void onSavePay()}
        disabled={busy || disabled}
        style={[styles.btn, { borderColor: theme.border, opacity: busy || disabled ? 0.65 : 1 }]}>
        {busy ? (
          <ActivityIndicator color={theme.accent} />
        ) : (
          <Text style={[styles.btnText, { color: theme.text }]}>{t('pos_employee_save_pay')}</Text>
        )}
      </Pressable>
      {labeledField(
        t('pos_employee_advance_amount'),
        <>
          <Text style={[styles.hint, { color: theme.textDim }, isRTL && styles.rtl]}>
            {t('pos_employee_advance_hint')}
          </Text>
          <View style={styles.advanceRow}>
            <TextInput
              value={advance}
              onChangeText={setAdvance}
              keyboardType="decimal-pad"
              autoComplete="off"
              importantForAutofill="no"
              placeholder="0"
              placeholderTextColor={theme.textDim}
              style={[inputStyle, styles.advanceInput]}
            />
            <Pressable
              onPress={() => void onLogAdvance()}
              disabled={busy || disabled}
              style={[styles.advanceBtn, { backgroundColor: theme.accent, opacity: busy || disabled ? 0.65 : 1 }]}>
              <Text style={[styles.btnText, { color: theme.onAccent }]}>{t('pos_employee_advance')}</Text>
            </Pressable>
          </View>
        </>,
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', gap: 10, marginTop: 10 },
  field: { gap: 4 },
  fieldLabel: { fontSize: 12, fontWeight: '800' },
  hint: { fontSize: 11, lineHeight: 15, fontWeight: '600' },
  rtl: { textAlign: 'right' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
  btn: { borderWidth: 1, borderRadius: 10, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 12, fontWeight: '800' },
  advanceRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  advanceInput: { flex: 1, marginTop: 0 },
  advanceBtn: { borderRadius: 10, paddingHorizontal: 10, minHeight: 38, justifyContent: 'center' },
});
