import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AppTheme } from '@/constants/Theme';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useI18n } from '@/context/I18nContext';
import { useShopAuth } from '@/context/ShopAuthContext';
import { useAppTheme, useThemePreference } from '@/context/ThemePreferenceContext';
import { isStrongPassword } from '@/lib/authValidation';
import { isValidEgyptMobile } from '@/lib/phone';

type LoginMode = 'customer' | 'owner';

export default function WelcomeScreen() {
  const { t, locale, setLocale } = useI18n();
  const theme = useAppTheme();
  const { preference } = useThemePreference();
  const { login: loginCustomer, register, resetPassword, busy: customerBusy } = useCustomerAuth();
  const { login: loginShop, busy: shopBusy } = useShopAuth();

  const [mode, setMode] = useState<LoginMode>('customer');
  const [isRegister, setIsRegister] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [formMessage, setFormMessage] = useState('');

  async function onCustomerSubmit() {
    setFormMessage('');
    if (isRegister) {
      if (!isValidEgyptMobile(phone)) {
        setFormMessage(t('auth_phone_invalid_body'));
        Alert.alert(t('auth_phone_invalid_title'), t('auth_phone_invalid_body'));
        return;
      }
      if (!isStrongPassword(password)) {
        setFormMessage(t('customer_weak_password_body'));
        Alert.alert(t('customer_weak_password_title'), t('customer_weak_password_body'));
        return;
      }
      const result = await register({ name, email, phone, password });
      if (result === 'check_email') {
        setFormMessage(t('customer_verify_email_body'));
        Alert.alert(t('customer_verify_email_title'), t('customer_verify_email_body'));
        setIsRegister(false);
        return;
      }
      if (result === 'email_taken') {
        setFormMessage(t('customer_email_taken'));
        Alert.alert(t('customer_register_fail_title'), t('customer_email_taken'));
        return;
      }
      if (result === 'weak_password') {
        setFormMessage(t('customer_weak_password_body'));
        Alert.alert(t('customer_weak_password_title'), t('customer_weak_password_body'));
        return;
      }
      if (result === 'invalid' || result === 'not_configured') {
        setFormMessage(result === 'not_configured' ? t('customer_supabase_not_configured') : t('customer_register_invalid'));
        Alert.alert(t('customer_register_fail_title'), t('customer_register_invalid'));
        return;
      }
      router.replace('/');
      return;
    }

    const ok = await loginCustomer(email, password);
    if (ok === 'email_not_confirmed') {
      setFormMessage(t('customer_login_verify_email_body'));
      Alert.alert(t('customer_verify_email_title'), t('customer_login_verify_email_body'));
      return;
    }
    if (ok !== 'ok') {
      setFormMessage(ok === 'not_configured' ? t('customer_supabase_not_configured') : t('customer_login_fail_body'));
      Alert.alert(t('customer_login_fail_title'), t('customer_login_fail_body'));
      return;
    }
    router.replace('/');
  }

  async function onOwnerSubmit() {
    setFormMessage('');
    const ok = await loginShop(email, password);
    if (!ok) {
      Alert.alert(t('shop_login_fail_title'), t('shop_login_fail_body'));
      return;
    }
    router.replace('/shop');
  }

  async function onForgotPassword() {
    setFormMessage('');
    if (!email.trim()) {
      setFormMessage(t('customer_reset_password_missing_email'));
      Alert.alert(t('customer_reset_password_title'), t('customer_reset_password_missing_email'));
      return;
    }
    const result = await resetPassword(email);
    if (result === 'ok') {
      setFormMessage(t('customer_reset_password_sent'));
      Alert.alert(t('customer_reset_password_title'), t('customer_reset_password_sent'));
      return;
    }
    setFormMessage(t('customer_reset_password_fail'));
    Alert.alert(t('customer_reset_password_title'), t('customer_reset_password_fail'));
  }

  function toggleCustomerRegister() {
    setMode('customer');
    setFormMessage('');
    setIsRegister((value) => !value);
  }

  const busy = mode === 'customer' ? customerBusy : shopBusy;
  const logoSource =
    preference === 'light'
      ? require('../assets/images/pitstop-logo-light.png')
      : require('../assets/images/pitstop-logo-dark.png');

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <LinearGradient
        colors={locale === 'ar' ? [theme.bgElevated, theme.bg, theme.bg] : [theme.bgElevated, theme.bg, theme.bg]}
        style={StyleSheet.absoluteFill}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <View style={[styles.logoWrap, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
              <Image
                source={logoSource}
                style={styles.logoImage}
                resizeMode="cover"
                accessibilityLabel="PitStop logo"
              />
            </View>
            <Text style={[styles.tagline, { color: theme.textMuted }]}>{t('welcome_tagline')}</Text>
          </View>

          <View style={styles.modeRow}>
            <Pressable
              onPress={() => {
                setMode('customer');
                setIsRegister(false);
              }}
              style={[
                styles.modeBtn,
                { backgroundColor: theme.card, borderColor: theme.border },
                mode === 'customer' && { backgroundColor: theme.accent, borderColor: theme.accent },
              ]}>
              <FontAwesome
                name="user"
                size={16}
                color={mode === 'customer' ? theme.onAccent : theme.textMuted}
              />
              <Text style={[styles.modeText, { color: mode === 'customer' ? theme.onAccent : theme.textMuted }]}>
                {t('welcome_customer_btn')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setMode('owner')}
              style={[
                styles.modeBtn,
                { backgroundColor: theme.card, borderColor: theme.border },
                mode === 'owner' && { backgroundColor: theme.warm, borderColor: theme.warm },
              ]}>
              <FontAwesome
                name="briefcase"
                size={16}
                color={mode === 'owner' ? theme.onAccent : theme.textMuted}
              />
              <Text style={[styles.modeText, { color: mode === 'owner' ? theme.onAccent : theme.textMuted }]}>
                {t('welcome_owner_btn')}
              </Text>
            </Pressable>
          </View>

          <View style={[styles.formBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {mode === 'customer' ? (
              <>
                <Text style={[styles.formLead, { color: theme.textMuted }]}>
                  {isRegister ? t('customer_register_lead') : t('customer_login_lead')}
                </Text>
                {isRegister ? (
                  <>
                    <TextInput
                      placeholder={t('customer_name_placeholder')}
                      placeholderTextColor={theme.textDim}
                      value={name}
                      onChangeText={setName}
                      style={[styles.input, { backgroundColor: theme.bgElevated, borderColor: theme.border, color: theme.text }]}
                    />
                    <TextInput
                      placeholder={t('auth_phone_placeholder')}
                      placeholderTextColor={theme.textDim}
                      keyboardType="phone-pad"
                      value={phone}
                      onChangeText={setPhone}
                      style={[styles.input, { backgroundColor: theme.bgElevated, borderColor: theme.border, color: theme.text }]}
                    />
                  </>
                ) : null}
                <TextInput
                  placeholder={t('customer_email_placeholder')}
                  placeholderTextColor={theme.textDim}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                  style={[styles.input, { backgroundColor: theme.bgElevated, borderColor: theme.border, color: theme.text }]}
                />
                <TextInput
                  placeholder={t('customer_password_placeholder')}
                  placeholderTextColor={theme.textDim}
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                  style={[styles.input, { backgroundColor: theme.bgElevated, borderColor: theme.border, color: theme.text }]}
                />
                {isRegister ? <Text style={[styles.passwordHint, { color: theme.textDim }]}>{t('customer_password_rules')}</Text> : null}
                <Pressable
                  onPress={onCustomerSubmit}
                  disabled={busy}
                  style={[styles.submitBtn, busy && { opacity: 0.6 }]}>
                  <LinearGradient
                    colors={[theme.accent, theme.accent]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.submitGradient}>
                    <Text style={[styles.submitText, { color: theme.onAccent }]}>
                      {busy
                        ? t('cloud_busy')
                        : isRegister
                          ? t('customer_register_btn')
                          : t('customer_login_btn')}
                    </Text>
                  </LinearGradient>
                </Pressable>
                {formMessage ? (
                  <Text style={[styles.formMessage, { color: theme.warm }]}>{formMessage}</Text>
                ) : null}
                <Pressable onPress={toggleCustomerRegister} hitSlop={10} style={styles.switchLink}>
                  <Text style={styles.switchText}>
                    {isRegister ? t('customer_have_account') : t('customer_create_account')}
                  </Text>
                </Pressable>
                {!isRegister ? (
                  <Pressable onPress={onForgotPassword} style={styles.switchLink}>
                    <Text style={[styles.resetText, { color: theme.textMuted }]}>{t('customer_forgot_password')}</Text>
                  </Pressable>
                ) : null}
              </>
            ) : (
              <>
                <Text style={[styles.formLead, { color: theme.textMuted }]}>{t('shop_login_lead')}</Text>
                <TextInput
                  placeholder={t('shop_email_label')}
                  placeholderTextColor={theme.textDim}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                  style={[styles.input, { backgroundColor: theme.bgElevated, borderColor: theme.border, color: theme.text }]}
                />
                <TextInput
                  placeholder={t('customer_password_placeholder')}
                  placeholderTextColor={theme.textDim}
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                  style={[styles.input, { backgroundColor: theme.bgElevated, borderColor: theme.border, color: theme.text }]}
                />
                <Pressable
                  onPress={onOwnerSubmit}
                  disabled={busy}
                  style={[styles.submitBtn, busy && { opacity: 0.6 }]}>
                  <LinearGradient
                    colors={[theme.warm, theme.warm]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.submitGradient}>
                    <Text style={[styles.submitText, { color: theme.onAccent }]}>{t('shop_login_btn')}</Text>
                  </LinearGradient>
                </Pressable>
                <Text style={[styles.demoHint, { color: theme.textDim }]}>{t('shop_demo_accounts')}</Text>
              </>
            )}
          </View>
          <View style={styles.languageWrap}>
            <Pressable
              onPress={() => setLocale('en')}
              style={[
                styles.languageBtn,
                { backgroundColor: theme.card, borderColor: theme.border },
                locale === 'en' && { backgroundColor: theme.accent, borderColor: theme.accent },
              ]}>
              <Text style={[styles.languageText, { color: locale === 'en' ? theme.onAccent : theme.textMuted }]}>English</Text>
            </Pressable>
            <Pressable
              onPress={() => setLocale('ar')}
              style={[
                styles.languageBtn,
                { backgroundColor: theme.card, borderColor: theme.border },
                locale === 'ar' && { backgroundColor: theme.accent, borderColor: theme.accent },
              ]}>
              <Text style={[styles.languageText, { color: locale === 'ar' ? theme.onAccent : theme.textMuted }]}>العربية</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppTheme.bg },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 40,
    justifyContent: 'center',
  },
  hero: { alignItems: 'center', marginBottom: 28 },
  logoWrap: {
    width: 160,
    height: 160,
    borderRadius: 34,
    backgroundColor: AppTheme.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: AppTheme.border,
    overflow: 'hidden',
  },
  logoImage: { width: '100%', height: '100%' },
  appName: {
    color: AppTheme.text,
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  tagline: {
    color: AppTheme.textMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 300,
  },
  modeRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: AppTheme.border,
    backgroundColor: AppTheme.card,
  },
  modeBtnActive: { backgroundColor: AppTheme.accent, borderColor: AppTheme.accent },
  modeBtnActiveOwner: { backgroundColor: AppTheme.warm, borderColor: AppTheme.warm },
  modeText: { color: AppTheme.textMuted, fontSize: 14, fontWeight: '700' },
  modeTextActive: { color: '#fff' },
  formBox: {
    borderWidth: 1,
    borderColor: AppTheme.border,
    backgroundColor: AppTheme.card,
    borderRadius: 20,
    padding: 20,
  },
  formLead: { color: AppTheme.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 14 },
  input: {
    borderWidth: 1,
    borderColor: AppTheme.border,
    backgroundColor: AppTheme.bgElevated,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: AppTheme.text,
    fontSize: 16,
    marginBottom: 12,
  },
  submitBtn: { borderRadius: 14, overflow: 'hidden', marginTop: 4 },
  submitGradient: { paddingVertical: 15, alignItems: 'center' },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  switchLink: { marginTop: 14, alignItems: 'center' },
  switchText: { color: AppTheme.accent, fontSize: 14, fontWeight: '600' },
  resetText: { color: AppTheme.textMuted, fontSize: 13, fontWeight: '700' },
  passwordHint: { color: AppTheme.textDim, fontSize: 11, lineHeight: 16, marginTop: -6, marginBottom: 10 },
  formMessage: { fontSize: 12, lineHeight: 18, marginTop: 10, textAlign: 'center', fontWeight: '700' },
  languageWrap: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    gap: 8,
    marginTop: 18,
  },
  languageBtn: {
    borderWidth: 1,
    borderColor: AppTheme.border,
    backgroundColor: AppTheme.card,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  languageBtnActive: { backgroundColor: AppTheme.accent, borderColor: AppTheme.accent },
  languageText: { color: AppTheme.textMuted, fontSize: 12, fontWeight: '800' },
  languageTextActive: { color: '#fff' },
  demoHint: { color: AppTheme.textDim, fontSize: 11, lineHeight: 16, marginTop: 14 },
});
