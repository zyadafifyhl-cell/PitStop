import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { MerchantNavRow } from '@/components/owner/merchant/MerchantNavRow';
import { MerchantSettingsCard } from '@/components/owner/merchant/MerchantSettingsCard';
import { useI18n } from '@/context/I18nContext';
import { useShopAuth } from '@/context/ShopAuthContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { useAppSignOut } from '@/lib/auth/useAppSignOut';
import {
  getActiveWashBranch,
  getWashBranchState,
  saveWashBranchStatus,
  type WashBranchContext,
} from '@/lib/booking/wash/washBranchStorage';
import type { WashShopStatus } from '@/lib/booking/wash/types';

const LIVE_STATUSES: WashShopStatus[] = ['open', 'busy', 'closed'];

function statusLabelKey(status: WashShopStatus): 'wash_status_open' | 'wash_status_busy' | 'wash_status_closed' {
  if (status === 'busy') return 'wash_status_busy';
  if (status === 'closed') return 'wash_status_closed';
  return 'wash_status_open';
}

export default function MerchantSettingsScreen() {
  const theme = useAppTheme();
  const { t, isRTL } = useI18n();
  const { ready, shop, shopStaff, staff, isOwner, isBranchManager } = useShopAuth();
  const { signOut, busy: signingOut } = useAppSignOut();

  const branchCtx = useMemo<WashBranchContext | undefined>(
    () => (shopStaff ? { staff: shopStaff } : undefined),
    [shopStaff],
  );

  const [loading, setLoading] = useState(true);
  const [savingStatus, setSavingStatus] = useState(false);
  const [branchStatus, setBranchStatus] = useState<WashShopStatus>('open');
  const [branchName, setBranchName] = useState('');

  const displayName =
    staff?.fullName?.trim() ||
    shopStaff?.fullName?.trim() ||
    shop?.name ||
    '—';
  const displayEmail = shopStaff?.email ?? staff?.email ?? shop?.ownerEmail ?? '—';
  const roleLabel = isOwner
    ? t('wash_role_owner')
    : isBranchManager
      ? t('wash_role_branch_manager')
      : t('merchant_settings_role_unknown');

  const loadBranch = useCallback(async () => {
    if (!shop) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      await getWashBranchState(shop, branchCtx);
      const branch = await getActiveWashBranch(shop, branchCtx);
      const status = branch.shopStatus ?? 'open';
      setBranchStatus(status === 'vacation' ? 'closed' : status);
      setBranchName(branch.profileName || branch.name);
    } finally {
      setLoading(false);
    }
  }, [shop, branchCtx]);

  useFocusEffect(
    useCallback(() => {
      void loadBranch();
    }, [loadBranch]),
  );

  async function onSelectLiveStatus(next: WashShopStatus) {
    if (!shop || savingStatus || next === branchStatus) return;
    setSavingStatus(true);
    try {
      const branch = await getActiveWashBranch(shop, branchCtx);
      await saveWashBranchStatus(shop, next, branch.vacationMode ?? { enabled: false }, branchCtx);
      setBranchStatus(next);
    } catch {
      Alert.alert(t('merchant_settings_status_fail_title'), t('merchant_settings_status_fail_body'));
    } finally {
      setSavingStatus(false);
    }
  }

  function onSignOutPress() {
    Alert.alert(t('merchant_settings_sign_out_confirm_title'), t('merchant_settings_sign_out_confirm_body'), [
      { text: t('alert_cancel'), style: 'cancel' },
      {
        text: t('merchant_settings_sign_out'),
        style: 'destructive',
        onPress: () => {
          void signOut({ welcomeFocus: 'owner' });
        },
      },
    ]);
  }

  if (!ready) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  if (!shop) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <Text style={[styles.empty, { color: theme.textMuted }]}>{t('merchant_settings_login_required')}</Text>
        <Pressable onPress={() => router.replace('/shop')} style={[styles.primaryBtn, { backgroundColor: theme.accent }]}>
          <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>{t('shop_login_btn')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.screen, { backgroundColor: theme.bg }]} contentContainerStyle={styles.content}>
      <MerchantSettingsCard theme={theme}>
        <Text style={[styles.profileName, { color: theme.text }, isRTL && styles.textRtl]}>{displayName}</Text>
        <Text style={[styles.profileEmail, { color: theme.textMuted }, isRTL && styles.textRtl]}>{displayEmail}</Text>
        <View style={[styles.roleBadge, { backgroundColor: theme.accentSoft, borderColor: theme.accent }]}>
          <Text style={[styles.roleBadgeText, { color: theme.accent }]}>{roleLabel}</Text>
        </View>
        {branchName ? (
          <Text style={[styles.branchHint, { color: theme.textDim }, isRTL && styles.textRtl]}>
            {t('wash_branch_label')}: {branchName}
          </Text>
        ) : null}
      </MerchantSettingsCard>

      <MerchantSettingsCard
        theme={theme}
        title={t('merchant_settings_live_status_title')}
        subtitle={t('merchant_settings_live_status_lead')}>
        {loading ? (
          <ActivityIndicator color={theme.accent} style={{ marginVertical: 8 }} />
        ) : (
          <View style={styles.statusRow}>
            {LIVE_STATUSES.map((status) => {
              const active = branchStatus === status;
              const bg =
                status === 'closed' && active
                  ? theme.danger
                  : status === 'busy' && active
                    ? theme.warm
                    : active
                      ? theme.success
                      : theme.bgElevated;
              const border =
                status === 'closed' && active
                  ? theme.danger
                  : status === 'busy' && active
                    ? theme.warm
                    : active
                      ? theme.success
                      : theme.border;
              return (
                <Pressable
                  key={status}
                  disabled={savingStatus}
                  onPress={() => void onSelectLiveStatus(status)}
                  style={[
                    styles.statusChip,
                    {
                      backgroundColor: bg,
                      borderColor: border,
                      opacity: savingStatus ? 0.65 : 1,
                    },
                  ]}>
                  <Text
                    style={[
                      styles.statusChipText,
                      {
                        color:
                          active && status !== 'busy'
                            ? '#fff'
                            : active && status === 'busy'
                              ? theme.onAccent
                              : theme.text,
                      },
                    ]}>
                    {t(statusLabelKey(status))}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </MerchantSettingsCard>

      {isOwner ? (
        <MerchantSettingsCard theme={theme}>
          <MerchantNavRow
            theme={theme}
            label={t('merchant_settings_staff_row')}
            subtitle={t('merchant_settings_staff_subtitle')}
            onPress={() => router.push('/shop/merchant-staff')}
            showDivider={false}
          />
        </MerchantSettingsCard>
      ) : null}

      <MerchantSettingsCard theme={theme} title={t('merchant_settings_business_title')}>
        <MerchantNavRow
          theme={theme}
          label={t('merchant_settings_services_row')}
          subtitle={t('merchant_settings_services_subtitle')}
          onPress={() => router.push('/shop/merchant-services')}
        />
        <MerchantNavRow
          theme={theme}
          label={t('merchant_settings_hours_row')}
          subtitle={t('merchant_settings_hours_subtitle')}
          onPress={() => router.push('/shop/merchant-hours')}
          showDivider={false}
        />
      </MerchantSettingsCard>

      <MerchantSettingsCard theme={theme} title={t('merchant_settings_security_title')}>
        <MerchantNavRow
          theme={theme}
          label={t('merchant_settings_change_password')}
          subtitle={t('merchant_settings_change_password_subtitle')}
          onPress={() => router.push('/shop/merchant-password')}
          showDivider={false}
        />
      </MerchantSettingsCard>

      <Pressable
        onPress={onSignOutPress}
        disabled={signingOut}
        style={[styles.signOutBtn, { borderColor: theme.danger, opacity: signingOut ? 0.65 : 1 }]}>
        <Text style={[styles.signOutText, { color: theme.danger }]}>{t('merchant_settings_sign_out')}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  empty: { textAlign: 'center', fontSize: 14, lineHeight: 20, marginBottom: 16 },
  primaryBtn: { borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 },
  primaryBtnText: { fontSize: 15, fontWeight: '800' },
  profileName: { fontSize: 20, fontWeight: '900', marginBottom: 4 },
  profileEmail: { fontSize: 14, lineHeight: 20 },
  roleBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 12,
  },
  roleBadgeText: { fontSize: 12, fontWeight: '800' },
  branchHint: { fontSize: 12, marginTop: 10 },
  textRtl: { textAlign: 'right' },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusChip: {
    flex: 1,
    minWidth: '30%',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  statusChipText: { fontSize: 13, fontWeight: '800' },
  signOutBtn: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  signOutText: { fontSize: 16, fontWeight: '800' },
});
