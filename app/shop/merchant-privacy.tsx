import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';

export default function MerchantPrivacyScreen() {
  const theme = useAppTheme();
  const { t, isRTL } = useI18n();

  return (
    <ScrollView style={[styles.screen, { backgroundColor: theme.bg }]} contentContainerStyle={styles.content}>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.title, { color: theme.text }, isRTL && styles.rtl]}>{t('merchant_settings_privacy_row')}</Text>
        <Text style={[styles.body, { color: theme.textMuted }, isRTL && styles.rtl]}>
          {t('merchant_settings_privacy_content')}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  title: { fontSize: 19, fontWeight: '900' },
  body: { fontSize: 14, lineHeight: 22 },
  rtl: { textAlign: 'right' },
});
