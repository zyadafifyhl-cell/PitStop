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
      backgroundColor: theme.card,
      textAlign: (isRTL ? 'right' : 'left') as 'right' | 'left',
    },
  ];

  return (
    <View style={styles.wrap}>
      <TextInput
        value={dailyWage}
        onChangeText={setDailyWage}
        keyboardType="decimal-pad"
        placeholder={t('pos_employee_daily_wage')}
        placeholderTextColor={theme.textDim}
        style={inputStyle}
      />
      <TextInput
        value={commissionRate}
        onChangeText={setCommissionRate}
        keyboardType="decimal-pad"
        placeholder={t('pos_employee_commission')}
        placeholderTextColor={theme.textDim}
        style={inputStyle}
      />
      <TextInput
        value={monthlySalary}
        onChangeText={setMonthlySalary}
        keyboardType="decimal-pad"
        placeholder={t('pos_employee_monthly')}
        placeholderTextColor={theme.textDim}
        style={inputStyle}
      />
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
      <View style={styles.advanceRow}>
        <TextInput
          value={advance}
          onChangeText={setAdvance}
          keyboardType="decimal-pad"
          placeholder={t('pos_employee_advance_amount')}
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
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', gap: 8, marginTop: 10 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
  btn: { borderWidth: 1, borderRadius: 10, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 12, fontWeight: '800' },
  advanceRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  advanceInput: { flex: 1, marginTop: 0 },
  advanceBtn: { borderRadius: 10, paddingHorizontal: 10, minHeight: 38, justifyContent: 'center' },
});
