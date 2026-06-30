import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { MerchantSettingsCard } from '@/components/owner/merchant/MerchantSettingsCard';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { isStrongPassword } from '@/lib/authValidation';
import { getSupabase } from '@/lib/supabase/client';

export default function MerchantPasswordScreen() {
  const { t, isRTL } = useI18n();
  const theme = useAppTheme();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);

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
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        Alert.alert(t('merchant_password_title'), t('merchant_password_fail_body'));
        return;
      }
      Alert.alert(t('merchant_password_saved_title'), t('merchant_password_saved_body'), [
        { text: t('welcome_ok'), onPress: () => router.back() },
      ]);
      setPassword('');
      setConfirmPassword('');
    } finally {
      setBusy(false);
    }
  }

  const fieldStyle = [
    styles.input,
    { color: theme.text, borderColor: theme.border, backgroundColor: theme.bgElevated },
  ];

  return (
    <ScrollView style={[styles.screen, { backgroundColor: theme.bg }]} contentContainerStyle={styles.content}>
      <MerchantSettingsCard theme={theme} title={t('merchant_password_title')} subtitle={t('merchant_password_lead')}>
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
        <Pressable
          onPress={() => void onSave()}
          disabled={busy}
          style={[styles.primaryBtn, { backgroundColor: theme.accent, opacity: busy ? 0.65 : 1 }]}>
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
  primaryBtn: { borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 16 },
  primaryBtnText: { fontSize: 15, fontWeight: '800' },
  textRtl: { textAlign: 'right' },
});
