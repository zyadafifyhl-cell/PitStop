import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { logAndGetSafeErrorMessage } from '@/lib/errors/userError';
import { normalizePhoneE164 } from '@/lib/phone';

export default function LoginScreen() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const { t } = useI18n();
  const { configured, phoneBusy, sendOtp } = useAuth();
  const [rawPhone, setRawPhone] = useState('');
  const [displayName, setDisplayName] = useState('');

  async function onSendCode() {
    const phone = normalizePhoneE164(rawPhone);
    if (!phone) {
      Alert.alert(t('auth_phone_invalid_title'), t('auth_phone_invalid_body'));
      return;
    }
    try {
      await sendOtp(phone);
      router.push({ pathname: '/verify', params: { phone, displayName: displayName.trim() } });
    } catch (e) {
      Alert.alert(t('auth_send_fail_title'), logAndGetSafeErrorMessage(e, t, 'login.sendOtp'));
    }
  }

  return (
    <KeyboardAvoidingView
        style={[styles.screen, { backgroundColor: palette.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {!configured ? (
          <>
            <Text style={[styles.body, { color: palette.text }]}>{t('auth_offline_hint')}</Text>
            <Pressable
              onPress={() => router.replace('/')}
              style={[styles.primaryBtn, { backgroundColor: palette.tint, marginTop: 20 }]}>
              <Text style={styles.primaryBtnText}>{t('auth_continue_home')}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={[styles.lead, { color: palette.text }]}>{t('auth_login_lead')}</Text>
            <Text style={[styles.label, { color: palette.text }]}>{t('auth_phone_label')}</Text>
            <TextInput
              placeholder={t('auth_phone_placeholder')}
              placeholderTextColor={palette.tabIconDefault}
              keyboardType="phone-pad"
              value={rawPhone}
              onChangeText={setRawPhone}
              autoCorrect={false}
              style={[
                styles.input,
                {
                  color: palette.text,
                  borderColor: colorScheme === 'dark' ? '#444' : '#ccc',
                  backgroundColor: colorScheme === 'dark' ? '#1c1c1e' : '#fff',
                },
              ]}
            />
            <Text style={[styles.label, { color: palette.text, marginTop: 14 }]}>
              {t('auth_display_name_label')}
            </Text>
            <TextInput
              placeholder={t('auth_display_name_placeholder')}
              placeholderTextColor={palette.tabIconDefault}
              value={displayName}
              onChangeText={setDisplayName}
              autoCorrect={false}
              style={[
                styles.input,
                {
                  color: palette.text,
                  borderColor: colorScheme === 'dark' ? '#444' : '#ccc',
                  backgroundColor: colorScheme === 'dark' ? '#1c1c1e' : '#fff',
                },
              ]}
            />
            <Pressable
              onPress={onSendCode}
              disabled={phoneBusy}
              style={[
                styles.primaryBtn,
                { backgroundColor: palette.tint, opacity: phoneBusy ? 0.65 : 1 },
              ]}>
              <Text style={styles.primaryBtnText}>{t('auth_send_code')}</Text>
            </Pressable>
          </>
        )}
      </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: 22,
  },
  lead: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 18,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 17,
  },
  primaryBtn: {
    marginTop: 22,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
  },
});
