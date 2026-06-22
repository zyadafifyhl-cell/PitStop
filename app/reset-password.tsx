import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { isStrongPassword } from '@/lib/authValidation';
import { getSupabase } from '@/lib/supabase/client';

export default function ResetPasswordScreen() {
  const { t } = useI18n();
  const theme = useAppTheme();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSave() {
    if (!isStrongPassword(password)) {
      Alert.alert(t('customer_weak_password_title'), t('customer_weak_password_body'));
      return;
    }
    const supabase = getSupabase();
    if (!supabase) {
      Alert.alert(t('customer_reset_password_title'), t('customer_reset_password_fail'));
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        Alert.alert(t('customer_reset_password_title'), t('customer_reset_password_fail'));
        return;
      }
      Alert.alert(t('customer_reset_password_title'), t('customer_reset_password_done'), [
        { text: t('welcome_ok'), onPress: () => router.replace('/welcome') },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.title, { color: theme.text }]}>{t('customer_reset_password_title')}</Text>
        <Text style={[styles.lead, { color: theme.textMuted }]}>{t('customer_reset_password_new_lead')}</Text>
        <TextInput
          placeholder={t('customer_reset_password_new_placeholder')}
          placeholderTextColor={theme.textDim}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          style={[styles.input, { backgroundColor: theme.bgElevated, borderColor: theme.border, color: theme.text }]}
        />
        <Text style={[styles.hint, { color: theme.textDim }]}>{t('customer_password_rules')}</Text>
        <Pressable
          onPress={onSave}
          disabled={busy}
          style={[styles.btn, { backgroundColor: theme.accent, opacity: busy ? 0.65 : 1 }]}>
          <Text style={[styles.btnText, { color: theme.onAccent }]}>{t('customer_reset_password_save')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 20, justifyContent: 'center' },
  card: { borderWidth: 1, borderRadius: 18, padding: 18 },
  title: { fontSize: 24, fontWeight: '900', marginBottom: 8 },
  lead: { fontSize: 14, lineHeight: 20, marginBottom: 14 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
  },
  hint: { fontSize: 12, lineHeight: 18, marginTop: 8 },
  btn: { marginTop: 18, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnText: { fontSize: 16, fontWeight: '800' },
});
