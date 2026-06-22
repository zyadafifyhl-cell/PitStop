import { router, type Href } from 'expo-router';
import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SettingsRow } from '@/components/ui/SettingsRow';
import { AppTheme } from '@/constants/Theme';
import { SUPPORT } from '@/constants/support';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme, useThemePreference } from '@/context/ThemePreferenceContext';
import {
  openSupportEmail,
  openSupportPhone,
  openSupportWhatsApp,
} from '@/lib/linking/contact';

export default function SettingsScreen() {
  const { t, locale, setLocale } = useI18n();
  const theme = useAppTheme();
  const { preference, setPreference } = useThemePreference();
  const { customer, resetPassword, logout } = useCustomerAuth();

  async function safeOpen(fn: () => Promise<void>) {
    try {
      await fn();
    } catch {
      Alert.alert(t('settings_link_fail_title'), t('settings_link_fail_body'));
    }
  }

  async function onSignOut() {
    await logout();
    router.replace('/welcome');
  }

  async function onResetPassword() {
    if (!customer?.email) return;
    const result = await resetPassword(customer.email);
    Alert.alert(
      t('customer_reset_password_title'),
      result === 'ok' ? t('customer_reset_password_sent') : t('customer_reset_password_fail'),
    );
  }

  return (
    <ScrollView style={[styles.screen, { backgroundColor: theme.bg }]} contentContainerStyle={styles.content}>
      {customer ? (
        <View style={[styles.profile, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.profileName, { color: theme.text }]}>{customer.name}</Text>
          <Text style={[styles.profileMeta, { color: theme.textMuted }]}>{customer.email}</Text>
          <Text style={[styles.profileMeta, { color: theme.textMuted }]}>{customer.phone.replace('+20', '0')}</Text>
        </View>
      ) : null}

      <Text style={[styles.section, { color: theme.text }]}>{t('settings_account_section')}</Text>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <SettingsRow
          icon="key"
          label={t('customer_forgot_password')}
          hint={t('settings_reset_password_hint')}
          accent={theme.accent}
          onPress={onResetPassword}
        />
      </View>

      <Text style={[styles.section, { color: theme.text }]}>{t('settings_preferences_section')}</Text>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <SettingsRow
          icon="language"
          label={t('settings_language_english')}
          hint={locale === 'en' ? t('settings_selected') : undefined}
          accent={theme.accent}
          onPress={() => setLocale('en')}
        />
        <SettingsRow
          icon="language"
          label={t('settings_language_arabic')}
          hint={locale === 'ar' ? t('settings_selected') : undefined}
          accent={theme.accent}
          onPress={() => setLocale('ar')}
        />
        <SettingsRow
          icon="sun-o"
          label={t('settings_theme_light')}
          hint={preference === 'light' ? t('settings_selected') : undefined}
          accent={theme.accent}
          onPress={() => setPreference('light')}
        />
        <SettingsRow
          icon="moon-o"
          label={t('settings_theme_dark')}
          hint={preference === 'dark' ? t('settings_selected') : undefined}
          accent={theme.accent}
          onPress={() => setPreference('dark')}
        />
      </View>

      <Text style={[styles.section, { color: theme.text }]}>{t('settings_support_section')}</Text>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <SettingsRow
          icon="phone"
          label={t('settings_call_support')}
          hint={SUPPORT.phoneDisplay}
          accent={theme.accent}
          onPress={() =>
            safeOpen(() => openSupportPhone())
          }
        />
        <SettingsRow
          icon="comment"
          label={t('settings_whatsapp_support')}
          hint={SUPPORT.phoneDisplay}
          accent={theme.accent}
          onPress={() =>
            safeOpen(() =>
              openSupportWhatsApp(
                t('settings_whatsapp_prefill'),
              ),
            )
          }
        />
        <SettingsRow
          icon="envelope"
          label={t('settings_email_support')}
          hint={SUPPORT.email}
          onPress={() =>
            safeOpen(() =>
              openSupportEmail(t('settings_email_subject'), t('settings_email_body')),
            )
          }
        />
      </View>

      <Text style={[styles.section, { color: theme.text }]}>{t('settings_nearest_section')}</Text>
      <Text style={[styles.sectionLead, { color: theme.textMuted }]}>{t('settings_nearest_lead')}</Text>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <SettingsRow
          icon="wrench"
          label={t('service_maintenance_title')}
          hint={t('settings_see_closest')}
          accent={theme.accent}
          onPress={() => router.push('/nearby/maintenance' as Href)}
        />
        <SettingsRow
          icon="tint"
          label={t('service_wash_title')}
          hint={t('settings_see_closest')}
          accent={theme.accent}
          onPress={() => router.push('/nearby/wash' as Href)}
        />
        <SettingsRow
          icon="cogs"
          label={t('service_parts_title')}
          hint={t('settings_see_closest')}
          accent={theme.accent}
          onPress={() => router.push('/nearby/parts' as Href)}
        />
        <SettingsRow
          icon="truck"
          label={t('service_winch_title')}
          hint={t('settings_see_closest')}
          accent={theme.accent}
          onPress={() => router.push('/nearby/winch' as Href)}
        />
      </View>

      <Text style={[styles.note, { color: theme.textDim }]}>{t('settings_shop_phone_note')}</Text>

      <SettingsRow
        icon="sign-out"
        label={t('home_sign_out')}
        accent={theme.danger}
        onPress={onSignOut}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppTheme.bg },
  content: { padding: 20, paddingBottom: 40 },
  profile: {
    marginBottom: 20,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  profileName: { fontSize: 20, fontWeight: '800' },
  profileMeta: { fontSize: 14, marginTop: 4 },
  section: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 8,
    marginTop: 8,
  },
  sectionLead: { fontSize: 14, lineHeight: 20, marginBottom: 10 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  note: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
    marginBottom: 20,
  },
});
