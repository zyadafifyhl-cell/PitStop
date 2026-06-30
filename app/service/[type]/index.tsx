import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AreaCard } from '@/components/ui/AreaCard';
import { useI18n } from '@/context/I18nContext';
import { useShopCatalog } from '@/context/ShopCatalogContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { listAreas } from '@/lib/booking/areas';
import { countShopsByTypeAndArea, listAreasWithShops } from '@/lib/booking/catalogRepository';
import { shopTypeLabel } from '@/lib/booking/format';
import {
  isDiscoverableShopType,
  listDiscoverableSortedByDistance,
} from '@/lib/booking/nearbyDiscovery';
import { listRecentAreaIds, rememberAreaSelection } from '@/lib/booking/recentLocationStorage';
import { parseShopType } from '@/lib/booking/serviceType';
import { openListingsInMaps } from '@/lib/linking/contact';

type LocationViewMode = 'list' | 'map';

export default function PickAreaScreen() {
  const { type: rawType } = useLocalSearchParams<{ type: string }>();
  const { t, locale } = useI18n();
  const { ready: catalogReady, refreshing: catalogRefreshing, version: catalogVersion } = useShopCatalog();
  const theme = useAppTheme();
  const type = parseShopType(rawType);
  const [areaSearch, setAreaSearch] = useState('');
  const [viewMode, setViewMode] = useState<LocationViewMode>('list');
  const [recentIds, setRecentIds] = useState<string[]>([]);

  const loadRecent = useCallback(async () => {
    if (!type) return;
    setRecentIds(await listRecentAreaIds(type));
  }, [type]);

  useFocusEffect(
    useCallback(() => {
      loadRecent();
    }, [loadRecent]),
  );

  const areas = useMemo(() => {
    if (!catalogReady || !type) return [];
    const withShops = new Set(listAreasWithShops(type));
    const q = areaSearch.trim().toLowerCase();
    return listAreas()
      .filter((a) => withShops.has(a.id))
      .filter((a) => {
        if (!q) return true;
        const name = locale === 'ar' ? a.nameAr : a.name;
        const city = locale === 'ar' ? a.cityAr : a.city;
        return name.toLowerCase().includes(q) || city.toLowerCase().includes(q);
      });
  }, [catalogReady, catalogVersion, type, areaSearch, locale]);

  const popularAreas = useMemo(() => {
    if (!catalogReady || !type) return [];
    return listAreas()
      .filter((a) => listAreasWithShops(type).includes(a.id))
      .map((area) => ({ area, count: countShopsByTypeAndArea(type, area.id) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((row) => row.area);
  }, [catalogReady, catalogVersion, type]);

  const recentAreas = useMemo(() => {
    return recentIds
      .map((id) => listAreas().find((a) => a.id === id))
      .filter((a): a is NonNullable<typeof a> => !!a);
  }, [recentIds, catalogVersion]);

  const highlightedIds = useMemo(() => {
    const ids = new Set<string>();
    recentAreas.forEach((a) => ids.add(a.id));
    popularAreas.forEach((a) => ids.add(a.id));
    return ids;
  }, [recentAreas, popularAreas]);

  const remainingAreas = useMemo(() => {
    if (areaSearch.trim()) return areas;
    return areas.filter((a) => !highlightedIds.has(a.id));
  }, [areas, areaSearch, highlightedIds]);

  function goToArea(areaId: string) {
    if (!type) return;
    rememberAreaSelection(type, areaId).catch(() => undefined);
    router.push({
      pathname: '/service/[type]/[areaId]',
      params: { type, areaId },
    });
  }

  function renderAreaCard(area: (typeof areas)[number]) {
    const count = countShopsByTypeAndArea(type!, area.id);
    const title = locale === 'ar' ? area.nameAr : area.name;
    const subtitle = locale === 'ar' ? area.cityAr : area.city;
    return (
      <AreaCard
        key={area.id}
        title={title}
        subtitle={subtitle}
        shopCount={count}
        shopCountLabel={t('area_shop_count')}
        onPress={() => goToArea(area.id)}
      />
    );
  }

  if (!type) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <Text style={[styles.error, { color: theme.textMuted }]}>{t('service_invalid')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.screen, { backgroundColor: theme.bg }]} contentContainerStyle={styles.content}>
      <Text style={[styles.badge, { color: theme.accent }]}>{shopTypeLabel(type, locale)}</Text>
      <Text style={[styles.title, { color: theme.text }]}>{t('area_pick_title')}</Text>
      <Text style={[styles.lead, { color: theme.textMuted }]}>{t('area_pick_lead')}</Text>

      <TextInput
        value={areaSearch}
        onChangeText={setAreaSearch}
        placeholder={t('location_search_area')}
        placeholderTextColor={theme.textDim}
        style={[styles.searchInput, { backgroundColor: theme.bgElevated, borderColor: theme.border, color: theme.text }]}
      />

      <View style={styles.actionRow}>
        {type === 'wash' ? (
          <Pressable
            onPress={() => router.push('/nearby/wash')}
            style={[styles.actionChip, { backgroundColor: theme.accentSoft, borderColor: theme.accent }]}>
            <Text style={[styles.actionChipText, { color: theme.accent }]}>{t('location_use_gps')}</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => router.push(`/nearby/${type}` as any)}
          style={[styles.actionChip, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
          <Text style={[styles.actionChipText, { color: theme.text }]}>{t('location_nearby_shops')}</Text>
        </Pressable>
      </View>

      <View style={styles.viewToggleRow}>
        <Pressable
          onPress={() => setViewMode('list')}
          style={[
            styles.viewToggleBtn,
            { borderColor: theme.border, backgroundColor: theme.bgElevated },
            viewMode === 'list' && { backgroundColor: theme.accent, borderColor: theme.accent },
          ]}>
          <Text style={[styles.viewToggleText, { color: viewMode === 'list' ? theme.onAccent : theme.textMuted }]}>
            {t('location_list_view')}
          </Text>
        </Pressable>
        <Pressable
          onPress={async () => {
            setViewMode('map');
            if (!isDiscoverableShopType(type)) {
              Alert.alert(t('settings_link_fail_title'), t('nearby_discoverable_only'));
              return;
            }
            let lat: number | null = null;
            let lng: number | null = null;
            try {
              const { status } = await Location.requestForegroundPermissionsAsync();
              if (status === 'granted') {
                const pos = await Location.getCurrentPositionAsync({
                  accuracy: Location.Accuracy.Balanced,
                });
                lat = pos.coords.latitude;
                lng = pos.coords.longitude;
              }
            } catch {
              /* list without GPS */
            }
            try {
              const listings = await listDiscoverableSortedByDistance(type, lat, lng);
              await openListingsInMaps(listings, shopTypeLabel(type, locale), locale);
            } catch {
              Alert.alert(t('settings_link_fail_title'), t('nearby_map_no_coords'));
            }
          }}
          style={[
            styles.viewToggleBtn,
            { borderColor: theme.border, backgroundColor: theme.bgElevated },
            viewMode === 'map' && { backgroundColor: theme.accent, borderColor: theme.accent },
          ]}>
          <Text style={[styles.viewToggleText, { color: viewMode === 'map' ? theme.onAccent : theme.textMuted }]}>
            {t('location_map_view')}
          </Text>
        </Pressable>
      </View>

      {!catalogReady || (catalogRefreshing && areas.length === 0) ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: 24 }} />
      ) : areas.length === 0 ? (
        <Text style={[styles.empty, { color: theme.textMuted }]}>{t('area_no_shops')}</Text>
      ) : (
        <>
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

          {viewMode === 'list' && !areaSearch.trim() && remainingAreas.length > 0 ? (
            <>
              <Text style={[styles.sectionLabel, { color: theme.text }]}>
                {locale === 'ar' ? 'كل المناطق' : 'All areas'}
              </Text>
              {remainingAreas.map((area) => renderAreaCard(area))}
            </>
          ) : null}
          {areaSearch.trim() ? areas.map((area) => renderAreaCard(area)) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {},
  badge: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  title: { fontSize: 26, fontWeight: '900', marginBottom: 8 },
  lead: { fontSize: 15, lineHeight: 22, marginBottom: 14 },
  searchInput: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    marginBottom: 12,
  },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  actionChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  actionChipText: { fontSize: 13, fontWeight: '800' },
  viewToggleRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  viewToggleBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  viewToggleText: { fontSize: 13, fontWeight: '800' },
  sectionLabel: { fontSize: 16, fontWeight: '900', marginBottom: 10, marginTop: 4 },
  empty: { textAlign: 'center', marginTop: 24 },
});
