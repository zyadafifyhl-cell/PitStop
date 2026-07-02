import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { MerchantSettingsCard } from '@/components/owner/merchant/MerchantSettingsCard';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { isStrongPassword } from '@/lib/authValidation';
import { getSupabase } from '@/lib/supabase/client';

export default function MerchantPasswordScreen() {
  const { t, isRTL } = useI18n();
  const theme = useAppTheme();
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [oldPasswordInvalid, setOldPasswordInvalid] = useState(false);
  const [resetRequested, setResetRequested] = useState(false);
  const [recoveryUnlocked, setRecoveryUnlocked] = useState(false);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryUnlocked(true);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const canUpdate = useMemo(() => {
    if (busy) return false;
    if (!isStrongPassword(password)) return false;
    if (password !== confirmPassword) return false;
    return recoveryUnlocked || currentPassword.trim().length > 0;
  }, [busy, password, confirmPassword, recoveryUnlocked, currentPassword]);

  async function onSave() {
    if (!isStrongPassword(password)) {
      Alert.alert(t('customer_weak_password_title'), t('customer_weak_password_body'));
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert(t('merchant_password_mismatch_title'), t('merchant_password_mismatch_body'));
      return;
    }
    const supabase = getSupabase();
    if (!supabase) {
      Alert.alert(t('merchant_password_title'), t('merchant_password_fail_body'));
      return;
    }
    setBusy(true);
    try {
      const session = await supabase.auth.getSession();
      const email = session.data.session?.user?.email?.trim().toLowerCase();
      if (!email) {
        Alert.alert(t('merchant_password_title'), t('merchant_password_fail_body'));
        return;
      }

      if (!recoveryUnlocked) {
        const verify = await supabase.auth.signInWithPassword({
          email,
          password: currentPassword.trim(),
        });
        if (verify.error) {
          setOldPasswordInvalid(true);
          Alert.alert(t('merchant_password_old_invalid_title'), t('merchant_password_old_invalid_body'));
          return;
        }
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        Alert.alert(t('merchant_password_title'), t('merchant_password_fail_body'));
        return;
      }
      Alert.alert(t('merchant_password_saved_title'), t('merchant_password_saved_body'), [
        { text: t('welcome_ok'), onPress: () => router.back() },
      ]);
      setCurrentPassword('');
      setPassword('');
      setConfirmPassword('');
      setOldPasswordInvalid(false);
      setResetRequested(false);
      setRecoveryUnlocked(false);
    } finally {
      setBusy(false);
    }
  }

  async function onForgotPassword() {
    const supabase = getSupabase();
    if (!supabase) {
      Alert.alert(t('merchant_password_title'), t('merchant_password_fail_body'));
      return;
    }
    const session = await supabase.auth.getSession();
    const email = session.data.session?.user?.email?.trim().toLowerCase();
    if (!email) {
      Alert.alert(t('merchant_password_title'), t('merchant_password_fail_body'));
      return;
    }
    const redirectTo =
      typeof window !== 'undefined' ? `${window.location.origin}/welcome` : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined);
    if (error) {
      Alert.alert(t('merchant_password_reset_fail_title'), t('merchant_password_reset_fail_body'));
      return;
    }
    setResetRequested(true);
    Alert.alert(t('merchant_password_reset_sent_title'), t('merchant_password_reset_sent_body'));
  }

  const fieldStyle = [
    styles.input,
    { color: theme.text, borderColor: theme.border, backgroundColor: theme.bgElevated },
  ];

  return (
    <ScrollView style={[styles.screen, { backgroundColor: theme.bg }]} contentContainerStyle={styles.content}>
      <MerchantSettingsCard theme={theme} title={t('merchant_password_title')} subtitle={t('merchant_password_lead')}>
        <TextInput
          placeholder={t('merchant_password_current_placeholder')}
          placeholderTextColor={theme.textDim}
          secureTextEntry
          value={currentPassword}
          onChangeText={(v) => {
            setCurrentPassword(v);
            if (oldPasswordInvalid) setOldPasswordInvalid(false);
          }}
          style={fieldStyle}
        />
        <TextInput
          placeholder={t('merchant_password_new_placeholder')}
          placeholderTextColor={theme.textDim}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          style={fieldStyle}
        />
        <TextInput
          placeholder={t('merchant_password_confirm_placeholder')}
          placeholderTextColor={theme.textDim}
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          style={fieldStyle}
        />
        <Text style={[styles.hint, { color: theme.textDim }, isRTL && styles.textRtl]}>{t('customer_password_rules')}</Text>
        {oldPasswordInvalid ? (
          <View style={styles.recoveryRow}>
            <Text style={[styles.hint, { color: theme.textDim }, isRTL && styles.textRtl]}>
              {t('merchant_password_recovery_hint')}
            </Text>
            <Pressable onPress={() => void onForgotPassword()}>
              <Text style={[styles.recoveryLink, { color: theme.accent }, isRTL && styles.textRtl]}>
                {t('merchant_password_forgot_action')}
              </Text>
            </Pressable>
          </View>
        ) : null}
        {resetRequested && !recoveryUnlocked ? (
          <Text style={[styles.hint, { color: theme.accent }, isRTL && styles.textRtl]}>
            {t('merchant_password_reset_waiting_verification')}
          </Text>
        ) : null}
        {recoveryUnlocked ? (
          <Text style={[styles.hint, { color: theme.accent }, isRTL && styles.textRtl]}>
            {t('merchant_password_recovery_unlocked')}
          </Text>
        ) : null}
        <Pressable
          onPress={() => void onSave()}
          disabled={!canUpdate}
          style={[styles.primaryBtn, { backgroundColor: theme.accent, opacity: canUpdate ? 1 : 0.65 }]}>
          <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>
            {busy ? t('merchant_password_saving') : t('merchant_password_save')}
          </Text>
        </Pressable>
      </MerchantSettingsCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginTop: 8 },
  hint: { fontSize: 12, lineHeight: 18, marginTop: 10 },
  recoveryRow: { marginTop: 10, gap: 6 },
  recoveryLink: { fontSize: 13, fontWeight: '800' },
  primaryBtn: { borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 16 },
  primaryBtnText: { fontSize: 15, fontWeight: '800' },
  textRtl: { textAlign: 'right' },
});
