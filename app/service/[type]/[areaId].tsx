import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ShopListCard } from '@/components/ui/ShopListCard';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useI18n } from '@/context/I18nContext';
import { useShopCatalog } from '@/context/ShopCatalogContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { getAreaById } from '@/lib/booking/areas';
import { listShopsByTypeAndArea } from '@/lib/booking/catalogRepository';
import { toggleFavoriteShop } from '@/lib/booking/favoritesStorage';
import { shopTypeLabel } from '@/lib/booking/format';
import {
  hydrateShopListBundle,
  loadShopListBundle,
  peekShopListBundle,
  type ShopListBundle,
} from '@/lib/booking/shopListBundleRepository';
import { isStoreShopType } from '@/lib/booking/storeCatalog';
import { openListingsInMaps, openPhone } from '@/lib/linking/contact';
import { parseShopType } from '@/lib/booking/serviceType';
import type { Shop } from '@/lib/booking/types';

type AreaShopListFilter = 'all' | 'favorites';

export default function ShopsInAreaScreen() {
  const { type: rawType, areaId } = useLocalSearchParams<{ type: string; areaId: string }>();
  const { t, locale } = useI18n();
  const theme = useAppTheme();
  const { customer } = useCustomerAuth();
  const { ready: catalogReady, version: catalogVersion } = useShopCatalog();
  const type = parseShopType(rawType);
  const area = areaId && catalogReady ? getAreaById(areaId) : undefined;
  const [searchQuery, setSearchQuery] = useState('');
  const [shopDropdownOpen, setShopDropdownOpen] = useState(false);
  const [listFilter, setListFilter] = useState<AreaShopListFilter>('all');
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [bundle, setBundle] = useState<ShopListBundle | null>(() =>
    type && areaId ? peekShopListBundle(type, areaId) : null,
  );
  const [bundleHydrating, setBundleHydrating] = useState(!bundle);

  const shops = useMemo(() => {
    if (!catalogReady || !type || !areaId) return [];
    return listShopsByTypeAndArea(type, areaId);
  }, [catalogReady, catalogVersion, type, areaId]);

  const filteredShops = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let rows = shops;
    if (listFilter === 'favorites') {
      rows = rows.filter((shop) => favoriteIds.has(shop.id));
    }
    if (!q) return rows;
    return rows.filter((shop) => {
      const name = shop.name?.toLowerCase() ?? '';
      const nameAr = shop.nameAr?.toLowerCase() ?? '';
      return name.includes(q) || nameAr.includes(q);
    });
  }, [shops, searchQuery, listFilter, favoriteIds]);

  const dropdownShops = useMemo(() => {
    return [...shops].sort((a, b) => {
      const nameA = (locale === 'ar' ? a.nameAr : a.name).toLowerCase();
      const nameB = (locale === 'ar' ? b.nameAr : b.name).toLowerCase();
      return nameA.localeCompare(nameB, locale === 'ar' ? 'ar' : 'en');
    });
  }, [shops, locale]);

  const loadFavorites = useCallback(async () => {
    if (!customer) {
      setFavoriteIds(new Set());
      return;
    }
    const { listFavoriteShopIds } = await import('@/lib/booking/favoritesStorage');
    const ids = await listFavoriteShopIds(customer.id);
    setFavoriteIds(new Set(ids));
  }, [customer]);

  const refreshBundle = useCallback(
    async (options?: { force?: boolean }) => {
      if (!type || !areaId || !shops.length) {
        setBundle(null);
        setBundleHydrating(false);
        return;
      }

      const next = await loadShopListBundle(shops, {
        type,
        areaId,
        force: options?.force,
      });
      setBundle(next);
      setBundleHydrating(false);
    },
    [areaId, shops, type],
  );

  useEffect(() => {
    if (!type || !areaId) return;
    let cancelled = false;
    (async () => {
      const cached = await hydrateShopListBundle(type, areaId);
      if (!cancelled && cached) {
        setBundle(cached);
        setBundleHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [areaId, type]);

  useEffect(() => {
    if (!catalogReady || !shops.length || !type || !areaId) return;
    void refreshBundle();
  }, [catalogReady, catalogVersion, shops, type, areaId, refreshBundle]);

  useFocusEffect(
    useCallback(() => {
      loadFavorites();
      if (shops.length && type && areaId) {
        void refreshBundle();
      }
    }, [areaId, loadFavorites, refreshBundle, shops.length, type]),
  );

  function linkFail() {
    Alert.alert(t('settings_link_fail_title'), t('settings_link_fail_body'));
  }

  async function onToggleFavorite(shopId: string) {
    if (!customer) return;
    await toggleFavoriteShop(customer.id, shopId);
    await loadFavorites();
  }

  function openShop(shop: Shop) {
    if (isStoreShopType(shop.type)) {
      router.push(`/parts-shop/${shop.id}` as any);
    } else {
      router.push(`/shop-profile/${shop.id}` as any);
    }
  }

  function selectShopFromDropdown(shop: Shop) {
    const title = locale === 'ar' ? shop.nameAr : shop.name;
    setSearchQuery(title);
    setShopDropdownOpen(false);
    openShop(shop);
  }

  function renderShopDropdownList() {
    if (dropdownShops.length === 0) {
      return (
        <Text style={[styles.dropdownEmpty, { color: theme.textMuted }]}>{t('book_no_shops')}</Text>
      );
    }
    return dropdownShops.map((shop) => {
      const title = locale === 'ar' ? shop.nameAr : shop.name;
      const subtitle = locale === 'ar' ? shop.addressAr : shop.address;
      return (
        <Pressable
          key={shop.id}
          onPress={() => selectShopFromDropdown(shop)}
          style={({ pressed }) => [
            styles.dropdownItem,
            { borderBottomColor: theme.border },
            pressed && { backgroundColor: theme.accentSoft },
          ]}>
          <View style={styles.dropdownItemText}>
            <Text style={[styles.dropdownTitle, { color: theme.text }]} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={[styles.dropdownSubtitle, { color: theme.textMuted }]} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.textDim} />
        </Pressable>
      );
    });
  }

  if (!type || !catalogReady) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        {!catalogReady ? (
          <ActivityIndicator color={theme.accent} />
        ) : (
          <Text style={[styles.error, { color: theme.textMuted }]}>{t('service_invalid')}</Text>
        )}
      </View>
    );
  }

  if (!area) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <Text style={[styles.error, { color: theme.textMuted }]}>{t('service_invalid')}</Text>
      </View>
    );
  }

  const areaName = locale === 'ar' ? area.nameAr : area.name;
  const serviceLabel = shopTypeLabel(type, locale);

  return (
    <ScrollView style={[styles.screen, { backgroundColor: theme.bg }]} contentContainerStyle={styles.content}>
      <Text style={[styles.badge, { color: theme.accent }]}>{serviceLabel}</Text>
      <Text style={[styles.title, { color: theme.text }]}>{areaName}</Text>
      <Text style={[styles.lead, { color: theme.textMuted }]}>{t('shops_in_area_lead')}</Text>
      <Text style={[styles.phoneNote, { color: theme.textDim }]}>{t('settings_shop_phone_note')}</Text>

      {shops.length === 0 ? (
        <Text style={[styles.empty, { color: theme.textMuted }]}>{t('book_no_shops')}</Text>
      ) : (
        <>
          <View style={[styles.searchWrap, { zIndex: shopDropdownOpen ? 40 : 1 }]}>
            <View
              style={[
                styles.searchRow,
                { backgroundColor: theme.bgElevated, borderColor: theme.border },
              ]}>
              <Ionicons name="search" size={18} color={theme.textDim} style={styles.searchIcon} />
              <TextInput
                value={searchQuery}
                onChangeText={(text) => {
                  setSearchQuery(text);
                  if (shopDropdownOpen) setShopDropdownOpen(false);
                }}
                placeholder={t('shops_in_area_search_placeholder')}
                placeholderTextColor={theme.textDim}
                style={[styles.searchInput, { color: theme.text }]}
                autoCorrect={false}
                autoCapitalize="none"
                clearButtonMode="never"
                returnKeyType="search"
              />
              {searchQuery.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={locale === 'ar' ? 'مسح البحث' : 'Clear search'}
                  onPress={() => setSearchQuery('')}
                  hitSlop={8}
                  style={styles.clearBtn}>
                  <Ionicons name="close-circle" size={18} color={theme.textDim} />
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={locale === 'ar' ? 'قائمة المحلات' : 'Browse shops'}
                onPress={() => setShopDropdownOpen((open) => !open)}
                hitSlop={8}
                style={styles.chevronBtn}>
                <Ionicons
                  name={shopDropdownOpen ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={theme.accent}
                />
              </Pressable>
            </View>

            {shopDropdownOpen && Platform.OS === 'web' ? (
              <>
                <Pressable style={styles.dropdownWebDismiss} onPress={() => setShopDropdownOpen(false)} />
                <View
                  style={[
                    styles.dropdown,
                    {
                      backgroundColor: theme.bgElevated,
                      borderColor: theme.border,
                      shadowColor: theme.text,
                    },
                  ]}>
                  <ScrollView
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="handled"
                    style={styles.dropdownScroll}>
                    {renderShopDropdownList()}
                  </ScrollView>
                </View>
              </>
            ) : null}
          </View>

          <Modal
            visible={shopDropdownOpen && Platform.OS !== 'web'}
            transparent
            animationType="fade"
            onRequestClose={() => setShopDropdownOpen(false)}>
            <View style={styles.dropdownBackdrop}>
              <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setShopDropdownOpen(false)} />
              <View
                style={[
                  styles.dropdownModalCard,
                  {
                    backgroundColor: theme.bgElevated,
                    borderColor: theme.border,
                    shadowColor: theme.text,
                  },
                ]}>
                <View style={[styles.dropdownModalHeader, { borderBottomColor: theme.border }]}>
                  <Text style={[styles.dropdownModalTitle, { color: theme.text }]}>
                    {locale === 'ar' ? 'اختر المحل' : 'Select shop'}
                  </Text>
                  <Pressable onPress={() => setShopDropdownOpen(false)} hitSlop={8}>
                    <Ionicons name="close" size={22} color={theme.textMuted} />
                  </Pressable>
                </View>
                <ScrollView keyboardShouldPersistTaps="handled" style={styles.dropdownScroll}>
                  {renderShopDropdownList()}
                </ScrollView>
              </View>
            </View>
          </Modal>

          <View style={styles.actionTabsRow}>
            <Pressable
              onPress={() => setListFilter('all')}
              style={[
                styles.mapsTab,
                {
                  backgroundColor: listFilter === 'all' ? theme.accent : theme.bgElevated,
                  borderColor: listFilter === 'all' ? theme.accent : theme.border,
                },
              ]}>
              <Text
                style={[
                  styles.mapsTabText,
                  { color: listFilter === 'all' ? theme.onAccent : theme.text },
                ]}>
                {t('home_filter_all')}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setListFilter('favorites')}
              style={[
                styles.mapsTab,
                styles.filterTabWithIcon,
                {
                  backgroundColor: listFilter === 'favorites' ? theme.accent : theme.bgElevated,
                  borderColor: listFilter === 'favorites' ? theme.accent : theme.border,
                },
              ]}>
              <Ionicons
                name={listFilter === 'favorites' ? 'heart' : 'heart-outline'}
                size={15}
                color={listFilter === 'favorites' ? theme.onAccent : theme.accent}
              />
              <Text
                style={[
                  styles.mapsTabText,
                  { color: listFilter === 'favorites' ? theme.onAccent : theme.text },
                ]}>
                {t('filter_favorites')}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => openListingsInMaps(shops, `${serviceLabel} ${areaName}`, locale).catch(linkFail)}
              style={[styles.mapsTab, { backgroundColor: theme.accentSoft, borderColor: theme.accent }]}>
              <Text style={[styles.mapsTabText, { color: theme.accent }]}>
                Google Maps · {locale === 'ar' ? 'كل الأماكن القريبة' : 'All nearby places'}
              </Text>
            </Pressable>
          </View>

          {filteredShops.length === 0 ? (
            <Text style={[styles.empty, { color: theme.textMuted }]}>
              {listFilter === 'favorites' && !searchQuery.trim()
                ? t('shops_in_area_favorites_empty')
                : t('shops_in_area_search_empty')}
            </Text>
          ) : (
            filteredShops.map((shop) => {
              const extras = bundle?.extrasByShopId[shop.id] ?? null;
              const rating = bundle?.ratingsByShopId[shop.id];
              return (
                <ShopListCard
                  key={shop.id}
                  shopId={shop.id}
                  name={locale === 'ar' ? shop.nameAr : shop.name}
                  address={locale === 'ar' ? shop.addressAr : shop.address}
                  type={shop.type}
                  typeLabel={shopTypeLabel(shop.type, locale)}
                  averageRating={rating?.average ?? null}
                  reviewCount={rating?.count}
                  latitude={shop.latitude}
                  longitude={shop.longitude}
                  phone={shop.phone}
                  bookLabel={t('shop_card_view_details')}
                  isFavorite={favoriteIds.has(shop.id)}
                  onToggleFavorite={() => onToggleFavorite(shop.id)}
                  onCall={() => openPhone(shop.phone).catch(linkFail)}
                  extras={extras}
                  extrasLoading={bundleHydrating && !extras}
                  onPress={() => openShop(shop)}
                />
              );
            })
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: 1024,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 48,
    ...(Platform.OS === 'web' ? ({ overflow: 'visible' } as const) : null),
  },
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
  lead: { fontSize: 15, lineHeight: 22, marginBottom: 8 },
  phoneNote: { fontSize: 12, lineHeight: 18, marginBottom: 14 },
  searchWrap: {
    marginBottom: 12,
    position: 'relative',
    zIndex: 1,
    ...(Platform.OS === 'web' ? ({ overflow: 'visible' } as const) : null),
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingLeft: 12,
    paddingRight: 6,
    minHeight: 46,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    paddingVertical: 11,
    fontSize: 15,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as const) : null),
  },
  clearBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownWebDismiss: {
    ...(Platform.OS === 'web'
      ? ({ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 } as const)
      : { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 }),
  },
  dropdown: {
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
  dropdownBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  dropdownModalCard: {
    borderWidth: 1,
    borderRadius: 16,
    maxHeight: '70%',
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 10,
  },
  dropdownModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dropdownModalTitle: { fontSize: 16, fontWeight: '800' },
  dropdownScroll: { maxHeight: 280 },
  dropdownEmpty: {
    textAlign: 'center',
    paddingVertical: 20,
    paddingHorizontal: 14,
    fontSize: 14,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  dropdownItemText: { flex: 1, minWidth: 0 },
  dropdownTitle: { fontSize: 15, fontWeight: '800' },
  dropdownSubtitle: { fontSize: 12, marginTop: 2, fontWeight: '600' },
  mapsTab: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignSelf: 'flex-start',
  },
  actionTabsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  filterTabWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mapsTabText: { fontSize: 13, fontWeight: '800' },
  empty: { textAlign: 'center', marginTop: 24 },
});
