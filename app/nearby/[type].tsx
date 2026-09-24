import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
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
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { useShopCatalog } from '@/context/ShopCatalogContext';
import { shopTypeLabel } from '@/lib/booking/format';
import { listActiveOfferFlagsByShopIds } from '@/lib/booking/offerRepository';
import { listFavoriteShopIds } from '@/lib/booking/favoritesStorage';
import { formatDistanceAway } from '@/lib/booking/nearby';
import {
  isDiscoverableShopType,
  listDiscoverableSortedByDistance,
  type DiscoverableListing,
} from '@/lib/booking/nearbyDiscovery';
import { getShopAverageRatings, type ShopRatingSummary } from '@/lib/booking/reviewsStorage';
import { getShopExtras } from '@/lib/booking/shopExtrasStorage';
import { getShopOpenStatus } from '@/lib/booking/shopSchedule';
import { parseShopType } from '@/lib/booking/serviceType';
import { isStoreShopType } from '@/lib/booking/storeCatalog';
import { NEARBY_DEFAULT_RADIUS_KM } from '@/lib/booking/washBranchNearby';
import { openPhone } from '@/lib/linking/contact';
import type { TranslationKey } from '@/lib/i18n/strings';

type NearbyFilter = 'all' | 'top_rated' | 'price' | 'distance' | 'favorites';

