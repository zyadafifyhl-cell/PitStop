import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { MerchantTermsBody } from '@/components/legal/MerchantTermsBody';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';

export default function MerchantTermsScreen() {
  const theme = useAppTheme();
  const { t, isRTL } = useI18n();

  return (
    <ScrollView style={[styles.screen, { backgroundColor: theme.bg }]} contentContainerStyle={styles.content}>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <MerchantTermsBody theme={theme} t={t} isRTL={isRTL} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { width: '100%', maxWidth: 1024, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
});
