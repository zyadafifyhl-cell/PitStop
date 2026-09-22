import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { MerchantSettingsCard } from '@/components/owner/merchant/MerchantSettingsCard';
import { useI18n } from '@/context/I18nContext';
import { useShopAuth } from '@/context/ShopAuthContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import {
  addBranchEmployeeRemote,
  listBranchEmployeesRemote,
  removeBranchEmployeeRemote,
} from '@/lib/booking/wash/branchRepository';
import {
  getActiveWashBranch,
  getWashBranchState,
  setActiveWashBranch,
  type WashBranchContext,
} from '@/lib/booking/wash/washBranchStorage';
import type { WashBranch } from '@/lib/booking/wash/types';
import type { DbBranchEmployee } from '@/lib/supabase/database.types';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function branchLabel(branch: WashBranch, locale: 'en' | 'ar'): string {
  return locale === 'ar' ? branch.nameAr || branch.name : branch.name;
}

export default function MerchantStaffScreen() {
  const theme = useAppTheme();
  const { t, locale, isRTL } = useI18n();
  const { ready, shop, shopStaff, isOwner } = useShopAuth();

  const branchCtx = useMemo<WashBranchContext | undefined>(
    () => (shopStaff ? { staff: shopStaff } : undefined),
    [shopStaff],
  );

  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<WashBranch[]>([]);
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  const [employees, setEmployees] = useState<DbBranchEmployee[]>([]);
  const [newEmployeeName, setNewEmployeeName] = useState('');
  const [newEmployeePhone, setNewEmployeePhone] = useState('');
  const [newEmployeeJobTitle, setNewEmployeeJobTitle] = useState('');
  const [employeeBusy, setEmployeeBusy] = useState(false);

  const activeBranch = branches.find((b) => b.id === activeBranchId) ?? branches[0] ?? null;

  const loadStaff = useCallback(async () => {
    if (!shop || !isOwner) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const state = await getWashBranchState(shop, branchCtx);
      setBranches(state.branches);
      const branch = await getActiveWashBranch(shop, branchCtx);
      setActiveBranchId(branch.id);
      if (!isUuid(branch.id)) {
        setEmployees([]);
        return;
      }
      const employeeRows = await listBranchEmployeesRemote(branch.id);
      setEmployees(employeeRows);
    } finally {
      setLoading(false);
    }
  }, [shop, branchCtx, isOwner]);

  useFocusEffect(
    useCallback(() => {
      if (!ready) return;
      if (!isOwner) {
        router.replace('/shop/merchant-settings');
        return;
      }
      void loadStaff();
    }, [ready, isOwner, loadStaff]),
  );

  useEffect(() => {
    if (!shop || !activeBranchId || !isUuid(activeBranchId)) return;
    let cancelled = false;
    (async () => {
      const employeeRows = await listBranchEmployeesRemote(activeBranchId);
      if (cancelled) return;
      setEmployees(employeeRows);
    })();
    return () => {
      cancelled = true;
    };
  }, [shop, activeBranchId]);

  async function onSelectBranch(branchId: string) {
    if (!shop) return;
    setActiveBranchId(branchId);
    await setActiveWashBranch(shop, branchId, branchCtx);
  }

  async function onAddEmployee() {
    if (!activeBranch || !isUuid(activeBranch.id) || !shop) return;
    if (!newEmployeeName.trim()) return;
    setEmployeeBusy(true);
    try {
      const row = await addBranchEmployeeRemote({
        branchId: activeBranch.id,
        shopId: shop.id,
        fullName: newEmployeeName.trim(),
        phone: newEmployeePhone.trim() || undefined,
        jobTitle: newEmployeeJobTitle.trim() || undefined,
      });
      if (row) {
        setEmployees((prev) => [...prev, row]);
        setNewEmployeeName('');
        setNewEmployeePhone('');
        setNewEmployeeJobTitle('');
      }
    } finally {
      setEmployeeBusy(false);
    }
  }

  async function onRemoveEmployee(employeeId: string) {
    setEmployeeBusy(true);
    try {
      const ok = await removeBranchEmployeeRemote(employeeId);
      if (ok) setEmployees((prev) => prev.filter((row) => row.id !== employeeId));
    } finally {
      setEmployeeBusy(false);
    }
  }

  const fieldStyle = [
    styles.input,
    { color: theme.text, borderColor: theme.border, backgroundColor: theme.bgElevated },
  ];

  if (!ready || !shop) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.screen, { backgroundColor: theme.bg }]} contentContainerStyle={styles.content}>
      <MerchantSettingsCard theme={theme} title={t('merchant_staff_branches_title')} subtitle={t('merchant_staff_branches_lead')}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.branchRow}>
          {branches.map((branch) => {
            const active = branch.id === activeBranchId;
            return (
              <Pressable
                key={branch.id}
                onPress={() => void onSelectBranch(branch.id)}
                style={[
                  styles.branchChip,
                  {
                    backgroundColor: active ? theme.accent : theme.bgElevated,
                    borderColor: active ? theme.accent : theme.border,
                  },
                ]}>
                <Text style={{ color: active ? theme.onAccent : theme.text, fontWeight: '800', fontSize: 12 }}>
                  {branchLabel(branch, locale)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </MerchantSettingsCard>

      {loading ? (
        <ActivityIndicator color={theme.accent} />
      ) : (
        <>
          <MerchantSettingsCard theme={theme} title={t('wash_employees_title')} subtitle={t('wash_employees_lead')}>
            <TextInput
              placeholder={t('wash_employee_name_placeholder')}
              placeholderTextColor={theme.textDim}
              value={newEmployeeName}
              onChangeText={setNewEmployeeName}
              style={fieldStyle}
            />
            <TextInput
              placeholder={t('wash_employee_phone_placeholder')}
              placeholderTextColor={theme.textDim}
              keyboardType="phone-pad"
              value={newEmployeePhone}
              onChangeText={setNewEmployeePhone}
              style={fieldStyle}
            />
            <TextInput
              placeholder={t('wash_employee_job_placeholder')}
              placeholderTextColor={theme.textDim}
              value={newEmployeeJobTitle}
              onChangeText={setNewEmployeeJobTitle}
              style={fieldStyle}
            />
            <Pressable
              onPress={() => void onAddEmployee()}
              disabled={employeeBusy}
              style={[styles.primaryBtn, { backgroundColor: theme.accent, opacity: employeeBusy ? 0.65 : 1 }]}>
              <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>{t('wash_employee_add')}</Text>
            </Pressable>
            {employees.length === 0 ? (
              <Text style={[styles.rowMeta, { color: theme.textMuted, marginTop: 12 }, isRTL && styles.textRtl]}>
                {t('wash_employees_empty')}
              </Text>
            ) : (
              employees.map((employee) => (
                <View
                  key={employee.id}
                  style={[styles.rowCard, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowTitle, { color: theme.text }]}>{employee.full_name}</Text>
                    {employee.phone ? (
                      <Text style={[styles.rowMeta, { color: theme.textMuted }]}>{employee.phone}</Text>
                    ) : null}
                    {employee.job_title ? (
                      <Text style={[styles.rowMeta, { color: theme.textMuted }]}>{employee.job_title}</Text>
                    ) : null}
                  </View>
                  <Pressable
                    onPress={() => void onRemoveEmployee(employee.id)}
                    style={[styles.removeBtn, { borderColor: theme.danger }]}>
                    <Text style={{ color: theme.danger, fontWeight: '600', fontSize: 12, letterSpacing: 0.5 }}>
                      {t('wash_employee_remove')}
                    </Text>
                  </Pressable>
                </View>
              ))
            )}
          </MerchantSettingsCard>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { width: '100%', maxWidth: 1024, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  branchRow: { gap: 8, paddingVertical: 4 },
  branchChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginTop: 8 },
  primaryBtn: { borderRadius: 9, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
  primaryBtnText: { fontSize: 15, fontWeight: '600', letterSpacing: 0.5 },
  secondaryBtn: { borderWidth: 1, borderRadius: 9, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  secondaryBtnText: { fontSize: 14, fontWeight: '600', letterSpacing: 0.5 },
  rowCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowTitle: { fontSize: 15, fontWeight: '800' },
  rowMeta: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  removeBtn: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8 },
  textRtl: { textAlign: 'right' },
});
