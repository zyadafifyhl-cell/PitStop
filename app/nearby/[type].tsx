import * as Location from 'expo-location';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import type { ShopExtras } from '@/lib/booking/types';
import { openListingsInMaps, openPhone } from '@/lib/linking/contact';
import type { TranslationKey } from '@/lib/i18n/strings';

type NearbyFilter = 'all' | 'top_rated' | 'price' | 'distance' | 'open_now' | 'favorites';

const RADIUS_OPTIONS_KM = [5, 10, 25, 50] as const;
const DEFAULT_RADIUS_KM = 25;

function formatRadiusLabel(km: number, locale: 'en' | 'ar'): string {
  return locale === 'ar' ? `${km} كم` : `${km} km`;
}

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
  const [selectedRadius, setSelectedRadius] = useState<number>(DEFAULT_RADIUS_KM);
  const [shops, setShops] = useState<DiscoverableListing[]>([]);
  const [ratingsMap, setRatingsMap] = useState<Record<string, ShopRatingSummary>>({});
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<NearbyFilter>('all');
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
      radiusKm: selectedRadius,
    });
    setShops(rows);

    const shopIds = [...new Set(rows.map((row) => row.id))];
    setRatingsMap(await getShopAverageRatings(shopIds));
    setOfferFlags(await listActiveOfferFlagsByShopIds(shopIds));

    if (customer?.id) {
      setFavoriteIds(await listFavoriteShopIds(customer.id));
    } else {
      setFavoriteIds([]);
    }
    setLoading(false);
  }, [type, catalogReady, catalogVersion, customer?.id, userLat, userLng, selectedRadius]);

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
    } else if (filter === 'open_now') {
      /* handled per-card via NearbyShopCard */
    } else if (filter === 'favorites') {
      rows = rows.filter((shop) => favoriteIds.includes(shop.id));
    }
    return rows;
  }, [shops, search, filter, favoriteIds, ratingsMap]);

  const filterChips: Array<{ id: NearbyFilter; label: string }> = [
    { id: 'top_rated', label: t('filter_top_rated') },
    { id: 'price', label: t('filter_price') },
    { id: 'distance', label: t('filter_distance') },
    { id: 'open_now', label: t('filter_open_now') },
    { id: 'favorites', label: t('filter_favorites') },
  ];

  if (!type || !isDiscoverableShopType(type)) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <Text style={[styles.muted, { color: theme.textMuted }]}>{t('nearby_discoverable_only')}</Text>
      </View>
    );
  }

  const serviceLabel = shopTypeLabel(type, locale);

  async function openMapView() {
    try {
      await openListingsInMaps(filteredShops, serviceLabel, locale);
    } catch {
      Alert.alert(t('settings_link_fail_title'), t('nearby_map_no_coords'));
    }
  }

  return (
    <ScrollView style={[styles.screen, { backgroundColor: '#080D1A' }]} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: theme.text }]}>{t('nearby_title')}</Text>
      <Text style={[styles.lead, { color: theme.textMuted }]}>
        {locationDenied ? t('nearby_no_location') : t('nearby_lead')}
      </Text>
      <Text style={[styles.badge, { color: theme.accent }]}>{serviceLabel}</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.radiusRow}>
        {RADIUS_OPTIONS_KM.map((km) => {
          const active = selectedRadius === km;
          return (
            <Pressable
              key={km}
              onPress={() => setSelectedRadius(km)}
              style={[
                styles.radiusPill,
                {
                  borderColor: active ? '#00D4FF' : 'rgba(255,255,255,0.05)',
                  backgroundColor: active ? 'rgba(0, 212, 255, 0.14)' : '#121826',
                },
              ]}>
              <Text style={[styles.radiusPillText, { color: active ? '#00D4FF' : theme.textMuted }]}>
                {formatRadiusLabel(km, locale)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder={t('nearby_search_placeholder')}
        placeholderTextColor={theme.textDim}
        style={[
          styles.search,
          { color: theme.text, borderColor: theme.border, backgroundColor: theme.bgElevated },
        ]}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow}>
        {filterChips.map((chip) => {
          const active = filter === chip.id;
          return (
            <Pressable
              key={chip.id}
              onPress={() => setFilter(active ? 'all' : chip.id)}
              style={[
                styles.filterChip,
                {
                  backgroundColor: active ? theme.accent : theme.bgElevated,
                  borderColor: active ? theme.accent : theme.border,
                },
              ]}>
              <Text style={{ color: active ? theme.onAccent : theme.text, fontWeight: '700', fontSize: 12 }}>
                {chip.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: 24 }} />
      ) : (
        <>
          <Pressable
            onPress={() => openMapView()}
            style={[styles.mapsAllBtn, { backgroundColor: theme.accentSoft, borderColor: theme.accent }]}>
            <Text style={[styles.mapsAllText, { color: theme.accent }]}>{t('location_map_view')}</Text>
          </Pressable>

          {filteredShops.length === 0 ? (
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
                filter={filter}
                ratingSummary={ratingsMap[shop.id]}
                offerFlag={offerFlags[shop.id]}
              />
            ))
          )}
        </>
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
  filter,
  ratingSummary,
  offerFlag,
}: {
  shop: DiscoverableListing;
  index: number;
  locale: 'en' | 'ar';
  theme: ReturnType<typeof useAppTheme>;
  t: (key: TranslationKey) => string;
  filter: NearbyFilter;
  ratingSummary?: ShopRatingSummary;
  offerFlag?: { hasActiveOffer: boolean; maxDiscount: number };
}) {
  const [openNow, setOpenNow] = useState<boolean | null>(null);
  const [washShopStatus, setWashShopStatus] = useState<ShopExtras['washShopStatus']>();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const extras = await getShopExtras(shop.id);
      const status = getShopOpenStatus(extras);
      if (!cancelled) {
        setOpenNow(status.isOpen);
        setWashShopStatus(extras.washShopStatus);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shop.id]);

  const keepVisibleDespiteOpenFilter =
    shop.type === 'wash' && (washShopStatus === 'closed' || washShopStatus === 'vacation');

  if (filter === 'open_now' && openNow === false && !keepVisibleDespiteOpenFilter) return null;

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
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted: { textAlign: 'center' },
  title: { fontSize: 24, fontWeight: '900', marginBottom: 8 },
  lead: { fontSize: 15, lineHeight: 22, marginBottom: 10 },
  badge: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', marginBottom: 12 },
  radiusRow: { gap: 8, paddingBottom: 14 },
  radiusPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  radiusPillText: { fontSize: 13, fontWeight: '800' },
  search: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 12,
  },
  filtersRow: { gap: 8, paddingBottom: 12 },
  filterChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  mapsAllBtn: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  mapsAllText: { fontSize: 13, fontWeight: '800' },
  empty: { textAlign: 'center', marginTop: 12 },
});
