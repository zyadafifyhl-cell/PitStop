import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { CategoryShopsMap } from '@/components/maps/CategoryShopsMap';
import { useI18n } from '@/context/I18nContext';
import { useShopCatalog } from '@/context/ShopCatalogContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import {
  fetchRegisteredShopsForMap,
  subscribeRegisteredShopsMapRealtime,
  type ShopMapPin,
} from '@/lib/booking/shopMapDiscovery';
import type { ShopType } from '@/lib/booking/types';

type Props = {
  shopType: ShopType;
  active: boolean;
};

export function StoreLocationMapPanel({ shopType, active }: Props) {
  const { t, locale } = useI18n();
  const theme = useAppTheme();
  const { ready: catalogReady, version: catalogVersion } = useShopCatalog();
  const [mapShops, setMapShops] = useState<ShopMapPin[]>([]);
  const [mapLoading, setMapLoading] = useState(false);

  const loadMapShops = useCallback(async () => {
    setMapLoading(true);
    try {
      const rows = await fetchRegisteredShopsForMap(shopType);
      setMapShops(rows);
    } finally {
      setMapLoading(false);
    }
  }, [shopType]);

  useEffect(() => {
    if (!active || !catalogReady) return;
    void loadMapShops();
  }, [active, catalogReady, catalogVersion, loadMapShops]);

  useEffect(() => {
    if (!active || !catalogReady) return;
    return subscribeRegisteredShopsMapRealtime(() => {
      void loadMapShops();
    });
  }, [active, catalogReady, loadMapShops]);

  if (!catalogReady || mapLoading) {
    return <ActivityIndicator color={theme.accent} style={{ marginTop: 24 }} />;
  }

  if (mapShops.length === 0) {
    return <Text style={[styles.empty, { color: theme.textMuted }]}>{t('nearby_map_no_coords')}</Text>;
  }

  return (
    <View style={styles.wrap}>
      <CategoryShopsMap
        shops={mapShops}
        shopType={shopType}
        locale={locale}
        onShopPress={(shopId) => {
          router.push({
            pathname: '/shop-profile/[shopId]',
            params: { shopId },
          });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 4 },
  empty: { textAlign: 'center', marginTop: 24, fontSize: 14 },
});
