import { router } from 'expo-router';
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { MerchantNavRow } from '@/components/owner/merchant/MerchantNavRow';
import { OwnerSectionCard } from '@/components/owner/OwnerSectionCard';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { useAppSignOut } from '@/lib/auth/useAppSignOut';
import type { StoreOperatingStatus } from '@/lib/booking/types';
import type { TranslationKey } from '@/lib/i18n/strings';

type Props = {
  fieldStyle: object[];
  workOpenTime: string;
  workCloseTime: string;
  scheduleInlineOk: boolean;
  scheduleHint?: string;
  storeStatus: StoreOperatingStatus;
  statusBusy?: boolean;
  onChangeWorkOpenTime: (value: string) => void;
  onChangeWorkCloseTime: (value: string) => void;
  onSaveSchedule: () => void;
  onChangeStoreStatus: (status: StoreOperatingStatus) => void;
  onOpenNotifications: () => void;
};

const STATUS_OPTIONS: { id: StoreOperatingStatus; labelKey: TranslationKey }[] = [
  { id: 'open', labelKey: 'store_status_open' },
  { id: 'closed', labelKey: 'store_status_closed' },
  { id: 'maintenance', labelKey: 'store_status_maintenance' },
];

export function StoreOwnerSettings({
  fieldStyle,
  workOpenTime,
  workCloseTime,
  scheduleInlineOk,
  scheduleHint,
  storeStatus,
  statusBusy,
  onChangeWorkOpenTime,
  onChangeWorkCloseTime,
  onSaveSchedule,
  onChangeStoreStatus,
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
      <OwnerSectionCard theme={theme} title={t('store_status_title')} subtitle={t('store_status_lead')}>
        <View style={styles.statusRow}>
          {STATUS_OPTIONS.map((option) => {
            const active = storeStatus === option.id;
            return (
              <Pressable
                key={option.id}
                disabled={statusBusy}
                onPress={() => onChangeStoreStatus(option.id)}
                style={[
                  styles.statusChip,
                  {
                    backgroundColor: active ? theme.accent : theme.bgElevated,
                    borderColor: active ? theme.accent : theme.border,
                    opacity: statusBusy ? 0.7 : 1,
                  },
                ]}>
                <Text style={[styles.statusChipText, { color: active ? theme.onAccent : theme.text }]}>
                  {t(option.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </OwnerSectionCard>

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
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 4 },
  statusChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  statusChipText: { fontSize: 13, fontWeight: '800' },
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
