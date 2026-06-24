import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ShopListCard } from '@/components/ui/ShopListCard';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { getAreaById } from '@/lib/booking/areas';
import { listShopsByTypeAndArea } from '@/lib/booking/demoShops';
import { toggleFavoriteShop } from '@/lib/booking/favoritesStorage';
import { shopTypeLabel } from '@/lib/booking/format';
import { openAllShopsInMaps, openPhone, openShopInMaps } from '@/lib/linking/contact';
import { parseShopType } from '@/lib/booking/serviceType';

export default function ShopsInAreaScreen() {
  const { type: rawType, areaId } = useLocalSearchParams<{ type: string; areaId: string }>();
  const { t, locale } = useI18n();
  const theme = useAppTheme();
  const { customer } = useCustomerAuth();
  const type = parseShopType(rawType);
  const area = areaId ? getAreaById(areaId) : undefined;
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  const shops = useMemo(() => {
    if (!type || !areaId) return [];
    return listShopsByTypeAndArea(type, areaId);
  }, [type, areaId]);

  const loadFavorites = useCallback(async () => {
    if (!customer) {
      setFavoriteIds(new Set());
      return;
    }
    const { listFavoriteShopIds } = await import('@/lib/booking/favoritesStorage');
    const ids = await listFavoriteShopIds(customer.id);
    setFavoriteIds(new Set(ids));
  }, [customer]);

  useFocusEffect(
    useCallback(() => {
      loadFavorites();
    }, [loadFavorites]),
  );

  function linkFail() {
    Alert.alert(t('settings_link_fail_title'), t('settings_link_fail_body'));
  }

  async function onToggleFavorite(shopId: string) {
    if (!customer) return;
    await toggleFavoriteShop(customer.id, shopId);
    await loadFavorites();
  }

  if (!type || !area) {
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
            onPress={() => openAllShopsInMaps(shops, `${serviceLabel} ${areaName}`, locale).catch(linkFail)}
            style={[styles.mapsTab, { backgroundColor: theme.accentSoft, borderColor: theme.accent }]}>
            <Text style={[styles.mapsTabText, { color: theme.accent }]}>
              Google Maps · {locale === 'ar' ? 'كل الأماكن القريبة' : 'All nearby places'}
            </Text>
          </Pressable>

          {shops.map((shop) => (
            <ShopListCard
              key={shop.id}
              shopId={shop.id}
              name={locale === 'ar' ? shop.nameAr : shop.name}
              address={locale === 'ar' ? shop.addressAr : shop.address}
              type={shop.type}
              typeLabel={shopTypeLabel(shop.type, locale)}
              rating={shop.rating}
              phone={shop.phone}
              bookLabel={shop.type === 'parts' ? t('book_tap_to_book') : t('shop_profile_open')}
              isFavorite={favoriteIds.has(shop.id)}
              onToggleFavorite={() => onToggleFavorite(shop.id)}
              onCall={() => openPhone(shop.phone).catch(linkFail)}
              onOpenMaps={() => openShopInMaps(shop, locale).catch(linkFail)}
              onPress={() =>
                shop.type === 'parts'
                  ? router.push(`/parts-shop/${shop.id}` as any)
                  : router.push(`/shop-profile/${shop.id}` as any)
              }
            />
          ))}
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
