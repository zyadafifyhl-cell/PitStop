import { tabAuthStorage } from '@/lib/storage/webTabAuthStorage';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AppTheme } from '@/constants/Theme';
import { AutomotiveBackground } from '@/components/ui/AutomotiveBackground';
import { MerchantTermsBody } from '@/components/legal/MerchantTermsBody';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useI18n } from '@/context/I18nContext';
import { useShopAuth } from '@/context/ShopAuthContext';
import { PitStopEgWordmark } from '@/components/ui/PitStopEgWordmark';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { isStrongPassword } from '@/lib/authValidation';
import { isValidEgyptMobile } from '@/lib/phone';
import { addCustomerVehicle } from '@/lib/booking/vehicleStorage';
import { useShopCatalog } from '@/context/ShopCatalogContext';
import { listAreas } from '@/lib/booking/catalogRepository';
import type { ShopType } from '@/lib/booking/types';
import { shopTypeLabel } from '@/lib/booking/format';
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

type LoginMode = 'customer' | 'owner';

type SubmitPhase = 'idle' | 'signing_in' | 'registering' | 'redirecting';

const OWNER_SHOP_TYPES: ShopType[] = ['wash', 'maintenance', 'parts', 'accessories'];

export default function WelcomeScreen() {
  const { focus, returnTo, pending } = useLocalSearchParams<{ focus?: string; returnTo?: string; pending?: string }>();
  const router = useRouter();
  const { t, locale, setLocale, isRTL } = useI18n();
  const theme = useAppTheme();
  const { login: loginCustomer, register, resetPassword, continueAsGuest, busy: customerBusy } = useCustomerAuth();
  const {
    login: loginShop,
    registerOwner,
    busy: shopBusy,
    isPendingOwner,
  } = useShopAuth();
  const { ready: catalogReady } = useShopCatalog();

  const [mode, setMode] = useState<LoginMode>('customer');
  const [isRegister, setIsRegister] = useState(false);
  const [isOwnerRegister, setIsOwnerRegister] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [shopName, setShopName] = useState('');
  const [shopAddress, setShopAddress] = useState('');
  const [shopType, setShopType] = useState<ShopType>('wash');
  const [shopAreaId, setShopAreaId] = useState('maadi');
  const [ownerTermsAccepted, setOwnerTermsAccepted] = useState(false);
  const [ownerTermsModalOpen, setOwnerTermsModalOpen] = useState(false);
  const [isUnderReviewModalVisible, setIsUnderReviewModalVisible] = useState(false);
  const [formMessage, setFormMessage] = useState('');
  const [passwordInvalid, setPasswordInvalid] = useState(false);
  const [submitPhase, setSubmitPhase] = useState<SubmitPhase>('idle');
  const [registerVehicles, setRegisterVehicles] = useState<RegisterVehicleDraft[]>([newVehicleDraft()]);
  const submitLockRef = useRef(false);

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
      setIsOwnerRegister(false);
    }
  }, [focus]);

  useEffect(() => {
    if (pending === '1' || isPendingOwner) {
      setMode('owner');
      setFormMessage(t('owner_pending_approval_body'));
    }
  }, [pending, isPendingOwner, t]);

  const areaOptions = catalogReady ? listAreas() : [];

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

  async function onOwnerSubmit(event?: { preventDefault?: () => void }) {
    preventAuthFormRefresh(event);
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    setFormMessage('');
    setPasswordInvalid(false);
    setSubmitPhase(isOwnerRegister ? 'registering' : 'signing_in');
    try {
      if (isOwnerRegister) {
        if (!isValidEgyptMobile(phone)) {
          setFormMessage(t('auth_phone_invalid_body'));
          userAlert(t('auth_phone_invalid_title'), t('auth_phone_invalid_body'));
          return;
        }
        if (!isStrongPassword(password)) {
          setFormMessage(t('customer_weak_password_body'));
          userAlert(t('customer_weak_password_title'), t('customer_weak_password_body'));
          return;
        }
        if (password.trim() !== confirmPassword.trim()) {
          setFormMessage(t('merchant_password_mismatch_body'));
          userAlert(t('merchant_password_mismatch_title'), t('merchant_password_mismatch_body'));
          return;
        }
        if (!ownerTermsAccepted) {
          setFormMessage(t('owner_register_terms_required_body'));
          userAlert(t('owner_register_terms_required_title'), t('owner_register_terms_required_body'));
          return;
        }
        if (!shopName.trim() || !shopAddress.trim() || !name.trim()) {
          setFormMessage(t('owner_register_invalid'));
          userAlert(t('owner_register_fail_title'), t('owner_register_invalid'));
          return;
        }
        const result = await registerOwner({
          email,
          password,
          fullName: name.trim(),
          phone: phone.trim(),
          shopName: shopName.trim(),
          shopType,
          areaId: shopAreaId,
          address: shopAddress.trim(),
        });
        if (result === 'email_taken') {
          setFormMessage(t('customer_email_taken'));
          userAlert(t('owner_register_fail_title'), t('customer_email_taken'));
          return;
        }
        if (result !== 'ok') {
          setFormMessage(t('owner_register_invalid'));
          userAlert(t('owner_register_fail_title'), t('owner_register_invalid'));
          return;
        }
        setFormMessage('');
        setSubmitPhase('idle');
        setIsUnderReviewModalVisible(true);
        return;
      }

      const result = await loginShop(email, password);
      if (result === 'email_not_confirmed') {
        setFormMessage(t('customer_login_verify_email_body'));
        userAlert(t('customer_verify_email_title'), t('customer_login_verify_email_body'));
        return;
      }
      if (result === 'email_login_disabled') {
        setFormMessage(t('shop_login_email_disabled_body'));
        userAlert(t('shop_login_email_disabled_title'), t('shop_login_email_disabled_body'));
        return;
      }
      if (result === 'shop_not_found') {
        setFormMessage(t('shop_login_shop_not_found_body'));
        userAlert(t('shop_login_shop_not_found_title'), t('shop_login_shop_not_found_body'));
        return;
      }
      if (result === 'pending_approval') {
        setFormMessage(t('owner_pending_approval_body'));
        userAlert(t('owner_pending_approval_title'), t('owner_pending_approval_body'));
        return;
      }
      if (result === 'ok_admin') {
        setSubmitPhase('redirecting');
        router.replace('/admin' as Href);
        return;
      }
      if (result === 'ok') {
        setSubmitPhase('redirecting');
        router.replace('/shop');
        return;
      }
      applyLoginFailure(result);
    } finally {
      submitLockRef.current = false;
      setSubmitPhase((phase) => (phase === 'redirecting' ? phase : 'idle'));
    }
  }

  function resetOwnerRegisterForm() {
    setShopName('');
    setShopAddress('');
    setName('');
    setPhone('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setShopType('wash');
    setShopAreaId('maadi');
    setOwnerTermsAccepted(false);
  }

  function onUnderReviewGotIt() {
    setIsUnderReviewModalVisible(false);
    resetOwnerRegisterForm();
    setIsOwnerRegister(false);
    setMode('owner');
    setFormMessage('');
    setSubmitPhase('idle');
  }

  function toggleOwnerRegister() {
    setFormMessage('');
    setConfirmPassword('');
    setOwnerTermsAccepted(false);
    setIsOwnerRegister((value) => !value);
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

  const authBusy = mode === 'customer' ? customerBusy : shopBusy;
  const formBusy = submitPhase !== 'idle' || authBusy;

  function submitButtonLabel(idleLabel: string, registerIdleLabel?: string): string {
    if (submitPhase === 'signing_in') return t('auth_signing_in');
    if (submitPhase === 'registering') return t('auth_registering');
    if (submitPhase === 'redirecting') return t('auth_redirecting');
    if (authBusy) return isRegister || isOwnerRegister ? t('auth_registering') : t('auth_signing_in');
    const registerMode = mode === 'customer' ? isRegister : isOwnerRegister;
    return registerMode && registerIdleLabel ? registerIdleLabel : idleLabel;
  }

  const ownerAccent = theme.accent;

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <AutomotiveBackground theme={theme} variant="welcome" />
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(30, 90, 230, 0.05)' }]}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <PitStopEgWordmark size="hero" style={styles.logoWrap} />
            <Text style={[styles.heroHeadline, { color: theme.text }]}>{t('welcome_hero_title')}</Text>
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
                mode === 'customer' && styles.modeBtnActive,
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
                mode === 'owner' && styles.modeBtnActive,
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
                router.replace(resolveReturnTo(returnTo) ?? '/');
              }}
              style={[styles.guestBtn, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
              <Text style={[styles.guestBtnText, { color: theme.text }]}>{t('welcome_guest_btn')}</Text>
            </Pressable>
          ) : null}

          <AuthFormShell style={[styles.formBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
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
            ) : (
              <>
                <Text style={[styles.formLead, { color: theme.textMuted }]}>
                  {isOwnerRegister ? t('owner_register_lead') : t('shop_login_lead')}
                </Text>
                {isOwnerRegister ? (
                  <>
                    <TextInput
                      placeholder={t('owner_register_shop_name')}
                      placeholderTextColor={theme.textDim}
                      value={shopName}
                      onChangeText={setShopName}
                      style={[styles.input, { backgroundColor: theme.bgElevated, borderColor: theme.border, color: theme.text }]}
                    />
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
                    <TextInput
                      placeholder={t('owner_register_address')}
                      placeholderTextColor={theme.textDim}
                      value={shopAddress}
                      onChangeText={setShopAddress}
                      style={[styles.input, { backgroundColor: theme.bgElevated, borderColor: theme.border, color: theme.text }]}
                    />
                    <Text style={[styles.passwordHint, { color: theme.textDim }]}>{t('owner_register_type_label')}</Text>
                    <View style={styles.chipRow}>
                      {OWNER_SHOP_TYPES.map((type) => (
                        <Pressable
                          key={type}
                          onPress={() => setShopType(type)}
                          style={[
                            styles.chip,
                            { borderColor: theme.border, backgroundColor: theme.bgElevated },
                            shopType === type && { backgroundColor: ownerAccent, borderColor: ownerAccent },
                          ]}>
                          <Text style={{ color: shopType === type ? theme.onAccent : theme.text, fontSize: 12, fontWeight: '700' }}>
                            {shopTypeLabel(type, locale)}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <Text style={[styles.passwordHint, { color: theme.textDim }]}>{t('owner_register_area_label')}</Text>
                    <View style={styles.chipRow}>
                      {(areaOptions.length ? areaOptions : [{ id: 'maadi', name: 'Maadi', nameAr: 'المعادي', city: '', cityAr: '' }]).map((area) => (
                        <Pressable
                          key={area.id}
                          onPress={() => setShopAreaId(area.id)}
                          style={[
                            styles.chip,
                            { borderColor: theme.border, backgroundColor: theme.bgElevated },
                            shopAreaId === area.id && { backgroundColor: ownerAccent, borderColor: ownerAccent },
                          ]}>
                          <Text style={{ color: shopAreaId === area.id ? theme.onAccent : theme.text, fontSize: 12, fontWeight: '700' }}>
                            {locale === 'ar' ? area.nameAr || area.name : area.name}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                ) : null}
                <TextInput
                  placeholder={t('shop_email_label')}
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
                  submitEnabled={!formBusy && !!email.trim() && !!password.trim() && (!isOwnerRegister || !!confirmPassword.trim())}
                  onSubmit={
                    isOwnerRegister
                      ? undefined
                      : () => {
                          void onOwnerSubmit();
                        }
                  }
                />
                {isOwnerRegister ? (
                  <>
                    <Text style={[styles.passwordHint, { color: theme.textDim }]}>{t('customer_password_rules')}</Text>
                    <PasswordInput
                      placeholder={t('auth_register_confirm_password')}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      theme={theme}
                      isRTL={isRTL}
                      submitEnabled={!formBusy && !!email.trim() && !!password.trim() && !!confirmPassword.trim()}
                      onSubmit={() => {
                        void onOwnerSubmit();
                      }}
                    />
                    <Pressable
                      onPress={() => setOwnerTermsAccepted((value) => !value)}
                      style={[styles.termsRow, isRTL && styles.termsRowRtl]}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: ownerTermsAccepted }}>
                      <View
                        style={[
                          styles.termsCheckbox,
                          { borderColor: theme.border, backgroundColor: theme.bgElevated },
                          ownerTermsAccepted && { backgroundColor: ownerAccent, borderColor: ownerAccent },
                        ]}>
                        {ownerTermsAccepted ? <FontAwesome name="check" size={12} color={theme.onAccent} /> : null}
                      </View>
                      <Text style={[styles.termsLabel, { color: theme.text }, isRTL && styles.textRtl]}>
                        {t('owner_register_terms_checkbox')}
                      </Text>
                    </Pressable>
                    <Pressable onPress={() => setOwnerTermsModalOpen(true)} style={styles.termsViewLink}>
                      <Text style={[styles.termsViewText, { color: theme.warm }]}>{t('owner_register_terms_view')}</Text>
                    </Pressable>
                  </>
                ) : null}
                <Pressable
                  onPress={onOwnerSubmit}
                  disabled={formBusy}
                  accessibilityRole="button"
                  {...(Platform.OS === 'web' ? ({ type: 'button' } as object) : {})}
                  style={[styles.submitBtn, formBusy && { opacity: 0.6 }]}>
                  <View
                    pointerEvents="none"
                    style={[styles.submitGradient, { backgroundColor: ownerAccent }]}>
                    <Text pointerEvents="none" style={[styles.submitText, { color: theme.onAccent }]}>
                      {submitButtonLabel(t('shop_login_btn'), t('owner_register_btn'))}
                    </Text>
                  </View>
                </Pressable>
                {formMessage ? (
                  <Text style={[styles.formMessage, { color: passwordInvalid ? AUTH_ERROR_BORDER : theme.warm }]}>{formMessage}</Text>
                ) : null}
                <Pressable onPress={toggleOwnerRegister} hitSlop={10} style={styles.switchLink}>
                  <Text style={[styles.switchText, { color: theme.warm }]}>
                    {isOwnerRegister ? t('owner_have_account') : t('owner_register_link')}
                  </Text>
                </Pressable>
                <Text style={[styles.demoHint, { color: theme.textDim }]}>{t('shop_demo_accounts')}</Text>
              </>
            )}
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
      <Modal
        visible={ownerTermsModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setOwnerTermsModalOpen(false)}>
        <View style={styles.termsModalOverlay}>
          <View style={[styles.termsModalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <ScrollView contentContainerStyle={styles.termsModalScroll}>
              <MerchantTermsBody theme={theme} t={t} isRTL={isRTL} />
            </ScrollView>
            <Pressable
              onPress={() => setOwnerTermsModalOpen(false)}
              style={[styles.termsModalCloseBtn, { backgroundColor: ownerAccent }]}>
              <Text style={[styles.termsModalCloseText, { color: theme.onAccent }]}>{t('welcome_ok')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal
        visible={isUnderReviewModalVisible}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        statusBarTranslucent
        onRequestClose={onUnderReviewGotIt}>
        <View style={styles.underReviewOverlay}>
          <View style={[styles.underReviewCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={[styles.underReviewIconWrap, { backgroundColor: theme.warmSoft }]}>
              <FontAwesome name="hourglass-half" size={28} color={theme.warm} />
            </View>
            <Text style={[styles.underReviewTitle, { color: theme.text }, isRTL && styles.textRtl]}>
              {t('owner_register_success_title')}
            </Text>
            <Text style={[styles.underReviewBody, { color: theme.textMuted }, isRTL && styles.textRtl]}>
              {t('owner_register_success_body')}
            </Text>
            <Pressable
              onPress={onUnderReviewGotIt}
              style={[styles.underReviewCta, { backgroundColor: ownerAccent }]}
              accessibilityRole="button">
              <Text style={[styles.underReviewCtaText, { color: theme.onAccent }]}>
                {t('owner_register_success_got_it')}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  modeRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  guestBtn: {
    borderWidth: 1,
    borderRadius: 9,
    alignItems: 'center',
    paddingVertical: 13,
    marginBottom: 12,
  },
  guestBtnText: { fontSize: 15, fontWeight: '700' },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 9,
    borderWidth: 1,
  },
  modeBtnActive: {
    transform: [{ scale: 0.99 }],
  },
  modeText: { fontSize: 15, fontWeight: '700' },
  formBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 22,
  },
  formLead: { fontSize: 15, lineHeight: 22, fontWeight: '600', marginBottom: 14 },
  input: {
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 12,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 9,
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
    borderRadius: 9,
    overflow: 'hidden',
    marginTop: 8,
    shadowColor: 'transparent',
    elevation: 0,
  },
  submitGradient: { minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 9 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '600', letterSpacing: 0.5 },
  switchLink: { marginTop: 14, alignItems: 'center' },
  switchText: { fontSize: 15, fontWeight: '700' },
  resetText: { fontSize: 14, fontWeight: '700' },
  passwordHint: { fontSize: 12, lineHeight: 18, marginTop: -6, marginBottom: 10, fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
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
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  languageBtnActive: { backgroundColor: AppTheme.accent, borderColor: AppTheme.accent },
  languageText: { fontSize: 13, fontWeight: '800' },
  languageTextActive: { color: '#fff' },
  demoHint: { fontSize: 12, lineHeight: 18, marginTop: 14, fontWeight: '600' },
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
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  termsRowRtl: { flexDirection: 'row-reverse' },
  termsCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  termsLabel: { flex: 1, fontSize: 13, lineHeight: 20, fontWeight: '600' },
  textRtl: { textAlign: 'right' },
  termsViewLink: { alignSelf: 'flex-start', marginBottom: 8, paddingVertical: 2 },
  termsViewText: { fontSize: 13, fontWeight: '800' },
  termsModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  termsModalCard: {
    borderWidth: 1,
    borderRadius: 12,
    maxHeight: '82%',
    overflow: 'hidden',
  },
  termsModalScroll: { padding: 18, paddingBottom: 8 },
  termsModalCloseBtn: {
    margin: 16,
    marginTop: 8,
    borderRadius: 9,
    paddingVertical: 14,
    alignItems: 'center',
  },
  termsModalCloseText: { fontSize: 15, fontWeight: '800' },
  underReviewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  underReviewCard: {
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 20,
    alignItems: 'center',
  },
  underReviewIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  underReviewTitle: {
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 28,
    textAlign: 'center',
  },
  underReviewBody: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '600',
    textAlign: 'center',
  },
  underReviewCta: {
    marginTop: 22,
    minHeight: 48,
    width: '100%',
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  underReviewCtaText: { fontSize: 16, fontWeight: '800' },
});
