import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/context/ThemePreferenceContext';

/**
 * Legacy merchant-store route. All product browsing, cart persistence, and
 * checkout now run through the canonical products/cart_items/store_orders flow.
 */
export default function PartsShopRedirect() {
  const theme = useAppTheme();
  const { shopId } = useLocalSearchParams<{ shopId?: string }>();

  useEffect(() => {
    router.replace({
      pathname: '/store',
      params: shopId ? { shopId } : undefined,
    });
  }, [shopId]);

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <ActivityIndicator color={theme.accent} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
