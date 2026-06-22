import { router, useLocalSearchParams } from 'expo-router';
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

export default function VerifyScreen() {
  const params = useLocalSearchParams<{ phone?: string; displayName?: string }>();
  const phone = typeof params.phone === 'string' ? params.phone : params.phone?.[0];
  const displayNameParam =
    typeof params.displayName === 'string' ? params.displayName : params.displayName?.[0];
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const { t, tp } = useI18n();
  const { phoneBusy, verifyOtp } = useAuth();
  const [code, setCode] = useState('');

  async function onVerify() {
    const token = code.replace(/\s/g, '');
    if (!phone || token.length < 4) {
      Alert.alert(t('auth_verify_invalid_title'), t('auth_verify_invalid_body'));
      return;
    }
    try {
      await verifyOtp(phone, token, displayNameParam ?? '');
      const trimmedName = displayNameParam?.trim() ?? '';
      router.replace('/');
      requestAnimationFrame(() => {
        Alert.alert(
          trimmedName ? tp('welcome_title_named', { name: trimmedName }) : t('welcome_title_plain'),
          t('welcome_body'),
          [{ text: t('welcome_ok') }],
        );
      });
    } catch (e) {
      Alert.alert(t('auth_verify_fail_title'), e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <KeyboardAvoidingView
        style={[styles.screen, { backgroundColor: palette.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Text style={[styles.lead, { color: palette.text }]}>{t('auth_verify_lead')}</Text>
        <Text style={[styles.mono, { color: palette.tabIconDefault }]} selectable>
          {phone ?? '—'}
        </Text>

        <Text style={[styles.label, { color: palette.text, marginTop: 18 }]}>
          {t('auth_code_label')}
        </Text>
        <TextInput
          placeholder={t('auth_code_placeholder')}
          placeholderTextColor={palette.tabIconDefault}
          keyboardType="number-pad"
          value={code}
          onChangeText={setCode}
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
          onPress={onVerify}
          disabled={phoneBusy}
          style={[
            styles.primaryBtn,
            { backgroundColor: palette.tint, opacity: phoneBusy ? 0.65 : 1 },
          ]}>
          <Text style={styles.primaryBtnText}>{t('auth_verify_btn')}</Text>
        </Pressable>

        <Pressable onPress={() => router.back()} style={styles.secondary}>
          <Text style={[styles.secondaryText, { color: palette.tint }]}>{t('auth_change_number')}</Text>
        </Pressable>
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
    marginBottom: 8,
  },
  mono: {
    fontSize: 14,
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
    fontSize: 22,
    letterSpacing: 4,
    fontVariant: ['tabular-nums'],
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
  secondary: {
    marginTop: 18,
    alignItems: 'center',
    paddingVertical: 10,
  },
  secondaryText: {
    fontWeight: '600',
    fontSize: 15,
  },
});
