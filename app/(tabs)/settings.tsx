import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, type Href, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PrivacySettingsModal } from '@/components/settings/PrivacySettingsModal';
import { VehicleManagementCard } from '@/components/settings/VehicleManagementCard';
import { SettingsRow } from '@/components/ui/SettingsRow';
import { SUPPORT } from '@/constants/support';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme, useThemePreference } from '@/context/ThemePreferenceContext';
import { useAppSignOut } from '@/lib/auth/useAppSignOut';
import { getLoyaltyPoints } from '@/lib/booking/loyaltyPointsStorage';
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
  const { customer, isGuest, resetPassword, verifyPassword, updateProfile, deleteAccount } = useCustomerAuth();
  const { signOut, busy: signingOut } = useAppSignOut();
  const [privacyVisible, setPrivacyVisible] = React.useState(false);
  const [languageOpen, setLanguageOpen] = React.useState(false);
  const [termsVisible, setTermsVisible] = React.useState(false);
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);

  const refreshPoints = useCallback(async () => {
    if (!customer || isGuest) {
      setLoyaltyPoints(0);
      return;
    }
    const points = await getLoyaltyPoints({ customerId: customer.id, phone: customer.phone });
    setLoyaltyPoints(points);
  }, [customer, isGuest]);

  useEffect(() => {
    refreshPoints();
  }, [refreshPoints]);

  useFocusEffect(
    useCallback(() => {
      refreshPoints();
    }, [refreshPoints]),
  );

  const themeLabel =
    preference === 'system'
      ? t('settings_theme_system')
      : preference === 'dark'
        ? t('settings_theme_dark')
        : t('settings_theme_light');

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

  return (
    <ScrollView style={[styles.screen, { backgroundColor: theme.bg }]} contentContainerStyle={styles.content}>
      {customer && !isGuest ? (
        <View style={[styles.profile, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.profileName, { color: theme.text }]}>{customer.name}</Text>
          <Text style={[styles.profileMeta, { color: theme.textMuted }]}>{customer.email}</Text>
          <Text style={[styles.profileMeta, { color: theme.textMuted }]}>{customer.phone.replace('+20', '0')}</Text>
          <View style={[styles.pointsCard, { backgroundColor: theme.accentSoft, borderColor: theme.accent }]}>
            <Text style={[styles.pointsLabel, { color: theme.textMuted }]}>{t('loyalty_points_settings_title')}</Text>
            <Text style={[styles.pointsValue, { color: theme.accent }]}>{loyaltyPoints}</Text>
            <Text style={[styles.pointsHint, { color: theme.textMuted }]}>{t('loyalty_points_settings_hint')}</Text>
          </View>
          <Pressable
            onPress={() => router.push('/points-marketplace' as Href)}
            style={[styles.marketplaceBtn, { borderColor: theme.accent, backgroundColor: theme.bgElevated }]}>
            <Text style={[styles.marketplaceBtnText, { color: theme.accent }]}>{t('loyalty_marketplace_link')}</Text>
          </Pressable>
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
              onPress={() => setPrivacyVisible(true)}
            />
            {customer ? <VehicleManagementCard customerId={customer.id} /> : null}
          </View>
        </>
      ) : null}

      <Text style={[styles.section, { color: theme.text }]}>{t('settings_preferences_section')}</Text>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <SettingsRow
          icon="file-text-o"
          label={t('settings_terms')}
          accent={theme.accent}
          onPress={() => setTermsVisible(true)}
        />
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
            <Text style={[styles.toggleTitle, { color: theme.text }, isArabic && styles.toggleTextRtl]}>
              {t('settings_preferences_section')}
            </Text>
            <Text style={[styles.toggleHint, { color: theme.textMuted }, isArabic && styles.toggleTextRtl]}>
              {themeLabel}
            </Text>
          </View>
        </View>
        <View style={styles.themeOptions}>
          {(['light', 'dark', 'system'] as const).map((option) => (
            <Pressable
              key={option}
              onPress={() => setPreference(option)}
              style={[
                styles.themeOption,
                { borderColor: theme.border, backgroundColor: preference === option ? theme.accentSoft : theme.bgElevated },
              ]}>
              <Text style={[styles.themeOptionText, { color: preference === option ? theme.accent : theme.text }]}>
                {option === 'light'
                  ? t('settings_theme_light')
                  : option === 'dark'
                    ? t('settings_theme_dark')
                    : t('settings_theme_system')}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={[styles.toggleNote, { color: theme.textDim }, isRTL && styles.toggleTextRtl]}>
          {t('settings_selected')}: {themeLabel}
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

      {isGuest ? (
        <SettingsRow
          icon="sign-in"
          label={t('guest_gate_sign_in')}
          hint={t('guest_settings_sign_in_hint')}
          accent={theme.accent}
          onPress={() => router.replace({ pathname: '/welcome', params: { focus: 'login' } })}
        />
      ) : (
        <View style={styles.signOutWrap}>
          <SettingsRow
            icon="sign-out"
            label={t('home_sign_out')}
            accent={theme.danger}
            onPress={onSignOut}
          />
        </View>
      )}

      <Modal visible={termsVisible} transparent animationType="fade" onRequestClose={() => setTermsVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{t('settings_terms')}</Text>
            <ScrollView style={styles.termsScroll}>
              <Text style={[styles.termsBody, { color: theme.textMuted }]}>
                {locale === 'ar'
                  ? 'باستخدام PitStop، فإنك توافق على استخدام التطبيق لحجز الخدمات والتواصل مع المحلات. البيانات التجريبية محفوظة محلياً على جهازك. قد تتغير الشروط مع التحديثات المستقبلية.'
                  : 'By using PitStop, you agree to use the app for booking services and communicating with shops. Demo data is stored locally on your device. Terms may change with future updates.'}
              </Text>
            </ScrollView>
            <Pressable onPress={() => setTermsVisible(false)} style={[styles.modalCloseBtn, { borderColor: theme.border }]}>
              <Text style={[styles.modalCloseText, { color: theme.textMuted }]}>{t('welcome_ok')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <PrivacySettingsModal
        visible={privacyVisible}
        customer={customer}
        onClose={() => setPrivacyVisible(false)}
        verifyPassword={verifyPassword}
        updateProfile={updateProfile}
        deleteAccount={deleteAccount}
        resetPassword={resetPassword}
      />
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
  pointsCard: {
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
  },
  pointsLabel: { fontSize: 13, fontWeight: '700' },
  pointsValue: { fontSize: 34, fontWeight: '900', marginVertical: 4 },
  pointsHint: { fontSize: 12, textAlign: 'center', lineHeight: 18 },
  marketplaceBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  marketplaceBtnText: { fontSize: 14, fontWeight: '800' },
  section: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 8,
    marginTop: 8,
  },
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
  themeOptions: { flexDirection: 'row', gap: 8, marginTop: 4, marginBottom: 4 },
  themeOption: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  themeOptionText: { fontSize: 12, fontWeight: '700' },
  termsScroll: { maxHeight: 260, marginBottom: 8 },
  termsBody: { fontSize: 14, lineHeight: 22 },
  toggleTitle: { fontSize: 15, fontWeight: '700' },
  toggleHint: { marginTop: 2, fontSize: 12 },
  toggleNote: { fontSize: 12, marginTop: 8, marginBottom: 4 },
  toggleTextRtl: { textAlign: 'right' },
  signOutWrap: { marginTop: 12 },
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
  modalCloseBtn: {
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  modalCloseText: { fontSize: 14, fontWeight: '700' },
});
