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
import type { ShopService } from '@/lib/booking/types';
import {
  getActiveWashBranch,
  saveWashBranchServices,
  type WashBranchContext,
} from '@/lib/booking/wash/washBranchStorage';
import { WASH_SERVICE_CATEGORIES } from '@/lib/booking/wash/types';

type ServiceDraft = {
  id: string;
  name: string;
  nameAr?: string;
  priceEgp: string;
  durationMinutes: string;
  category: ShopService['category'];
};

function toDraft(service: ShopService): ServiceDraft {
  return {
    id: service.id,
    name: service.name,
    nameAr: service.nameAr,
    priceEgp: String(service.priceEgp ?? ''),
    durationMinutes: String(service.durationMinutes ?? 30),
    category: service.category ?? 'exterior_wash',
  };
}

function categoryLabel(category: ShopService['category'], locale: 'en' | 'ar'): string {
  const row = WASH_SERVICE_CATEGORIES.find((c) => c.id === category);
  if (!row) return category ?? '—';
  return locale === 'ar' ? row.ar : row.en;
}

export default function MerchantServicesScreen() {
  const theme = useAppTheme();
  const { t, locale, isRTL } = useI18n();
  const { ready, shop, shopStaff } = useShopAuth();

  const branchCtx = useMemo<WashBranchContext | undefined>(
    () => (shopStaff ? { staff: shopStaff } : undefined),
    [shopStaff],
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<ServiceDraft[]>([]);

  const loadServices = useCallback(async () => {
    if (!shop) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const branch = await getActiveWashBranch(shop, branchCtx);
      setRows((branch.services ?? []).map(toDraft));
    } finally {
      setLoading(false);
    }
  }, [shop, branchCtx]);

  useFocusEffect(
    useCallback(() => {
      void loadServices();
    }, [loadServices]),
  );

  function updateRow(id: string, patch: Partial<ServiceDraft>) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  async function onSave() {
    if (!shop) return;
    const services: ShopService[] = rows.map((row, index) => ({
      id: row.id,
      name: row.name,
      nameAr: row.nameAr,
      priceEgp: Number(row.priceEgp) || 0,
      durationMinutes: Number(row.durationMinutes) || 30,
      category: row.category,
      active: true,
      visible: true,
      sortOrder: index,
    }));
    setSaving(true);
    try {
      await saveWashBranchServices(shop, services, branchCtx);
      Alert.alert(t('merchant_services_saved_title'), t('merchant_services_saved_body'));
    } catch {
      Alert.alert(t('merchant_services_fail_title'), t('merchant_services_fail_body'));
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
      <MerchantSettingsCard theme={theme} title={t('merchant_services_title')} subtitle={t('merchant_services_lead')}>
        {loading ? (
          <ActivityIndicator color={theme.accent} />
        ) : rows.length === 0 ? (
          <Text style={[styles.empty, { color: theme.textMuted }, isRTL && styles.textRtl]}>{t('wash_services_empty')}</Text>
        ) : (
          rows.map((row) => (
            <View key={row.id} style={[styles.matrixRow, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
              <Text style={[styles.serviceName, { color: theme.text }, isRTL && styles.textRtl]}>
                {locale === 'ar' ? row.nameAr || row.name : row.name}
              </Text>
              <Text style={[styles.category, { color: theme.textMuted }, isRTL && styles.textRtl]}>
                {categoryLabel(row.category, locale)}
              </Text>
              <View style={styles.matrixFields}>
                <View style={styles.fieldWrap}>
                  <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>{t('merchant_services_price_label')}</Text>
                  <TextInput
                    value={row.priceEgp}
                    onChangeText={(value) => updateRow(row.id, { priceEgp: value })}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={theme.textDim}
                    style={fieldStyle}
                  />
                </View>
                <View style={styles.fieldWrap}>
                  <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>{t('merchant_services_duration_label')}</Text>
                  <TextInput
                    value={row.durationMinutes}
                    onChangeText={(value) => updateRow(row.id, { durationMinutes: value })}
                    keyboardType="number-pad"
                    placeholder="30"
                    placeholderTextColor={theme.textDim}
                    style={fieldStyle}
                  />
                </View>
              </View>
            </View>
          ))
        )}
        <Pressable
          onPress={() => void onSave()}
          disabled={saving || loading || rows.length === 0}
          style={[styles.primaryBtn, { backgroundColor: theme.accent, opacity: saving || rows.length === 0 ? 0.65 : 1 }]}>
          <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>
            {saving ? t('merchant_services_saving') : t('merchant_services_save')}
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
  matrixRow: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 10 },
  serviceName: { fontSize: 16, fontWeight: '800', marginBottom: 2 },
  category: { fontSize: 12, marginBottom: 10 },
  matrixFields: { flexDirection: 'row', gap: 10 },
  fieldWrap: { flex: 1 },
  fieldLabel: { fontSize: 11, fontWeight: '700', marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, fontSize: 15 },
  primaryBtn: { borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 8 },
  primaryBtnText: { fontSize: 15, fontWeight: '800' },
  empty: { fontSize: 14, lineHeight: 20, marginBottom: 8 },
  textRtl: { textAlign: 'right' },
});
