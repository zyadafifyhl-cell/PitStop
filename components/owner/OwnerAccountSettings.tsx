import { router } from 'expo-router';
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { MerchantNavRow } from '@/components/owner/merchant/MerchantNavRow';
import { OwnerSectionCard } from '@/components/owner/OwnerSectionCard';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme, useThemePreference } from '@/context/ThemePreferenceContext';
import { useAppSignOut } from '@/lib/auth/useAppSignOut';

type ExtraRow = {
  label: string;
  subtitle?: string;
  onPress: () => void;
};

type Props = {
  extraPreferenceRows?: ExtraRow[];
};

export function OwnerAccountSettings({ extraPreferenceRows = [] }: Props) {
  const theme = useAppTheme();
  const { t, locale, setLocale, isRTL } = useI18n();
  const { preference, setPreference } = useThemePreference();
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
        <View style={[styles.themeBlock, { borderBottomColor: theme.border }, extraPreferenceRows.length === 0 && styles.themeBlockLast]}>
          <Text style={[styles.themeLabel, { color: theme.text, textAlign: isRTL ? 'right' : 'left' }]}>
            {t('settings_theme_title')}
          </Text>
          <View style={[styles.themeOptions, isRTL && styles.rowReverse]}>
            {(['light', 'dark'] as const).map((option) => {
              const active = preference === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => void setPreference(option)}
                  style={[
                    styles.themeOption,
                    {
                      borderColor: active ? theme.accent : theme.border,
                      backgroundColor: active ? theme.accent : theme.bg,
                    },
                  ]}>
                  <Text style={[styles.themeOptionText, { color: active ? theme.onAccent : theme.text }]}>
                    {option === 'light' ? t('settings_theme_light') : t('settings_theme_dark')}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        {extraPreferenceRows.map((row, index) => (
          <MerchantNavRow
            key={row.label}
            theme={theme}
            label={row.label}
            subtitle={row.subtitle}
            onPress={row.onPress}
            showDivider={index < extraPreferenceRows.length - 1}
          />
        ))}
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
  signOutBtn: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  signOutText: { fontSize: 16, fontWeight: '800' },
  themeBlock: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  themeBlockLast: { borderBottomWidth: 0 },
  themeLabel: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  themeOptions: { flexDirection: 'row', gap: 10 },
  rowReverse: { flexDirection: 'row-reverse' },
  themeOption: { flex: 1, borderWidth: 1, borderRadius: 999, paddingVertical: 11, alignItems: 'center' },
  themeOptionText: { fontSize: 14, fontWeight: '800' },
});
