import { tabAuthStorage } from '@/lib/storage/webTabAuthStorage';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AutomotiveBackground } from '@/components/ui/AutomotiveBackground';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useI18n } from '@/context/I18nContext';
import { useShopAuth } from '@/context/ShopAuthContext';
import { PitStopEgWordmark } from '@/components/ui/PitStopEgWordmark';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { isStrongPassword } from '@/lib/authValidation';
import { isValidEgyptMobile } from '@/lib/phone';
import { addCustomerVehicle } from '@/lib/booking/vehicleStorage';
import { resolveReturnTo } from '@/lib/auth/returnTo';
import { preventAuthFormRefresh } from '@/lib/auth/classifySignInError';
import { textInputSubmitProps } from '@/lib/ui/textInputSubmit';
import { userAlert } from '@/lib/ui/userAlert';

const SESSION_KEY = '@pitstop/customer-session';

type RegisterVehicleDraft = { id: string; makeModel: string };

type PasswordInputProps = {
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  theme: ReturnType<typeof useAppTheme>;
  isRTL: boolean;
  submitEnabled?: boolean;
  onSubmit?: () => void;
  invalid?: boolean;
};

const AUTH_ERROR_BORDER = '#EF4444';

function PasswordInput({
  placeholder,
  value,
  onChangeText,
  theme,
  isRTL,
  submitEnabled = true,
  onSubmit,
  invalid = false,
}: PasswordInputProps) {
  const [secureTextEntry, setSecureTextEntry] = useState(true);
  const submitProps = onSubmit ? textInputSubmitProps({ enabled: submitEnabled, onSubmit }) : undefined;

  return (
    <View
      style={[
        styles.passwordRow,
        { backgroundColor: theme.bgElevated, borderColor: invalid ? AUTH_ERROR_BORDER : theme.border },
        isRTL && styles.passwordRowRtl,
      ]}>
      <TextInput
        placeholder={placeholder}
        placeholderTextColor={theme.textDim}
        secureTextEntry={secureTextEntry}
        autoCapitalize="none"
        autoCorrect={false}
        value={value}
        onChangeText={onChangeText}
        style={[styles.passwordInput, { color: theme.text, textAlign: isRTL ? 'right' : 'left' }]}
        {...submitProps}
      />
      <Pressable
        onPress={() => setSecureTextEntry((current) => !current)}
        hitSlop={8}
        style={styles.passwordToggle}
        accessibilityRole="button"
        accessibilityLabel={secureTextEntry ? 'Show password' : 'Hide password'}>
        <FontAwesome name={secureTextEntry ? 'eye' : 'eye-slash'} size={18} color={theme.textMuted} />
      </Pressable>
    </View>
  );
}

function AuthFormShell({
  children,
  style,
}: {
  children: React.ReactNode;
  style: object;
}) {
  if (Platform.OS === 'web') {
    return React.createElement(
      'form',
      {
        noValidate: true,
        onSubmit: (event: { preventDefault: () => void }) => {
          event.preventDefault();
        },
      },
      <View style={style}>{children}</View>,
    );
  }
  return <View style={style}>{children}</View>;
}

function newVehicleDraft(): RegisterVehicleDraft {
  return { id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, makeModel: '' };
}

type SubmitPhase = 'idle' | 'signing_in' | 'registering' | 'redirecting';

