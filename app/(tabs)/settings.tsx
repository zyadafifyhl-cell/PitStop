import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, type Href } from 'expo-router';
import React from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { SettingsRow } from '@/components/ui/SettingsRow';
import { SUPPORT } from '@/constants/support';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme, useThemePreference } from '@/context/ThemePreferenceContext';
import { useAppSignOut } from '@/lib/auth/useAppSignOut';
import {
  openSupportEmail,
  openSupportPhone,
  openSupportWhatsApp,
} from '@/lib/linking/contact';

export default function SettingsScreen() {
  const { t, locale, setLocale, isRTL } = useI18n();
  const isArabic = locale === 'ar';
  const theme = useAppTheme();
  const { preference, setPreference } = useThemePreference();
  const { customer, isGuest, resetPassword, verifyPassword } = useCustomerAuth();
  const { signOut, busy: signingOut } = useAppSignOut();
  const [privacyVisible, setPrivacyVisible] = React.useState(false);
  const [privacyUnlocked, setPrivacyUnlocked] = React.useState(false);
  const [privacyPassword, setPrivacyPassword] = React.useState('');
  const [languageOpen, setLanguageOpen] = React.useState(false);

  async function safeOpen(fn: () => Promise<void>) {
    try {
      await fn();
    } catch {
      Alert.alert(t('settings_link_fail_title'), t('settings_link_fail_body'));
    }
  }

  async function onSignOut() {
    await signOut();
  }

  async function onResetPassword() {
    if (!customer?.email) return;
    const result = await resetPassword(customer.email);
    Alert.alert(
      t('customer_reset_password_title'),
      result === 'ok' ? t('customer_reset_password_sent') : t('customer_reset_password_fail'),
    );
  }

  async function unlockPrivacy() {
    const result = await verifyPassword(privacyPassword);
    if (result === 'ok') {
      setPrivacyUnlocked(true);
      setPrivacyPassword('');
      return;
    }
    if (result === 'not_configured') {
      Alert.alert(t('privacy_not_configured_title'), t('privacy_not_configured_body'));
      return;
    }
    Alert.alert(t('privacy_wrong_password_title'), t('privacy_wrong_password_body'));
  }

  function maskValue(value: string, visible = 2): string {
    if (!value) return '••••••';
    if (value.length <= visible) return '•'.repeat(Math.max(4, value.length));
    return `${value.slice(0, visible)}${'•'.repeat(Math.max(4, value.length - visible))}`;
  }

  return (
    <ScrollView style={[styles.screen, { backgroundColor: theme.bg }]} contentContainerStyle={styles.content}>
      {customer && !isGuest ? (
        <View style={[styles.profile, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.profileName, { color: theme.text }]}>{customer.name}</Text>
          <Text style={[styles.profileMeta, { color: theme.textMuted }]}>{customer.email}</Text>
          <Text style={[styles.profileMeta, { color: theme.textMuted }]}>{customer.phone.replace('+20', '0')}</Text>
        </View>
      ) : null}

      {!isGuest ? (
        <>
          <Text style={[styles.section, { color: theme.text }]}>{t('settings_account_section')}</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <SettingsRow
              icon="key"
              label={t('privacy_settings_title')}
              hint={t('privacy_settings_lead')}
              accent={theme.accent}
              onPress={() => {
                setPrivacyVisible(true);
                setPrivacyUnlocked(false);
                setPrivacyPassword('');
              }}
            />
          </View>
        </>
      ) : null}

      <Text style={[styles.section, { color: theme.text }]}>{t('settings_preferences_section')}</Text>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Pressable
          onPress={() => setLanguageOpen((v) => !v)}
          style={[styles.prefRow, styles.prefRowBorder, { borderBottomColor: theme.border }]}>
          <View style={styles.prefTextWrap}>
            <Text style={[styles.toggleTitle, { color: theme.text }, isArabic && styles.toggleTextRtl]}>{t('lang_heading')}</Text>
            <Text style={[styles.toggleHint, { color: theme.textMuted }, isArabic && styles.toggleTextRtl]}>
              {locale === 'ar' ? t('settings_language_arabic') : t('settings_language_english')}
            </Text>
          </View>
          <View style={styles.prefSideSlot}>
            <FontAwesome name={languageOpen ? 'chevron-up' : 'chevron-down'} size={12} color={theme.textDim} />
          </View>
        </Pressable>
        {languageOpen ? (
          <View style={[styles.languageDropdown, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
            <Pressable
              onPress={() => {
                setLocale('en');
                setLanguageOpen(false);
              }}
              style={[styles.languageOption, locale === 'en' && { backgroundColor: theme.accentSoft }, isRTL && styles.languageOptionRtl]}>
              <Text style={[styles.languageOptionText, { color: theme.text }]}>English</Text>
              {locale === 'en' ? <FontAwesome name="check" size={12} color={theme.accent} /> : null}
            </Pressable>
            <Pressable
              onPress={() => {
                setLocale('ar');
                setLanguageOpen(false);
              }}
              style={[styles.languageOption, locale === 'ar' && { backgroundColor: theme.accentSoft }, isRTL && styles.languageOptionRtl]}>
              <Text style={[styles.languageOptionText, { color: theme.text }]}>العربية</Text>
              {locale === 'ar' ? <FontAwesome name="check" size={12} color={theme.accent} /> : null}
            </Pressable>
          </View>
        ) : null}
        <View style={styles.prefRow}>
          <View style={styles.prefTextWrap}>
            <Text style={[styles.toggleTitle, { color: theme.text }, isArabic && styles.toggleTextRtl]}>{t('settings_theme_dark')}</Text>
            <Text style={[styles.toggleHint, { color: theme.textMuted }, isArabic && styles.toggleTextRtl]}>
              {preference === 'dark' ? t('settings_theme_dark') : t('settings_theme_light')}
            </Text>
          </View>
          <View style={styles.prefSideSlot}>
            <Pressable
              onPress={() => setPreference(preference === 'dark' ? 'light' : 'dark')}
              style={styles.themeToggleHit}
              hitSlop={8}>
              <View
                style={[
                  styles.themeToggleTrack,
                  {
                    backgroundColor: preference === 'dark' ? theme.accentSoft : theme.border,
                    borderColor: theme.border,
                    alignItems: preference === 'dark' ? 'flex-end' : 'flex-start',
                  },
                ]}>
                <View
                  style={[
                    styles.themeToggleThumb,
                    { backgroundColor: preference === 'dark' ? theme.accent : theme.textDim },
                  ]}
                />
              </View>
            </Pressable>
          </View>
        </View>
        <Text style={[styles.toggleNote, { color: theme.textDim }, isRTL && styles.toggleTextRtl]}>
          {t('settings_selected')}: {preference === 'dark' ? t('settings_theme_dark') : t('settings_theme_light')}
        </Text>
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
      </View>

      <Text style={[styles.note, { color: theme.textDim }]}>{t('settings_shop_phone_note')}</Text>

      {isGuest ? (
        <SettingsRow
          icon="sign-in"
          label={t('guest_gate_sign_in')}
          hint={t('guest_settings_sign_in_hint')}
          accent={theme.accent}
          onPress={() => router.push({ pathname: '/welcome', params: { focus: 'login' } })}
        />
      ) : (
        <SettingsRow
          icon="sign-out"
          label={t('home_sign_out')}
          accent={theme.danger}
          onPress={onSignOut}
        />
      )}

      <Modal visible={privacyVisible} transparent animationType="fade" onRequestClose={() => setPrivacyVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{t('privacy_settings_title')}</Text>
            <Text style={[styles.modalLead, { color: theme.textMuted }]}>{t('privacy_settings_lead')}</Text>

            {!privacyUnlocked ? (
              <>
                <TextInput
                  placeholder={t('privacy_password_placeholder')}
                  placeholderTextColor={theme.textDim}
                  secureTextEntry
                  value={privacyPassword}
                  onChangeText={setPrivacyPassword}
                  style={[styles.modalInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bgElevated }]}
                />
                <Pressable onPress={unlockPrivacy} style={[styles.modalBtn, { backgroundColor: theme.accent }]}>
                  <Text style={[styles.modalBtnText, { color: theme.onAccent }]}>{t('privacy_unlock')}</Text>
                </Pressable>
                <Pressable onPress={onResetPassword} style={styles.modalLinkBtn}>
                  <Text style={[styles.modalLinkText, { color: theme.accent }]}>{t('privacy_forgot_password')}</Text>
                </Pressable>
              </>
            ) : (
              <View style={styles.privacyInfoWrap}>
                <Text style={[styles.privacyInfoLine, { color: theme.text }]}>
                  {t('privacy_user_label')}: {maskValue(customer?.name ?? '', 1)}
                </Text>
                <Text style={[styles.privacyInfoLine, { color: theme.text }]}>
                  {t('privacy_email_label')}: {maskValue(customer?.email ?? '', 2)}
                </Text>
                <Text style={[styles.privacyInfoLine, { color: theme.text }]}>
                  {t('privacy_phone_label')}: {maskValue(customer?.phone ?? '', 4)}
                </Text>
                <Text style={[styles.privacyInfoLine, { color: theme.text }]}>
                  {t('privacy_password_label')}: {'•'.repeat(12)}
                </Text>
              </View>
            )}

            <Pressable onPress={() => setPrivacyVisible(false)} style={[styles.modalCloseBtn, { borderColor: theme.border }]}>
              <Text style={[styles.modalCloseText, { color: theme.textMuted }]}>{t('alert_cancel')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
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
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  prefRowBorder: {
    borderBottomWidth: 1,
  },
  prefSideSlot: {
    width: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prefTextWrap: { flex: 1 },
  languageDropdown: {
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 8,
    marginBottom: 8,
    overflow: 'hidden',
  },
  languageOption: {
    direction: 'ltr',
    minHeight: 46,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  languageOptionRtl: { flexDirection: 'row-reverse' },
  languageOptionText: { fontSize: 14, fontWeight: '600' },
  themeToggleHit: { paddingVertical: 4 },
  themeToggleTrack: {
    width: 46,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 2,
    justifyContent: 'center',
  },
  themeToggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  toggleTitle: { fontSize: 15, fontWeight: '700' },
  toggleHint: { marginTop: 2, fontSize: 12 },
  toggleNote: { fontSize: 12, marginTop: 8, marginBottom: 4 },
  toggleTextRtl: { textAlign: 'right' },
  note: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
    marginBottom: 20,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 6 },
  modalLead: { fontSize: 13, lineHeight: 19, marginBottom: 10 },
  modalInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
  },
  modalBtn: {
    marginTop: 10,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalBtnText: { fontSize: 15, fontWeight: '800' },
  modalLinkBtn: { marginTop: 10, alignItems: 'center' },
  modalLinkText: { fontSize: 13, fontWeight: '700' },
  privacyInfoWrap: { marginTop: 4, gap: 8 },
  privacyInfoLine: { fontSize: 14, fontWeight: '600' },
  modalCloseBtn: {
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  modalCloseText: { fontSize: 14, fontWeight: '700' },
});