export default function NearbyScreen() {
  const { type: rawType } = useLocalSearchParams<{ type: string }>();
  const { t, locale } = useI18n();
  const theme = useAppTheme();
  const { customer } = useCustomerAuth();
  const { ready: catalogReady, version: catalogVersion } = useShopCatalog();
  const type = parseShopType(rawType);
  const [loading, setLoading] = useState(true);
  const [locationDenied, setLocationDenied] = useState(false);
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [shops, setShops] = useState<DiscoverableListing[]>([]);
  const [ratingsMap, setRatingsMap] = useState<Record<string, ShopRatingSummary>>({});
  const [openNowByShopId, setOpenNowByShopId] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<NearbyFilter>('all');
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [offerFlags, setOfferFlags] = useState<Record<string, { hasActiveOffer: boolean; maxDiscount: number }>>({});

  const refreshLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setUserLat(pos.coords.latitude);
        setUserLng(pos.coords.longitude);
        setLocationDenied(false);
      } else {
        setLocationDenied(true);
      }
    } catch {
      setLocationDenied(true);
    }
  }, []);

  const loadListings = useCallback(async () => {
    if (!type || !catalogReady || !isDiscoverableShopType(type)) return;
    setLoading(true);

    const rows = await listDiscoverableSortedByDistance(type, userLat, userLng, {
      radiusKm: NEARBY_DEFAULT_RADIUS_KM,
    });
    setShops(rows);

    const shopIds = [...new Set(rows.map((row) => row.id))];
    setRatingsMap(await getShopAverageRatings(shopIds));
    setOfferFlags(await listActiveOfferFlagsByShopIds(shopIds));

    const openMap: Record<string, boolean> = {};
    await Promise.all(
      shopIds.map(async (shopId) => {
        const extras = await getShopExtras(shopId);
        openMap[shopId] = getShopOpenStatus(extras).isOpen;
      }),
    );
    setOpenNowByShopId(openMap);

    if (customer?.id) {
      setFavoriteIds(await listFavoriteShopIds(customer.id));
    } else {
      setFavoriteIds([]);
    }
    setLoading(false);
  }, [type, catalogReady, catalogVersion, customer?.id, userLat, userLng]);

  useFocusEffect(
    useCallback(() => {
      void refreshLocation();
    }, [refreshLocation]),
  );

  useEffect(() => {
    if (catalogReady) void loadListings();
  }, [catalogReady, loadListings]);

  const filteredShops = useMemo(() => {
    let rows = shops.slice();
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (shop) =>
          shop.name.toLowerCase().includes(q) ||
          shop.nameAr.toLowerCase().includes(q) ||
          shop.address.toLowerCase().includes(q) ||
          shop.addressAr.toLowerCase().includes(q),
      );
    }
    if (filter === 'top_rated') {
      rows = rows.slice().sort((a, b) => {
        const ar = ratingsMap[a.id]?.average ?? -1;
        const br = ratingsMap[b.id]?.average ?? -1;
        return br - ar;
      });
    } else if (filter === 'price') {
      rows = rows.slice().sort((a, b) => a.name.localeCompare(b.name));
    } else if (filter === 'distance') {
      rows = rows.slice().sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));
    } else if (filter === 'favorites') {
      rows = rows.filter((shop) => favoriteIds.includes(shop.id));
    }

    // Always show open places first; closed places sink to the end.
    rows = rows.slice().sort((a, b) => {
      const aOpen = openNowByShopId[a.id] === true ? 0 : 1;
      const bOpen = openNowByShopId[b.id] === true ? 0 : 1;
      return aOpen - bOpen;
    });

    return rows;
  }, [shops, search, filter, favoriteIds, ratingsMap, openNowByShopId]);

  const filterOptions: Array<{ id: NearbyFilter; label: string }> = [
    { id: 'all', label: t('home_filter_all') },
    { id: 'top_rated', label: t('filter_top_rated') },
    { id: 'price', label: t('filter_price') },
    { id: 'distance', label: t('filter_distance') },
    { id: 'favorites', label: t('filter_favorites') },
  ];

  const activeFilterLabel =
    filterOptions.find((option) => option.id === filter)?.label ?? t('home_filter_all');

  function selectFilter(next: NearbyFilter) {
    setFilter(next);
    setFilterMenuOpen(false);
  }

  function renderFilterMenuItems() {
    return filterOptions.map((option) => {
      const active = filter === option.id;
      return (
        <Pressable
          key={option.id}
          onPress={() => selectFilter(option.id)}
          style={({ pressed }) => [
            styles.filterMenuItem,
            { borderBottomColor: theme.border },
            active && { backgroundColor: theme.accentSoft },
            pressed && { backgroundColor: theme.accentSoft },
          ]}>
          <Text style={[styles.filterMenuItemText, { color: active ? theme.accent : theme.text }]}>
            {option.label}
          </Text>
          {active ? <Ionicons name="checkmark" size={18} color={theme.accent} /> : null}
        </Pressable>
      );
    });
  }

  if (!type || !isDiscoverableShopType(type)) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <Text style={[styles.muted, { color: theme.textMuted }]}>{t('nearby_discoverable_only')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.screen, { backgroundColor: theme.bg }]} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: theme.text }]}>{t('nearby_title')}</Text>
      <Text style={[styles.lead, { color: theme.textMuted }]}>
        {locationDenied ? t('nearby_no_location') : t('nearby_lead')}
      </Text>
      <Text style={[styles.badge, { color: theme.accent }]}>{shopTypeLabel(type, locale)}</Text>

      <View style={[styles.searchFilterRow, { zIndex: filterMenuOpen ? 40 : 1 }]}>
        <TextInput
          value={search}
          onChangeText={(text) => {
            setSearch(text);
            if (filterMenuOpen) setFilterMenuOpen(false);
          }}
          placeholder={t('nearby_search_placeholder')}
          placeholderTextColor={theme.textDim}
          style={[
            styles.search,
            { color: theme.text, borderColor: theme.border, backgroundColor: theme.bgElevated },
          ]}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={locale === 'ar' ? 'فلتر النتائج' : 'Filter results'}
          onPress={() => setFilterMenuOpen((open) => !open)}
          style={[
            styles.filterBtn,
            {
              backgroundColor: filter !== 'all' ? theme.accent : theme.bgElevated,
              borderColor: filter !== 'all' ? theme.accent : theme.border,
            },
          ]}>
          <Ionicons
            name="options-outline"
            size={20}
            color={filter !== 'all' ? theme.onAccent : theme.accent}
          />
        </Pressable>

        {filterMenuOpen && Platform.OS === 'web' ? (
          <>
            <Pressable style={styles.filterMenuDismiss} onPress={() => setFilterMenuOpen(false)} />
            <View
              style={[
                styles.filterMenu,
                {
                  backgroundColor: theme.bgElevated,
                  borderColor: theme.border,
                  shadowColor: theme.text,
                },
              ]}>
              <Text style={[styles.filterMenuHeader, { color: theme.textMuted }]}>
                {locale === 'ar' ? `الفلتر: ${activeFilterLabel}` : `Filter: ${activeFilterLabel}`}
              </Text>
              {renderFilterMenuItems()}
            </View>
          </>
        ) : null}
      </View>

      <Modal
        visible={filterMenuOpen && Platform.OS !== 'web'}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterMenuOpen(false)}>
        <View style={styles.filterModalBackdrop}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setFilterMenuOpen(false)} />
          <View
            style={[
              styles.filterModalCard,
              {
                backgroundColor: theme.bgElevated,
                borderColor: theme.border,
                shadowColor: theme.text,
              },
            ]}>
            <View style={[styles.filterModalHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.filterModalTitle, { color: theme.text }]}>
                {locale === 'ar' ? 'فلتر النتائج' : 'Filter results'}
              </Text>
              <Pressable onPress={() => setFilterMenuOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={theme.textMuted} />
              </Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">{renderFilterMenuItems()}</ScrollView>
          </View>
        </View>
      </Modal>

      {loading ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: 24 }} />
      ) : filteredShops.length === 0 ? (
        <Text style={[styles.empty, { color: theme.textMuted }]}>{t('book_no_shops')}</Text>
      ) : (
        filteredShops.map((shop, index) => (
          <NearbyShopCard
            key={'branchId' in shop ? `${shop.id}-${shop.branchId}` : shop.id}
            shop={shop}
            index={index}
            locale={locale}
            theme={theme}
            t={t}
            ratingSummary={ratingsMap[shop.id]}
            offerFlag={offerFlags[shop.id]}
          />
        ))
      )}
    </ScrollView>
  );
}

