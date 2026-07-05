import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/context/ThemePreferenceContext';
import type { ShopMapPin } from '@/lib/booking/shopMapDiscovery';
import type { ShopType } from '@/lib/booking/types';
import { openMapsAtCoordinates } from '@/lib/linking/contact';

type Props = {
  shops: ShopMapPin[];
  shopType: ShopType;
  locale: 'en' | 'ar';
  onShopPress: (shopId: string) => void;
  height?: number;
};

export function CategoryShopsMap({ shops, locale, onShopPress }: Props) {
  const theme = useAppTheme();

  if (!shops.length) return null;

  return (
    <View style={styles.list}>
      {shops.map((shop) => {
        const label = locale === 'ar' ? shop.nameAr || shop.name : shop.name;
        return (
          <Pressable
            key={shop.id}
            onPress={() => onShopPress(shop.id)}
            style={[styles.row, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
            <Text style={[styles.title, { color: theme.text }]}>{label}</Text>
            <Text style={[styles.meta, { color: theme.textMuted }]}>
              {shop.latitude.toFixed(5)}, {shop.longitude.toFixed(5)}
            </Text>
            <Pressable
              onPress={() =>
                openMapsAtCoordinates(shop.latitude, shop.longitude, label).catch(() => undefined)
              }
              style={[styles.mapLink, { borderColor: theme.accent }]}>
              <Text style={[styles.mapLinkText, { color: theme.accent }]}>Maps</Text>
            </Pressable>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  row: { borderWidth: 1, borderRadius: 0, padding: 12, gap: 4 },
  title: { fontSize: 15, fontWeight: '800' },
  meta: { fontSize: 12 },
  mapLink: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 0,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 4,
  },
  mapLinkText: { fontSize: 12, fontWeight: '800' },
});
