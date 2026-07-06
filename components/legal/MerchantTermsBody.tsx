import React from 'react';
import { StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';

import type { AppThemeTokens } from '@/constants/Theme';
import type { TranslationKey } from '@/lib/i18n/strings';

type MerchantTermsBodyProps = {
  theme: AppThemeTokens;
  t: (key: TranslationKey) => string;
  isRTL: boolean;
  titleStyle?: TextStyle;
  introStyle?: TextStyle;
  sectionTitleStyle?: TextStyle;
  bodyStyle?: TextStyle;
  containerStyle?: ViewStyle;
};

export function MerchantTermsBody({
  theme,
  t,
  isRTL,
  titleStyle,
  introStyle,
  sectionTitleStyle,
  bodyStyle,
  containerStyle,
}: MerchantTermsBodyProps) {
  const sections = [
    {
      title: t('merchant_settings_terms_section_general_title'),
      body: t('merchant_settings_terms_section_general_body'),
    },
    {
      title: t('merchant_settings_terms_section_payment_title'),
      body: t('merchant_settings_terms_section_payment_body'),
    },
    {
      title: t('merchant_settings_terms_section_acceptance_title'),
      body: t('merchant_settings_terms_section_acceptance_body'),
    },
  ];

  return (
    <View style={[styles.container, containerStyle]}>
      <Text style={[styles.title, { color: theme.text }, isRTL && styles.rtl, titleStyle]}>
        {t('merchant_settings_terms_row')}
      </Text>
      <Text style={[styles.intro, { color: theme.textMuted }, isRTL && styles.rtl, introStyle]}>
        {t('merchant_settings_terms_intro')}
      </Text>
      {sections.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }, isRTL && styles.rtl, sectionTitleStyle]}>
            {section.title}
          </Text>
          <Text style={[styles.body, { color: theme.textMuted }, isRTL && styles.rtl, bodyStyle]}>{section.body}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 14 },
  title: { fontSize: 19, fontWeight: '900' },
  intro: { fontSize: 14, lineHeight: 22 },
  section: { gap: 6 },
  sectionTitle: { fontSize: 16, fontWeight: '800', lineHeight: 22 },
  body: { fontSize: 14, lineHeight: 22 },
  rtl: { textAlign: 'right' },
});
