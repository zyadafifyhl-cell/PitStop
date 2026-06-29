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
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { useShopCatalog } from '@/context/ShopCatalogContext';
import { formatDistanceAway, listShopsSortedByDistance, type ShopWithDistance } from '@/lib/booking/nearby';
import { listWashBranchesSortedByDistance, type WashBranchListing } from '@/lib/booking/washBranchNearby';
import { shopTypeLabel } from '@/lib/booking/format';
import { getShopExtras } from '@/lib/booking/shopExtrasStorage';
import type { ShopExtras } from '@/lib/booking/types';
import { getShopOpenStatus } from '@/lib/booking/shopSchedule';
import { isStoreShopType } from '@/lib/booking/storeCatalog';
import { parseShopType } from '@/lib/booking/serviceType';
import { listFavoriteShopIds } from '@/lib/booking/favoritesStorage';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { openAllShopsInMaps, openPhone, openShopInMaps } from '@/lib/linking/contact';
import type { TranslationKey } from '@/lib/i18n/strings';

type NearbyFilter = 'all' | 'top_rated' | 'price' | 'distance' | 'open_now' | 'favorites';

export default function NearbyScreen() {
  const { type: rawType } = useLocalSearchParams<{ type: string }>();
  const { t, locale } = useI18n();
  const theme = useAppTheme();
  const { customer } = useCustomerAuth();
  const { ready: catalogReady, version: catalogVersion } = useShopCatalog();
  const type = parseShopType(rawType);
  const [loading, setLoading] = useState(true);
  const [locationDenied, setLocationDenied] = useState(false);
  const [shops, setShops] = useState<(ShopWithDistance | WashBranchListing)[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<NearbyFilter>('all');
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!type || !catalogReady) return;
    setLoading(true);
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
        setLocationDenied(false);
      } else {
        setLocationDenied(true);
      }
    } catch {
      setLocationDenied(true);
    }
    if (type === 'wash') {
      setShops(await listWashBranchesSortedByDistance(lat, lng));
    } else {
      setShops(listShopsSortedByDistance(type, lat, lng));
    }
    if (customer?.id) {
      setFavoriteIds(await listFavoriteShopIds(customer.id));
    } else {
      setFavoriteIds([]);
    }
    setLoading(false);
  }, [type, catalogReady, catalogVersion, customer?.id]);

  useEffect(() => {
    if (catalogReady) load();
  }, [catalogReady, load]);

  useFocusEffect(
    useCallback(() => {
      if (catalogReady) load();
    }, [catalogReady, load]),
  );

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
      rows = rows.slice().sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    } else if (filter === 'price') {
      rows = rows.slice().sort((a, b) => a.name.localeCompare(b.name));
    } else if (filter === 'distance') {
      rows = rows.slice().sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));
    } else if (filter === 'favorites') {
      rows = rows.filter((shop) => favoriteIds.includes(shop.id));
    }
    return rows;
  }, [shops, search, filter, favoriteIds]);

  const filterChips: Array<{ id: NearbyFilter; label: string }> = [
    { id: 'top_rated', label: t('filter_top_rated') },
    { id: 'price', label: t('filter_price') },
    { id: 'distance', label: t('filter_distance') },
    { id: 'open_now', label: t('filter_open_now') },
    { id: 'favorites', label: t('filter_favorites') },
  ];

  if (!type) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <Text style={[styles.muted, { color: theme.textMuted }]}>{t('service_invalid')}</Text>
      </View>
    );
  }

  const serviceLabel = shopTypeLabel(type, locale);

  return (
    <ScrollView style={[styles.screen, { backgroundColor: theme.bg }]} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: theme.text }]}>{t('nearby_title')}</Text>
      <Text style={[styles.lead, { color: theme.textMuted }]}>
        {locationDenied ? t('nearby_no_location') : t('nearby_lead')}
      </Text>
      <Text style={[styles.badge, { color: theme.accent }]}>{serviceLabel}</Text>

      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder={t('nearby_search_placeholder')}
        placeholderTextColor={theme.textDim}
        style={[styles.search, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bgElevated }]}
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
            onPress={() =>
              openAllShopsInMaps(filteredShops, serviceLabel, locale).catch(() =>
                Alert.alert(t('settings_link_fail_title'), t('settings_link_fail_body')),
              )
            }
            style={[styles.mapsAllBtn, { backgroundColor: theme.accentSoft, borderColor: theme.accent }]}>
            <Text style={[styles.mapsAllText, { color: theme.accent }]}>{t('nearby_open_all_maps')}</Text>
          </Pressable>

          {filteredShops.map((shop, index) => (
            <NearbyShopCard
              key={'branchId' in shop ? `${shop.id}-${shop.branchId}` : shop.id}
              shop={shop}
              index={index}
              locale={locale}
              theme={theme}
              t={t}
              filter={filter}
            />
          ))}
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
}: {
  shop: ShopWithDistance | WashBranchListing;
  index: number;
  locale: 'en' | 'ar';
  theme: ReturnType<typeof useAppTheme>;
  t: (key: TranslationKey) => string;
  filter: NearbyFilter;
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
      rating={shop.rating}
      phone={shop.phone}
      distanceLabel={formatDistanceAway(shop.distanceKm, locale)}
      bookLabel={t('shop_card_view_details')}
      onCall={() =>
        openPhone(shop.phone).catch(() =>
          Alert.alert(t('settings_link_fail_title'), t('settings_link_fail_body')),
        )
      }
      onOpenMaps={() =>
        openShopInMaps(shop, locale).catch(() =>
          Alert.alert(t('settings_link_fail_title'), t('settings_link_fail_body')),
        )
      }
      onPress={() =>
        isStoreShopType(shop.type)
          ? router.push(`/parts-shop/${shop.id}` as any)
          : router.push(`/shop-profile/${shop.id}` as any)
      }
      onViewDetails={() =>
        isStoreShopType(shop.type)
          ? router.push(`/parts-shop/${shop.id}` as any)
          : router.push(`/shop-profile/${shop.id}` as any)
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: {},
  title: { fontSize: 24, fontWeight: '900', marginBottom: 8 },
  lead: { fontSize: 15, lineHeight: 22, marginBottom: 10 },
  badge: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', marginBottom: 12 },
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
});
