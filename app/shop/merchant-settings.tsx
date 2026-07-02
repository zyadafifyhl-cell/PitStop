import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import {
  ActivityIndicator,
  Alert,
  Platform,
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
import { getActiveWashBranch, getWashBranchState, type WashBranchContext } from '@/lib/booking/wash/washBranchStorage';

export default function MerchantSettingsScreen() {
  const theme = useAppTheme();
  const { t, isRTL, locale, setLocale } = useI18n();
  const { ready, shop, shopStaff, staff } = useShopAuth();
  const { signOut, busy: signingOut } = useAppSignOut();

  const branchCtx = useMemo<WashBranchContext | undefined>(
    () => (shopStaff ? { staff: shopStaff } : undefined),
    [shopStaff],
  );

  const [loading, setLoading] = useState(true);
  const [branchName, setBranchName] = useState('');

  const displayName =
    staff?.fullName?.trim() ||
    shopStaff?.fullName?.trim() ||
    shop?.name ||
    '—';
  const displayEmail = shopStaff?.email ?? staff?.email ?? shop?.ownerEmail ?? '—';
  const roleLabel = staff?.role === 'owner'
    ? t('wash_role_owner')
    : staff?.role === 'branch_manager'
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

  async function clearLocalPitstopCache() {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const pitstopKeys = keys.filter((key) => key.startsWith('@pitstop/'));
      if (pitstopKeys.length) {
        await AsyncStorage.multiRemove(pitstopKeys);
      }
      if (typeof window !== 'undefined') {
        sessionStorage.clear();
      }
    } catch {
      // Best-effort cache wipe; sign-out still proceeds.
    }
  }

  function onSignOutPress() {
    const doSignOut = async () => {
      await clearLocalPitstopCache();
      await signOut({ welcomeFocus: 'owner' });
    };
    if (Platform.OS === 'web') {
      void doSignOut();
      return;
    }
    Alert.alert(t('merchant_settings_sign_out_confirm_title'), t('merchant_settings_sign_out_confirm_body'), [
      { text: t('alert_cancel'), style: 'cancel' },
      {
        text: t('merchant_settings_sign_out'),
        style: 'destructive',
        onPress: () => {
          void doSignOut();
        },
      },
    ]);
  }

  function onToggleLanguage() {
    void setLocale(locale === 'ar' ? 'en' : 'ar');
  }

  function onOpenSupport() {
    Alert.alert(t('merchant_settings_support_contact_row'), t('merchant_settings_support_contact_subtitle'), [
      { text: t('alert_cancel'), style: 'cancel' },
      {
        text: t('merchant_settings_support_email_action'),
        onPress: () => {
          void Linking.openURL('mailto:Pitstopeg26@gmail.com');
        },
      },
      {
        text: t('merchant_settings_support_call_action'),
        onPress: () => {
          void Linking.openURL('tel:01033332022');
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
        {loading ? (
          <ActivityIndicator color={theme.accent} style={{ marginTop: 10 }} />
        ) : branchName ? (
          <Text style={[styles.branchHint, { color: theme.textDim }, isRTL && styles.textRtl]}>
            {t('wash_branch_label')}: {branchName}
          </Text>
        ) : null}
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

      <MerchantSettingsCard theme={theme} title={t('merchant_settings_preferences_title')}>
        <MerchantNavRow
          theme={theme}
          label={t('merchant_settings_language_row')}
          subtitle={locale === 'ar' ? t('merchant_settings_language_current_ar') : t('merchant_settings_language_current_en')}
          onPress={onToggleLanguage}
          showDivider={false}
        />
      </MerchantSettingsCard>

      <MerchantSettingsCard theme={theme} title={t('merchant_settings_support_legal_title')}>
        <MerchantNavRow
          theme={theme}
          label={t('merchant_settings_terms_row')}
          subtitle={t('merchant_settings_terms_subtitle')}
          onPress={() => router.push('/shop/merchant-terms')}
        />
        <MerchantNavRow
          theme={theme}
          label={t('merchant_settings_privacy_row')}
          subtitle={t('merchant_settings_privacy_subtitle')}
          onPress={() => router.push('/shop/merchant-privacy')}
        />
        <MerchantNavRow
          theme={theme}
          label={t('merchant_settings_support_contact_row')}
          subtitle={t('merchant_settings_support_contact_subtitle')}
          onPress={onOpenSupport}
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
  signOutBtn: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  signOutText: { fontSize: 16, fontWeight: '800' },
});
