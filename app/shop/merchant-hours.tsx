import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import type { ShopDayHours } from '@/lib/booking/types';
import { defaultWeeklyHours } from '@/lib/booking/shopSchedule';
import {
  getActiveWashBranch,
  saveWashBranchWeeklyHours,
  type WashBranchContext,
} from '@/lib/booking/wash/washBranchStorage';
import { WASH_DAY_LABELS } from '@/lib/booking/wash/types';

const EDITOR_DAY_ORDER: ShopDayHours['day'][] = [1, 2, 3, 4, 5, 6, 0];

export default function MerchantHoursScreen() {
  const theme = useAppTheme();
  const { t, locale, isRTL } = useI18n();
  const { ready, shop, shopStaff } = useShopAuth();

  const branchCtx = useMemo<WashBranchContext | undefined>(
    () => (shopStaff ? { staff: shopStaff } : undefined),
    [shopStaff],
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [weeklyHours, setWeeklyHours] = useState<ShopDayHours[]>(defaultWeeklyHours());
  const [selectedDay, setSelectedDay] = useState<ShopDayHours['day']>(1);

  const selectedRow = useMemo(() => {
    return (
      weeklyHours.find((row) => row.day === selectedDay) ??
      defaultWeeklyHours().find((row) => row.day === selectedDay) ?? {
        day: selectedDay,
        closed: false,
        openTime: '09:00',
        closeTime: '21:00',
      }
    );
  }, [weeklyHours, selectedDay]);

  const loadHours = useCallback(async () => {
    if (!shop) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const branch = await getActiveWashBranch(shop, branchCtx);
      setWeeklyHours(branch.weeklyHours?.length ? branch.weeklyHours : defaultWeeklyHours());
    } finally {
      setLoading(false);
    }
  }, [shop, branchCtx]);

  useFocusEffect(
    useCallback(() => {
      void loadHours();
    }, [loadHours]),
  );

  function updateDayHours(day: ShopDayHours['day'], patch: Partial<ShopDayHours>) {
    setWeeklyHours((prev) => prev.map((row) => (row.day === day ? { ...row, ...patch } : row)));
  }

  async function onSave() {
    if (!shop) return;
    for (const row of weeklyHours) {
      if (row.closed) continue;
      if (!row.openTime?.trim() || !row.closeTime?.trim()) {
        Alert.alert(t('wash_hours_invalid_title'), t('wash_hours_invalid_body'));
        return;
      }
    }
    setSaving(true);
    try {
      await saveWashBranchWeeklyHours(shop, weeklyHours, branchCtx);
      Alert.alert(t('wash_hours_saved_title'), t('wash_hours_saved_body'));
    } catch {
      Alert.alert(t('merchant_hours_fail_title'), t('merchant_hours_fail_body'));
    } finally {
      setSaving(false);
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
      <MerchantSettingsCard theme={theme} title={t('merchant_hours_title')} subtitle={t('merchant_hours_lead')}>
        <Text style={[styles.sectionLabel, { color: theme.text }, isRTL && styles.textRtl]}>{t('wash_hours_pick_day')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRow}>
          {EDITOR_DAY_ORDER.map((day) => {
            const active = selectedDay === day;
            return (
              <Pressable
                key={day}
                onPress={() => setSelectedDay(day)}
                style={[
                  styles.dayChip,
                  {
                    backgroundColor: active ? theme.accent : theme.bgElevated,
                    borderColor: active ? theme.accent : theme.border,
                  },
                ]}>
                <Text style={{ color: active ? theme.onAccent : theme.text, fontWeight: '800', fontSize: 12 }}>
                  {WASH_DAY_LABELS[day][locale === 'ar' ? 'ar' : 'en']}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {loading ? (
          <ActivityIndicator color={theme.accent} style={{ marginTop: 16 }} />
        ) : (
          <View style={[styles.dayCard, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
            <Text style={[styles.dayTitle, { color: theme.text }, isRTL && styles.textRtl]}>
              {WASH_DAY_LABELS[selectedRow.day][locale === 'ar' ? 'ar' : 'en']}
            </Text>
            <View style={[styles.toggleRow, styles.actions]}>
              <Pressable
                onPress={() => updateDayHours(selectedRow.day, { closed: false })}
                style={[
                  styles.toggleBtn,
                  {
                    backgroundColor: !selectedRow.closed ? theme.accent : theme.bgElevated,
                    borderColor: !selectedRow.closed ? theme.accent : theme.border,
                  },
                ]}>
                <Text style={{ color: !selectedRow.closed ? theme.onAccent : theme.text, fontWeight: '800' }}>
                  {t('wash_hours_open')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => updateDayHours(selectedRow.day, { closed: true })}
                style={[
                  styles.toggleBtn,
                  {
                    backgroundColor: selectedRow.closed ? theme.danger : theme.bgElevated,
                    borderColor: selectedRow.closed ? theme.danger : theme.border,
                  },
                ]}>
                <Text style={{ color: selectedRow.closed ? '#fff' : theme.text, fontWeight: '800' }}>
                  {t('wash_hours_closed')}
                </Text>
              </Pressable>
            </View>
            {!selectedRow.closed ? (
              <>
                <TextInput
                  placeholder={t('wash_hours_open_time')}
                  placeholderTextColor={theme.textDim}
                  value={selectedRow.openTime ?? ''}
                  onChangeText={(value) => updateDayHours(selectedRow.day, { openTime: value })}
                  style={fieldStyle}
                />
                <TextInput
                  placeholder={t('wash_hours_close_time')}
                  placeholderTextColor={theme.textDim}
                  value={selectedRow.closeTime ?? ''}
                  onChangeText={(value) => updateDayHours(selectedRow.day, { closeTime: value })}
                  style={fieldStyle}
                />
                <TextInput
                  placeholder={t('wash_hours_break_start')}
                  placeholderTextColor={theme.textDim}
                  value={selectedRow.breakStartTime ?? ''}
                  onChangeText={(value) => updateDayHours(selectedRow.day, { breakStartTime: value })}
                  style={fieldStyle}
                />
                <TextInput
                  placeholder={t('wash_hours_break_end')}
                  placeholderTextColor={theme.textDim}
                  value={selectedRow.breakEndTime ?? ''}
                  onChangeText={(value) => updateDayHours(selectedRow.day, { breakEndTime: value })}
                  style={fieldStyle}
                />
              </>
            ) : null}
          </View>
        )}

        <Pressable
          onPress={() => void onSave()}
          disabled={saving || loading}
          style={[styles.primaryBtn, { backgroundColor: theme.accent, opacity: saving || loading ? 0.65 : 1 }]}>
          <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>
            {saving ? t('merchant_hours_saving') : t('wash_hours_save')}
          </Text>
        </Pressable>
      </MerchantSettingsCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sectionLabel: { fontSize: 14, fontWeight: '800', marginBottom: 8 },
  dayRow: { gap: 8, paddingBottom: 12 },
  dayChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  dayCard: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8 },
  dayTitle: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  toggleRow: { marginBottom: 4 },
  toggleBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
  },
  actions: { flexDirection: 'row', gap: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  primaryBtn: { borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 14 },
  primaryBtnText: { fontSize: 15, fontWeight: '800' },
  textRtl: { textAlign: 'right' },
});
