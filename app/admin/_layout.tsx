import { Stack } from 'expo-router';
import React from 'react';

import { useI18n } from '@/context/I18nContext';

export default function AdminLayout() {
  const { t } = useI18n();
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ title: t('admin_panel_title') }} />
    </Stack>
  );
}
