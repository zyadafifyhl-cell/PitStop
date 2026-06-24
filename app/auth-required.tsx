import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/context/I18nContext';
import { useAppTheme, useThemePreference } from '@/context/ThemePreferenceContext';

export default function AuthRequiredScreen() {
  const { intent, returnTo } = useLocalSearchParams<{ intent?: string; returnTo?: string }>();
  const { t } = useI18n();
  const theme = useAppTheme();
  const { preference } = useThemePreference();

  const actionLabel = intent === 'purchase' ? t('guest_gate_action_purchase') : t('guest_gate_action_book');
  const logoSource =
    preference === 'light'
      ? require('../assets/images/pitstop-logo-light.png')
      : require('../assets/images/pitstop-logo-dark.png');
  const returnParams = returnTo ? { returnTo } : {};

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <Image source={logoSource} style={styles.watermark} contentFit="contain" />

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.title, { color: theme.text }]}>{t('guest_gate_title')}</Text>
        <Text style={[styles.lead, { color: theme.textMuted }]}>
          {t('guest_gate_body').replace('{action}', actionLabel)}
        </Text>

        <Pressable
          onPress={() => router.push({ pathname: '/welcome', params: { focus: 'login', ...returnParams } })}
          style={[styles.primaryBtn, { backgroundColor: theme.accent }]}>
          <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>{t('guest_gate_sign_in')}</Text>
        </Pressable>

        <Pressable
          onPress={() => router.push({ pathname: '/welcome', params: { focus: 'register', ...returnParams } })}
          style={[styles.secondaryBtn, { borderColor: theme.border }]}>
          <Text style={[styles.secondaryBtnText, { color: theme.text }]}>{t('guest_gate_register')}</Text>
        </Pressable>

        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={[styles.backText, { color: theme.textDim }]}>{t('guest_gate_back')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  watermark: {
    position: 'absolute',
    width: 360,
    height: 360,
    opacity: 0.06,
  },
  card: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
  },
  title: { fontSize: 24, fontWeight: '900', marginBottom: 8 },
  lead: { fontSize: 14, lineHeight: 22, marginBottom: 16 },
  primaryBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { fontSize: 15, fontWeight: '800' },
  secondaryBtn: { borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 10 },
  secondaryBtnText: { fontSize: 15, fontWeight: '700' },
  backBtn: { marginTop: 12, alignItems: 'center' },
  backText: { fontSize: 13, fontWeight: '700' },
});
