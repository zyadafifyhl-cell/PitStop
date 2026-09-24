import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AreaCard } from '@/components/ui/AreaCard';
import { CategoryShopsMap } from '@/components/maps/CategoryShopsMap';
import { useI18n } from '@/context/I18nContext';
import { useShopCatalog } from '@/context/ShopCatalogContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { listAreas } from '@/lib/booking/areas';
import { countShopsByTypeAndArea, listAreasWithShops } from '@/lib/booking/catalogRepository';
import { shopTypeLabel } from '@/lib/booking/format';
import { listRecentAreaIds, rememberAreaSelection } from '@/lib/booking/recentLocationStorage';
import { parseShopType } from '@/lib/booking/serviceType';
import {
  fetchRegisteredShopsForMap,
  subscribeRegisteredShopsMapRealtime,
  type ShopMapPin,
} from '@/lib/booking/shopMapDiscovery';

type LocationViewMode = 'list' | 'map';

export default function PickAreaScreen() {
  const { type: rawType } = useLocalSearchParams<{ type: string }>();
  const { t, locale } = useI18n();
  const { ready: catalogReady, refreshing: catalogRefreshing, version: catalogVersion } = useShopCatalog();
  const theme = useAppTheme();
  const type = parseShopType(rawType);
  const [areaSearch, setAreaSearch] = useState('');
  const [areaDropdownOpen, setAreaDropdownOpen] = useState(false);
  const [viewMode, setViewMode] = useState<LocationViewMode>('list');
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [mapShops, setMapShops] = useState<ShopMapPin[]>([]);
  const [mapLoading, setMapLoading] = useState(false);

  const loadMapShops = useCallback(async () => {
    if (!type) return;
    setMapLoading(true);
    try {
      const rows = await fetchRegisteredShopsForMap(type);
      setMapShops(rows);
    } finally {
      setMapLoading(false);
    }
  }, [type]);

  useEffect(() => {
    if (viewMode !== 'map' || !type || !catalogReady) return;
    void loadMapShops();
  }, [viewMode, type, catalogReady, catalogVersion, loadMapShops]);

  useEffect(() => {
    if (viewMode !== 'map' || !type || !catalogReady) return;
    return subscribeRegisteredShopsMapRealtime(() => {
      void loadMapShops();
    });
  }, [viewMode, type, catalogReady, loadMapShops]);

  const loadRecent = useCallback(async () => {
    if (!type) return;
    setRecentIds(await listRecentAreaIds(type));
  }, [type]);

  useFocusEffect(
    useCallback(() => {
      loadRecent();
      if (viewMode === 'map' && type && catalogReady) {
        void loadMapShops();
      }
    }, [loadRecent, viewMode, type, catalogReady, loadMapShops]),
  );

  const allAreasForType = useMemo(() => {
    if (!catalogReady || !type) return [];
    const withShops = new Set(listAreasWithShops(type));
    return listAreas().filter((a) => withShops.has(a.id));
  }, [catalogReady, catalogVersion, type]);

  const areas = useMemo(() => {
    const q = areaSearch.trim().toLowerCase();
    if (!q) return allAreasForType;
    return allAreasForType.filter((a) => {
      const name = locale === 'ar' ? a.nameAr : a.name;
      const city = locale === 'ar' ? a.cityAr : a.city;
      return name.toLowerCase().includes(q) || city.toLowerCase().includes(q);
    });
  }, [allAreasForType, areaSearch, locale]);

  const popularAreas = useMemo(() => {
    if (!type) return [];
    return allAreasForType
      .map((area) => ({ area, count: countShopsByTypeAndArea(type, area.id) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((row) => row.area);
  }, [allAreasForType, type]);

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

  function openShopProfile(shopId: string) {
    router.push({
      pathname: '/shop-profile/[shopId]',
      params: { shopId },
    });
  }

  function goToArea(areaId: string) {
    if (!type) return;
    rememberAreaSelection(type, areaId).catch(() => undefined);
    router.push({
      pathname: '/service/[type]/[areaId]',
      params: { type, areaId },
    });
  }

  function selectAreaFromDropdown(area: (typeof allAreasForType)[number]) {
    const title = locale === 'ar' ? area.nameAr : area.name;
    setAreaSearch(title);
    setAreaDropdownOpen(false);
    goToArea(area.id);
  }

  function renderAreaDropdownList() {
    if (allAreasForType.length === 0) {
      return (
        <Text style={[styles.areaDropdownEmpty, { color: theme.textMuted }]}>{t('area_no_shops')}</Text>
      );
    }
    return allAreasForType.map((area) => {
      const title = locale === 'ar' ? area.nameAr : area.name;
      const subtitle = locale === 'ar' ? area.cityAr : area.city;
      const count = countShopsByTypeAndArea(type!, area.id);
      return (
        <Pressable
          key={area.id}
          onPress={() => selectAreaFromDropdown(area)}
          style={({ pressed }) => [
            styles.areaDropdownItem,
            { borderBottomColor: theme.border },
            pressed && { backgroundColor: theme.accentSoft },
          ]}>
          <View style={styles.areaDropdownItemText}>
            <Text style={[styles.areaDropdownTitle, { color: theme.text }]}>{title}</Text>
            <Text style={[styles.areaDropdownSubtitle, { color: theme.textMuted }]}>
              {subtitle} · {count} {t('area_shop_count')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.textDim} />
        </Pressable>
      );
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

      <View style={[styles.searchWrap, { zIndex: areaDropdownOpen ? 40 : 1 }]}>
        <View
          style={[
            styles.searchInputRow,
            { backgroundColor: theme.bgElevated, borderColor: theme.border },
          ]}>
          <TextInput
            value={areaSearch}
            onChangeText={(text) => {
              setAreaSearch(text);
              if (areaDropdownOpen) setAreaDropdownOpen(false);
            }}
            placeholder={t('location_search_area')}
            placeholderTextColor={theme.textDim}
            style={[styles.searchInput, { color: theme.text }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={locale === 'ar' ? 'قائمة المناطق' : 'Browse areas'}
            onPress={() => setAreaDropdownOpen((open) => !open)}
            hitSlop={8}
            style={styles.searchChevronBtn}>
            <Ionicons
              name={areaDropdownOpen ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={theme.accent}
            />
          </Pressable>
        </View>

        {areaDropdownOpen && Platform.OS === 'web' ? (
          <>
            <Pressable style={styles.areaDropdownWebDismiss} onPress={() => setAreaDropdownOpen(false)} />
            <View
              style={[
                styles.areaDropdown,
                {
                  backgroundColor: theme.bgElevated,
                  borderColor: theme.border,
                  shadowColor: theme.text,
                },
              ]}>
              <ScrollView
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                style={styles.areaDropdownScroll}>
                {renderAreaDropdownList()}
              </ScrollView>
            </View>
          </>
        ) : null}
      </View>

      <Modal
        visible={areaDropdownOpen && Platform.OS !== 'web'}
        transparent
        animationType="fade"
        onRequestClose={() => setAreaDropdownOpen(false)}>
        <View style={styles.areaDropdownBackdrop}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setAreaDropdownOpen(false)} />
          <View
            style={[
              styles.areaDropdownModalCard,
              {
                backgroundColor: theme.bgElevated,
                borderColor: theme.border,
                shadowColor: theme.text,
              },
            ]}>
            <View style={[styles.areaDropdownModalHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.areaDropdownModalTitle, { color: theme.text }]}>
                {locale === 'ar' ? 'اختر المنطقة' : 'Select area'}
              </Text>
              <Pressable onPress={() => setAreaDropdownOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={theme.textMuted} />
              </Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.areaDropdownScroll}>
              {renderAreaDropdownList()}
            </ScrollView>
          </View>
        </View>
      </Modal>

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
          onPress={() => setViewMode('map')}
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

      {viewMode === 'map' ? (
        mapLoading ? (
          <ActivityIndicator color={theme.accent} style={{ marginTop: 24, marginBottom: 16 }} />
        ) : mapShops.length === 0 ? (
          <Text style={[styles.empty, { color: theme.textMuted }]}>{t('nearby_map_no_coords')}</Text>
        ) : (
          <CategoryShopsMap
            shops={mapShops}
            shopType={type}
            locale={locale}
            onShopPress={openShopProfile}
          />
        )
      ) : null}

      {viewMode === 'list' && (!catalogReady || (catalogRefreshing && areas.length === 0)) ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: 24 }} />
      ) : areas.length === 0 ? (
        <Text style={[styles.empty, { color: theme.textMuted }]}>{t('area_no_shops')}</Text>
      ) : viewMode === 'list' ? (
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
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { width: '100%', maxWidth: 1024, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48 },
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
  searchWrap: {
    marginBottom: 12,
    position: 'relative',
    zIndex: 1,
    ...(Platform.OS === 'web' ? ({ overflow: 'visible' } as const) : null),
  },
  searchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingLeft: 14,
    paddingRight: 6,
    minHeight: 46,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 11,
    paddingRight: 8,
    fontSize: 15,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as const) : null),
  },
  searchChevronBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  areaDropdownWebDismiss: {
    ...(Platform.OS === 'web'
      ? ({ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 } as const)
      : { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 }),
  },
  areaDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 6,
    borderWidth: 1,
    borderRadius: 14,
    maxHeight: 280,
    zIndex: 50,
    elevation: 12,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    overflow: 'hidden',
  },
  areaDropdownBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  areaDropdownModalCard: {
    borderWidth: 1,
    borderRadius: 16,
    maxHeight: '70%',
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 10,
  },
  areaDropdownModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  areaDropdownModalTitle: { fontSize: 16, fontWeight: '800' },
  areaDropdownScroll: { maxHeight: 280 },
  areaDropdownEmpty: {
    textAlign: 'center',
    paddingVertical: 20,
    paddingHorizontal: 14,
    fontSize: 14,
  },
  areaDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  areaDropdownItemText: { flex: 1, minWidth: 0 },
  areaDropdownTitle: { fontSize: 15, fontWeight: '800' },
  areaDropdownSubtitle: { fontSize: 12, marginTop: 2, fontWeight: '600' },
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
