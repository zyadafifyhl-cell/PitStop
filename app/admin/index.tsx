import React from 'react';

import { AdminPanel } from '@/components/admin/AdminPanel';
import { useShopAuth } from '@/context/ShopAuthContext';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { ActivityIndicator, Text, View } from 'react-native';

export default function AdminScreen() {
  const { ready, isAdmin } = useShopAuth();
  const { t } = useI18n();
  const theme = useAppTheme();

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg }}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg, padding: 24 }}>
        <Text style={{ color: theme.text, textAlign: 'center' }}>{t('admin_access_denied')}</Text>
      </View>
    );
  }

  return <AdminPanel />;
}
