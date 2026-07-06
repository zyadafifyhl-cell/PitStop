import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

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

export default function ShopsInAreaScreen() {
  const { type: rawType, areaId } = useLocalSearchParams<{ type: string; areaId: string }>();
  const { t, locale } = useI18n();
  const theme = useAppTheme();
  const { customer } = useCustomerAuth();
  const { ready: catalogReady, version: catalogVersion } = useShopCatalog();
  const type = parseShopType(rawType);
  const area = areaId && catalogReady ? getAreaById(areaId) : undefined;
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [bundle, setBundle] = useState<ShopListBundle | null>(() =>
    type && areaId ? peekShopListBundle(type, areaId) : null,
  );
  const [bundleHydrating, setBundleHydrating] = useState(!bundle);

  const shops = useMemo(() => {
    if (!catalogReady || !type || !areaId) return [];
    return listShopsByTypeAndArea(type, areaId);
  }, [catalogReady, catalogVersion, type, areaId]);

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
        <Text style={styles.empty}>{t('book_no_shops')}</Text>
      ) : (
        <>
          <Pressable
            onPress={() => openListingsInMaps(shops, `${serviceLabel} ${areaName}`, locale).catch(linkFail)}
            style={[styles.mapsTab, { backgroundColor: theme.accentSoft, borderColor: theme.accent }]}>
            <Text style={[styles.mapsTabText, { color: theme.accent }]}>
              Google Maps · {locale === 'ar' ? 'كل الأماكن القريبة' : 'All nearby places'}
            </Text>
          </Pressable>

          {shops.map((shop) => {
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
                onPress={() =>
                  isStoreShopType(shop.type)
                    ? router.push(`/parts-shop/${shop.id}` as any)
                    : router.push(`/shop-profile/${shop.id}` as any)
                }
              />
            );
          })}
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
  lead: { fontSize: 15, lineHeight: 22, marginBottom: 8 },
  phoneNote: { fontSize: 12, lineHeight: 18, marginBottom: 16 },
  mapsTab: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignSelf: 'flex-start',
    marginBottom: 14,
  },
  mapsTabText: { fontSize: 13, fontWeight: '800' },
  empty: { textAlign: 'center', marginTop: 24 },
});
