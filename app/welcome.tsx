import AsyncStorage from '@react-native-async-storage/async-storage';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
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
import { addCustomerVehicle } from '@/lib/booking/vehicleStorage';

const SESSION_KEY = '@pitstop/customer-session';

type RegisterVehicleDraft = { id: string; makeModel: string };

function newVehicleDraft(): RegisterVehicleDraft {
  return { id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, makeModel: '' };
}

type LoginMode = 'customer' | 'owner';

export default function WelcomeScreen() {
  const { focus } = useLocalSearchParams<{ focus?: string; returnTo?: string }>();
  const { t, locale, setLocale } = useI18n();
  const theme = useAppTheme();
  const { effectivePreference } = useThemePreference();
  const { login: loginCustomer, register, resetPassword, continueAsGuest, busy: customerBusy } = useCustomerAuth();
  const { login: loginShop, busy: shopBusy } = useShopAuth();

  const [mode, setMode] = useState<LoginMode>('customer');
  const [isRegister, setIsRegister] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [registerVehicles, setRegisterVehicles] = useState<RegisterVehicleDraft[]>([newVehicleDraft()]);

  useEffect(() => {
    if (focus === 'register') {
      setMode('customer');
      setIsRegister(true);
      return;
    }
    if (focus === 'login') {
      setMode('customer');
      setIsRegister(false);
      return;
    }
    if (focus === 'owner') {
      setMode('owner');
      setIsRegister(false);
    }
  }, [focus]);

  async function saveRegisterVehiclesForCustomer(customerId: string) {
    const rows = registerVehicles.map((row) => row.makeModel.trim()).filter(Boolean);
    for (const makeModel of rows) {
      await addCustomerVehicle(customerId, { makeModel });
    }
  }

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
      const customerId = await AsyncStorage.getItem(SESSION_KEY);
      if (customerId) {
        await saveRegisterVehiclesForCustomer(customerId);
      }
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
  }

  async function onOwnerSubmit() {
    setFormMessage('');
    const result = await loginShop(email, password);
    if (result === 'invalid_credentials') {
      Alert.alert(t('shop_login_auth_fail_title'), t('shop_login_auth_fail_body'));
      return;
    }
    if (result === 'shop_not_found') {
      Alert.alert(t('shop_login_shop_not_found_title'), t('shop_login_shop_not_found_body'));
      return;
    }
    if (result !== 'ok') {
      Alert.alert(t('shop_login_fail_title'), t('shop_login_fail_body'));
      return;
    }
    // AppBootstrap redirects to /shop when shop auth state updates.
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
    setRegisterVehicles([newVehicleDraft()]);
    setIsRegister((value) => !value);
  }

  const busy = mode === 'customer' ? customerBusy : shopBusy;
  const ownerAccent = effectivePreference === 'light' ? theme.accent : theme.warm;
  const logoSource =
    effectivePreference === 'light'
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
                mode === 'owner' && { backgroundColor: ownerAccent, borderColor: ownerAccent },
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
          {mode === 'customer' ? (
            <Pressable
              onPress={async () => {
                await continueAsGuest();
              }}
              style={[styles.guestBtn, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
              <Text style={[styles.guestBtnText, { color: theme.text }]}>{t('welcome_guest_btn')}</Text>
            </Pressable>
          ) : null}

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
                {isRegister ? (
                  <View style={[styles.vehiclesBox, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                    <Text style={[styles.vehiclesTitle, { color: theme.text }]}>{t('auth_register_vehicles_title')}</Text>
                    <Text style={[styles.vehiclesLead, { color: theme.textMuted }]}>{t('auth_register_vehicles_lead')}</Text>
                    {registerVehicles.map((vehicle, index) => (
                      <View key={vehicle.id} style={styles.vehicleRow}>
                        <TextInput
                          placeholder={t('auth_register_vehicle_placeholder')}
                          placeholderTextColor={theme.textDim}
                          value={vehicle.makeModel}
                          onChangeText={(value) =>
                            setRegisterVehicles((rows) =>
                              rows.map((row) => (row.id === vehicle.id ? { ...row, makeModel: value } : row)),
                            )
                          }
                          style={[
                            styles.vehicleInput,
                            { backgroundColor: theme.card, borderColor: theme.border, color: theme.text },
                          ]}
                        />
                        {registerVehicles.length > 1 ? (
                          <Pressable
                            onPress={() =>
                              setRegisterVehicles((rows) => rows.filter((row) => row.id !== vehicle.id))
                            }
                            hitSlop={8}
                            style={styles.vehicleRemoveBtn}>
                            <FontAwesome name="times-circle" size={22} color={theme.textDim} />
                          </Pressable>
                        ) : null}
                      </View>
                    ))}
                    <Pressable
                      onPress={() => setRegisterVehicles((rows) => [...rows, newVehicleDraft()])}
                      style={styles.addVehicleBtn}>
                      <Text style={[styles.addVehicleText, { color: theme.accent }]}>{t('auth_register_add_vehicle')}</Text>
                    </Pressable>
                  </View>
                ) : null}
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
                  <Text style={[styles.switchText, { color: theme.accent }]}>
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
                    colors={[ownerAccent, ownerAccent]}
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
  guestBtn: {
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 12,
  },
  guestBtnText: { fontSize: 14, fontWeight: '700' },
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
  vehiclesBox: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  vehiclesTitle: { fontSize: 14, fontWeight: '900', marginBottom: 4 },
  vehiclesLead: { fontSize: 12, lineHeight: 18, marginBottom: 10 },
  vehicleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  vehicleInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
  },
  vehicleRemoveBtn: { padding: 4 },
  addVehicleBtn: { alignSelf: 'flex-start', paddingVertical: 4 },
  addVehicleText: { fontSize: 13, fontWeight: '700' },
});