export default function WelcomeScreen() {
  const { focus, returnTo, pending } = useLocalSearchParams<{ focus?: string; returnTo?: string; pending?: string }>();
  const router = useRouter();
  const { t, locale, setLocale, isRTL } = useI18n();
  const theme = useAppTheme();
  const { login: loginCustomer, register, resetPassword, continueAsGuest, busy: customerBusy } = useCustomerAuth();
  const { login: loginShop, busy: shopBusy, isPendingOwner } = useShopAuth();

  const [isRegister, setIsRegister] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [passwordInvalid, setPasswordInvalid] = useState(false);
  const [submitPhase, setSubmitPhase] = useState<SubmitPhase>('idle');
  const [registerVehicles, setRegisterVehicles] = useState<RegisterVehicleDraft[]>([newVehicleDraft()]);
  const submitLockRef = useRef(false);

  useEffect(() => {
    if (focus === 'register') {
      setIsRegister(true);
      return;
    }
    if (focus === 'login' || focus === 'owner') {
      setIsRegister(false);
    }
  }, [focus]);

  useEffect(() => {
    if (pending === '1' || isPendingOwner) {
      setIsRegister(false);
      setFormMessage(t('owner_pending_approval_body'));
    }
  }, [pending, isPendingOwner, t]);

  async function saveRegisterVehiclesForCustomer(customerId: string) {
    const rows = registerVehicles.map((row) => row.makeModel.trim()).filter(Boolean);
    for (const makeModel of rows) {
      await addCustomerVehicle(customerId, { makeModel });
    }
  }

  function loginFailureMessage(kind: string): string {
    if (kind === 'rate_limited') return t('auth_login_rate_limited_body');
    if (kind === 'network_error') return t('auth_login_network_body');
    if (kind === 'not_configured') return t('customer_supabase_not_configured');
    return t('auth_login_invalid_body');
  }

  function applyLoginFailure(kind: string) {
    setPassword('');
    setPasswordInvalid(true);
    setFormMessage(loginFailureMessage(kind));
  }

  async function onCustomerSubmit(event?: { preventDefault?: () => void }) {
    preventAuthFormRefresh(event);
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    setFormMessage('');
    setPasswordInvalid(false);
    setSubmitPhase(isRegister ? 'registering' : 'signing_in');
    try {
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
        const customerId = await tabAuthStorage.getItem(SESSION_KEY);
        if (customerId) {
          await saveRegisterVehiclesForCustomer(customerId);
        }
        return;
      }

      const shopResult = await loginShop(email, password);
      if (shopResult === 'email_not_confirmed') {
        setFormMessage(t('customer_login_verify_email_body'));
        userAlert(t('customer_verify_email_title'), t('customer_login_verify_email_body'));
        return;
      }
      if (shopResult === 'email_login_disabled') {
        setFormMessage(t('shop_login_email_disabled_body'));
        userAlert(t('shop_login_email_disabled_title'), t('shop_login_email_disabled_body'));
        return;
      }
      if (shopResult === 'pending_approval') {
        setFormMessage(t('owner_pending_approval_body'));
        userAlert(t('owner_pending_approval_title'), t('owner_pending_approval_body'));
        return;
      }
      if (shopResult === 'ok_admin') {
        setSubmitPhase('redirecting');
        router.replace('/admin' as Href);
        return;
      }
      if (shopResult === 'ok') {
        setSubmitPhase('redirecting');
        router.replace('/shop');
        return;
      }

      if (shopResult !== 'shop_not_found') {
        applyLoginFailure(shopResult);
        return;
      }

      const ok = await loginCustomer(email, password);
      if (ok === 'email_not_confirmed') {
        setFormMessage(t('customer_login_verify_email_body'));
        Alert.alert(t('customer_verify_email_title'), t('customer_login_verify_email_body'));
        return;
      }
      if (ok === 'email_login_disabled') {
        setFormMessage(t('shop_login_email_disabled_body'));
        userAlert(t('shop_login_email_disabled_title'), t('shop_login_email_disabled_body'));
        return;
      }
      if (ok !== 'ok') {
        if (shopResult === 'shop_not_found' && (ok === 'invalid' || ok === 'invalid_credentials')) {
          setPassword('');
          setPasswordInvalid(true);
          setFormMessage(t('shop_login_shop_not_found_body'));
          return;
        }
        applyLoginFailure(ok);
        return;
      }
      setSubmitPhase('redirecting');
      setFormMessage(t('customer_login_success'));
      router.replace(resolveReturnTo(returnTo) ?? '/');
    } finally {
      submitLockRef.current = false;
      setSubmitPhase((phase) => (phase === 'redirecting' ? phase : 'idle'));
    }
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
    setFormMessage('');
    setRegisterVehicles([newVehicleDraft()]);
    setIsRegister((value) => !value);
  }

  const authBusy = customerBusy || shopBusy;
  const formBusy = submitPhase !== 'idle' || authBusy;

  function submitButtonLabel(idleLabel: string, registerIdleLabel?: string): string {
    if (submitPhase === 'signing_in') return t('auth_signing_in');
    if (submitPhase === 'registering') return t('auth_registering');
    if (submitPhase === 'redirecting') return t('auth_redirecting');
    if (authBusy) return isRegister ? t('auth_registering') : t('auth_signing_in');
    return isRegister && registerIdleLabel ? registerIdleLabel : idleLabel;
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <AutomotiveBackground theme={theme} variant="welcome" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <PitStopEgWordmark size="hero" style={styles.logoWrap} />
            <Text style={[styles.heroHeadline, { color: theme.text }]}>{t('welcome_hero_title')}</Text>
            <Text style={[styles.tagline, { color: theme.textMuted }]}>{t('welcome_tagline')}</Text>
          </View>

          {!isRegister ? (
            <Pressable
              onPress={async () => {
                await continueAsGuest();
                router.replace(resolveReturnTo(returnTo) ?? '/');
              }}
              style={[styles.guestBtn, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
              <Text style={[styles.guestBtnText, { color: theme.text }]}>{t('welcome_guest_btn')}</Text>
            </Pressable>
          ) : null}

          <AuthFormShell style={[styles.formBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
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
                  returnKeyType="next"
                  value={email}
                  onChangeText={setEmail}
                  style={[styles.input, { backgroundColor: theme.bgElevated, borderColor: theme.border, color: theme.text }]}
                />
                <PasswordInput
                  placeholder={t('customer_password_placeholder')}
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (passwordInvalid) setPasswordInvalid(false);
                  }}
                  theme={theme}
                  isRTL={isRTL}
                  invalid={passwordInvalid}
                  submitEnabled={!formBusy && !!email.trim() && !!password.trim()}
                  onSubmit={() => {
                    void onCustomerSubmit();
                  }}
                />
                {isRegister ? <Text style={[styles.passwordHint, { color: theme.textDim }]}>{t('customer_password_rules')}</Text> : null}
                {isRegister ? (
                  <View style={[styles.vehiclesBox, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                    <Text style={[styles.vehiclesTitle, { color: theme.text }]}>{t('auth_register_vehicles_title')}</Text>
                    <Text style={[styles.vehiclesLead, { color: theme.textMuted }]}>{t('auth_register_vehicles_lead')}</Text>
                    {registerVehicles.map((vehicle) => (
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
                      <Text style={[styles.addVehicleText, { color: theme.warm }]}>{t('auth_register_add_vehicle')}</Text>
                    </Pressable>
                  </View>
                ) : null}
                <Pressable
                  onPress={onCustomerSubmit}
                  disabled={formBusy}
                  accessibilityRole="button"
                  {...(Platform.OS === 'web' ? ({ type: 'button' } as object) : {})}
                  style={[styles.submitBtn, formBusy && { opacity: 0.6 }]}>
                  <View
                    pointerEvents="none"
                    style={[styles.submitGradient, { backgroundColor: theme.accent }]}>
                    <Text pointerEvents="none" style={[styles.submitText, { color: theme.onAccent }]}>
                      {submitButtonLabel(
                        t('customer_login_btn'),
                        t('customer_register_btn'),
                      )}
                    </Text>
                  </View>
                </Pressable>
                {formMessage ? (
                  <Text style={[styles.formMessage, { color: passwordInvalid ? AUTH_ERROR_BORDER : theme.warm }]}>{formMessage}</Text>
                ) : null}
                <Pressable onPress={toggleCustomerRegister} hitSlop={10} style={styles.switchLink}>
                  <Text style={[styles.switchText, { color: theme.warm }]}>
                    {isRegister ? t('customer_have_account') : t('customer_create_account')}
                  </Text>
                </Pressable>
                {!isRegister ? (
                  <Pressable onPress={onForgotPassword} style={styles.switchLink}>
                    <Text style={[styles.resetText, { color: theme.textMuted }]}>{t('customer_forgot_password')}</Text>
                  </Pressable>
                ) : null}
              </>
          </AuthFormShell>
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
  screen: { flex: 1 },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 40,
    justifyContent: 'center',
  },
  hero: { alignItems: 'center', marginBottom: 28 },
  logoWrap: {
    marginBottom: 20,
  },
  heroHeadline: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 0.1,
    textAlign: 'center',
    lineHeight: 32,
    marginBottom: 8,
    maxWidth: 320,
  },
  tagline: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: 320,
  },
  guestBtn: {
    borderWidth: 1,
    borderRadius: 999,
    alignItems: 'center',
    paddingVertical: 13,
    marginBottom: 12,
  },
  guestBtnText: { fontSize: 15, fontWeight: '700' },
  formBox: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 22,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  formLead: { fontSize: 15, lineHeight: 22, fontWeight: '600', marginBottom: 14 },
  input: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 12,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 999,
    marginBottom: 12,
  },
  passwordRowRtl: { flexDirection: 'row-reverse' },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  passwordToggle: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  submitBtn: {
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 8,
    shadowColor: 'transparent',
    elevation: 0,
  },
  submitGradient: { minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 999 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '600', letterSpacing: 0.5 },
  switchLink: { marginTop: 14, alignItems: 'center' },
  switchText: { fontSize: 15, fontWeight: '700' },
  resetText: { fontSize: 14, fontWeight: '700' },
  passwordHint: { fontSize: 12, lineHeight: 18, marginTop: -6, marginBottom: 10, fontWeight: '600' },
  formMessage: { fontSize: 12, lineHeight: 18, marginTop: 10, textAlign: 'center', fontWeight: '700' },
  languageWrap: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    gap: 8,
    marginTop: 18,
  },
  languageBtn: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  languageText: { fontSize: 13, fontWeight: '800' },
  vehiclesBox: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  vehiclesTitle: { fontSize: 14, fontWeight: '900', marginBottom: 4 },
  vehiclesLead: { fontSize: 13, lineHeight: 20, marginBottom: 10, fontWeight: '600' },
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