function NearbyShopCard({
  shop,
  index,
  locale,
  theme,
  t,
  ratingSummary,
  offerFlag,
}: {
  shop: DiscoverableListing;
  index: number;
  locale: 'en' | 'ar';
  theme: ReturnType<typeof useAppTheme>;
  t: (key: TranslationKey) => string;
  ratingSummary?: ShopRatingSummary;
  offerFlag?: { hasActiveOffer: boolean; maxDiscount: number };
}) {
  const distanceLabel =
    shop.distanceKm != null ? formatDistanceAway(shop.distanceKm, locale) : undefined;

  return (
    <ShopListCard
      shopId={shop.id}
      name={locale === 'ar' ? shop.nameAr : shop.name}
      address={locale === 'ar' ? shop.addressAr : shop.address}
      type={shop.type}
      typeLabel={
        index === 0 && shop.distanceKm != null
          ? `${shopTypeLabel(shop.type, locale)} · ${t('nearby_closest')}`
          : shopTypeLabel(shop.type, locale)
      }
      averageRating={ratingSummary?.average ?? null}
      reviewCount={ratingSummary?.count}
      latitude={shop.latitude}
      longitude={shop.longitude}
      phone={shop.phone}
      distanceLabel={distanceLabel}
      bookLabel={t('shop_card_view_details')}
      onCall={() =>
        openPhone(shop.phone).catch(() =>
          Alert.alert(t('settings_link_fail_title'), t('settings_link_fail_body')),
        )
      }
      onPress={() =>
        isStoreShopType(shop.type)
          ? router.push(`/parts-shop/${shop.id}` as any)
          : router.push(`/shop-profile/${shop.id}` as any)
      }
      hasActiveOffer={offerFlag?.hasActiveOffer}
      offerDiscountPercent={offerFlag?.maxDiscount}
    />
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted: { textAlign: 'center' },
  title: { fontSize: 24, fontWeight: '900', marginBottom: 8 },
  lead: { fontSize: 15, lineHeight: 22, marginBottom: 10 },
  badge: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', marginBottom: 12 },
  searchFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    position: 'relative',
    zIndex: 1,
    ...(Platform.OS === 'web' ? ({ overflow: 'visible' } as const) : null),
  },
  search: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as const) : null),
  },
  filterBtn: {
    width: 46,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterMenuDismiss: {
    ...(Platform.OS === 'web'
      ? ({ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 } as const)
      : { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 }),
  },
  filterMenu: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 6,
    minWidth: 200,
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
    zIndex: 50,
    elevation: 12,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
  },
  filterMenuHeader: {
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
  },
  filterMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  filterMenuItemText: { fontSize: 14, fontWeight: '700' },
  filterModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  filterModalCard: {
    borderWidth: 1,
    borderRadius: 16,
    maxHeight: '70%',
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 10,
  },
  filterModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filterModalTitle: { fontSize: 16, fontWeight: '800' },
  empty: { textAlign: 'center', marginTop: 12 },
});
