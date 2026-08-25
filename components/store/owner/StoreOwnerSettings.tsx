import { router } from 'expo-router';
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { MerchantNavRow } from '@/components/owner/merchant/MerchantNavRow';
import { OwnerSectionCard } from '@/components/owner/OwnerSectionCard';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { useAppSignOut } from '@/lib/auth/useAppSignOut';
import { showCustomConfirm } from '@/lib/ui/CustomConfirmProvider';

type Props = {
  fieldStyle: object[];
  workOpenTime: string;
  workCloseTime: string;
  scheduleInlineOk: boolean;
  scheduleHint?: string;
  onChangeWorkOpenTime: (value: string) => void;
  onChangeWorkCloseTime: (value: string) => void;
  onSaveSchedule: () => void;
  onOpenNotifications: () => void;
};

export function StoreOwnerSettings({
  fieldStyle,
  workOpenTime,
  workCloseTime,
  scheduleInlineOk,
  scheduleHint,
  onChangeWorkOpenTime,
  onChangeWorkCloseTime,
  onSaveSchedule,
  onOpenNotifications,
}: Props) {
  const theme = useAppTheme();
  const { t, locale, setLocale } = useI18n();
  const { signOut, busy: signingOut } = useAppSignOut();

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
    if (signingOut) return;
    showCustomConfirm({
      title: t('merchant_settings_sign_out_confirm_title'),
      message: t('merchant_settings_sign_out_confirm_body'),
      confirmLabel: t('merchant_settings_sign_out'),
      cancelLabel: t('alert_cancel'),
      destructive: true,
      onConfirm: async () => {
        await clearLocalPitstopCache();
        await signOut({ welcomeFocus: 'owner' });
      },
    });
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

  return (
    <>
      <OwnerSectionCard theme={theme} title={t('shop_manage_schedule_title')} subtitle={t('store_settings_hours_lead')}>
        <Text style={[styles.meta, { color: theme.textMuted }]}>{t('shop_manage_time_format_hint')}</Text>
        <Text style={[styles.label, { color: theme.text }]}>{t('shop_manage_work_open_label')}</Text>
        <TextInput
          placeholder="12:00"
          placeholderTextColor={theme.textDim}
          value={workOpenTime}
          onChangeText={onChangeWorkOpenTime}
          style={fieldStyle}
        />
        <Text style={[styles.label, { color: theme.text }]}>{t('shop_manage_work_close_label')}</Text>
        <TextInput
          placeholder="22:00"
          placeholderTextColor={theme.textDim}
          value={workCloseTime}
          onChangeText={onChangeWorkCloseTime}
          style={fieldStyle}
        />
        {scheduleHint ? <Text style={[styles.meta, { color: theme.accent }]}>{scheduleHint}</Text> : null}
        {scheduleInlineOk ? (
          <Text style={[styles.meta, { color: theme.accent, fontWeight: '800' }]}>
            ✓ {t('shop_schedule_saved_customer_hint')}
          </Text>
        ) : null}
        <Pressable onPress={onSaveSchedule} style={[styles.primaryBtn, { backgroundColor: theme.accent }]}>
          <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>{t('shop_manage_save_schedule')}</Text>
        </Pressable>
      </OwnerSectionCard>

      <OwnerSectionCard theme={theme} title={t('merchant_settings_security_title')}>
        <MerchantNavRow
          theme={theme}
          label={t('merchant_settings_change_password')}
          subtitle={t('merchant_settings_change_password_subtitle')}
          onPress={() => router.push('/shop/merchant-password')}
          showDivider={false}
        />
      </OwnerSectionCard>

      <OwnerSectionCard theme={theme} title={t('merchant_settings_preferences_title')}>
        <MerchantNavRow
          theme={theme}
          label={t('merchant_settings_language_row')}
          subtitle={locale === 'ar' ? t('merchant_settings_language_current_ar') : t('merchant_settings_language_current_en')}
          onPress={() => {
            void setLocale(locale === 'ar' ? 'en' : 'ar');
          }}
        />
        <MerchantNavRow
          theme={theme}
          label={t('store_notifications_row')}
          subtitle={t('store_notifications_subtitle')}
          onPress={onOpenNotifications}
          showDivider={false}
        />
      </OwnerSectionCard>

      <OwnerSectionCard theme={theme} title={t('merchant_settings_support_legal_title')}>
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
      </OwnerSectionCard>

      <Pressable
        onPress={onSignOutPress}
        disabled={signingOut}
        style={[styles.signOutBtn, { borderColor: theme.danger, opacity: signingOut ? 0.65 : 1 }]}>
        <Text style={[styles.signOutText, { color: theme.danger }]}>{t('merchant_settings_sign_out')}</Text>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '800', marginTop: 10, marginBottom: 6 },
  meta: { fontSize: 13, lineHeight: 19, marginBottom: 8 },
  primaryBtn: { marginTop: 14, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  primaryBtnText: { fontWeight: '800', fontSize: 15 },
  signOutBtn: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  signOutText: { fontSize: 16, fontWeight: '800' },
});
