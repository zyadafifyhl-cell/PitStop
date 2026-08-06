import { router } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AreaCard } from '@/components/ui/AreaCard';
import { useI18n } from '@/context/I18nContext';
import { useShopCatalog } from '@/context/ShopCatalogContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { listAreas } from '@/lib/booking/areas';
import { countShopsByTypeAndArea, listAreasWithShops } from '@/lib/booking/catalogRepository';
import { listRecentAreaIds, rememberAreaSelection } from '@/lib/booking/recentLocationStorage';
import type { ShopType } from '@/lib/booking/types';
import { useFocusEffect } from 'expo-router';

type Props = {
  shopType: ShopType;
};

export function StoreLocationListPanel({ shopType }: Props) {
  const { t, locale } = useI18n();
  const theme = useAppTheme();
  const { ready: catalogReady, version: catalogVersion } = useShopCatalog();
  const [areaSearch, setAreaSearch] = useState('');
  const [recentIds, setRecentIds] = useState<string[]>([]);

  const loadRecent = useCallback(async () => {
    setRecentIds(await listRecentAreaIds(shopType));
  }, [shopType]);

  useFocusEffect(
    useCallback(() => {
      void loadRecent();
    }, [loadRecent]),
  );

  const areas = useMemo(() => {
    if (!catalogReady) return [];
    const withShops = new Set(listAreasWithShops(shopType));
    const q = areaSearch.trim().toLowerCase();
    return listAreas()
      .filter((a) => withShops.has(a.id))
      .filter((a) => {
        if (!q) return true;
        const name = locale === 'ar' ? a.nameAr : a.name;
        const city = locale === 'ar' ? a.cityAr : a.city;
        return name.toLowerCase().includes(q) || city.toLowerCase().includes(q);
      });
  }, [catalogReady, catalogVersion, shopType, areaSearch, locale]);

  const popularAreas = useMemo(() => {
    if (!catalogReady) return [];
    return listAreas()
      .filter((a) => listAreasWithShops(shopType).includes(a.id))
      .map((area) => ({ area, count: countShopsByTypeAndArea(shopType, area.id) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((row) => row.area);
  }, [catalogReady, catalogVersion, shopType]);

  const recentAreas = useMemo(() => {
    return recentIds
      .map((id) => listAreas().find((a) => a.id === id))
      .filter((a): a is NonNullable<typeof a> => !!a);
  }, [recentIds, catalogVersion]);

  function goToArea(areaId: string) {
    rememberAreaSelection(shopType, areaId).catch(() => undefined);
    router.push({
      pathname: '/service/[type]/[areaId]',
      params: { type: shopType, areaId },
    });
  }

  function renderAreaCard(area: (typeof areas)[number]) {
    const count = countShopsByTypeAndArea(shopType, area.id);
    return (
      <AreaCard
        key={area.id}
        title={locale === 'ar' ? area.nameAr : area.name}
        subtitle={locale === 'ar' ? area.cityAr : area.city}
        shopCount={count}
        shopCountLabel={t('area_shop_count')}
        onPress={() => goToArea(area.id)}
      />
    );
  }

  if (!catalogReady) {
    return <ActivityIndicator color={theme.accent} style={{ marginTop: 24 }} />;
  }

  if (areas.length === 0) {
    return <Text style={[styles.empty, { color: theme.textMuted }]}>{t('area_no_shops')}</Text>;
  }

  return (
    <View style={styles.wrap}>
      <TextInput
        value={areaSearch}
        onChangeText={setAreaSearch}
        placeholder={t('location_search_area')}
        placeholderTextColor={theme.textDim}
        style={[styles.searchInput, { backgroundColor: theme.bgElevated, borderColor: theme.border, color: theme.text }]}
      />
      <View style={styles.actionRow}>
        <Pressable
          onPress={() => router.push(`/nearby/${shopType}` as never)}
          style={[styles.actionChip, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
          <Text style={[styles.actionChipText, { color: theme.text }]}>{t('location_nearby_shops')}</Text>
        </Pressable>
      </View>

      {recentAreas.length > 0 && !areaSearch.trim() ? (
        <>
          <Text style={[styles.sectionLabel, { color: theme.text }]}>{t('location_recent')}</Text>
          {recentAreas.map((area) => renderAreaCard(area))}
        </>
      ) : null}

      {!areaSearch.trim() ? (
        <>
          <Text style={[styles.sectionLabel, { color: theme.text }]}>{t('location_popular')}</Text>
          {popularAreas.map((area) => renderAreaCard(area))}
        </>
      ) : null}

      {areaSearch.trim() ? areas.map((area) => renderAreaCard(area)) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  searchInput: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
  },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  actionChipText: { fontSize: 13, fontWeight: '800' },
  sectionLabel: { fontSize: 16, fontWeight: '900', marginTop: 8, marginBottom: 4 },
  empty: { textAlign: 'center', marginTop: 24, fontSize: 14 },
});
