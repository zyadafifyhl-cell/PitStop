import { router } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { OwnerHistoryPanel } from '@/components/owner/OwnerHistoryPanel';
import { useI18n } from '@/context/I18nContext';
import { useShopAuth } from '@/context/ShopAuthContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';

export default function WashHistoryScreen() {
  const theme = useAppTheme();
  const { t } = useI18n();
  const { shop, shopStaff } = useShopAuth();

  if (!shop) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <Text style={{ color: theme.text }}>{t('book_shop_not_found')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.screen, { backgroundColor: theme.bg }]} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} style={styles.backBtn}>
        <Text style={[styles.backText, { color: theme.accent }]}>{t('wash_notif_back')}</Text>
      </Pressable>
      <OwnerHistoryPanel shop={shop} staff={shopStaff} variant="wash" mode="history" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 24, gap: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  backBtn: { paddingVertical: 4, alignSelf: 'flex-start' },
  backText: { fontSize: 14, fontWeight: '700' },
});
