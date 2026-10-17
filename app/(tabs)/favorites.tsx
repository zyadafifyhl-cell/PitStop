import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ShopListCard } from '@/components/ui/ShopListCard';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useI18n } from '@/context/I18nContext';
import { useShopCatalog } from '@/context/ShopCatalogContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { getShopById } from '@/lib/booking/catalogRepository';
import { isStoreShopType } from '@/lib/booking/storeCatalog';
import { listFavoriteShopIds, removeFavoriteShop, resolveFavoritesOwnerId } from '@/lib/booking/favoritesStorage';
import { shopTypeLabel } from '@/lib/booking/format';
import { openPhone, openShopInMaps } from '@/lib/linking/contact';
import { pushFromBrowseTab, setActiveBrowseTab } from '@/lib/navigation/preserveTabStack';

export default function FavoritesScreen() {
  const { t, locale } = useI18n();
  const theme = useAppTheme();
  const { customer } = useCustomerAuth();
  const { ready: catalogReady, version: catalogVersion } = useShopCatalog();
  const [shopIds, setShopIds] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    const ids = await listFavoriteShopIds(resolveFavoritesOwnerId(customer?.id));
    setShopIds(ids);
  }, [customer?.id]);

  useFocusEffect(
    useCallback(() => {
      setActiveBrowseTab('/favorites');
      refresh();
    }, [refresh]),
  );

  function linkFail() {
    Alert.alert(t('settings_link_fail_title'), t('settings_link_fail_body'));
  }

  function openFavoriteShop(shopId: string, storeType: boolean) {
    pushFromBrowseTab(
      '/favorites',
      (storeType ? `/parts-shop/${shopId}` : `/shop-profile/${shopId}`) as any,
    );
  }

  const shops = catalogReady
    ? shopIds
        .map((id) => getShopById(id))
        .filter((s): s is NonNullable<typeof s> => !!s)
    : [];

  return (
    <ScrollView style={[styles.screen, { backgroundColor: theme.bg }]} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: theme.text }]}>{t('tab_favorites')}</Text>
      <Text style={[styles.lead, { color: theme.textMuted }]}>{t('favorites_lead')}</Text>

      {shops.length === 0 ? (
        <Text style={[styles.empty, { color: theme.textMuted }]}>{t('favorites_empty')}</Text>
      ) : (
        shops.map((shop) => (
          <ShopListCard
            key={shop.id}
            shopId={shop.id}
            name={locale === 'ar' ? shop.nameAr : shop.name}
            address={locale === 'ar' ? shop.addressAr : shop.address}
            type={shop.type}
            typeLabel={shopTypeLabel(shop.type, locale)}
            rating={shop.rating}
            phone={shop.phone}
            bookLabel={isStoreShopType(shop.type) ? t('book_tap_to_book') : t('shop_profile_open')}
            isFavorite
            onToggleFavorite={async () => {
              const ownerId = resolveFavoritesOwnerId(customer?.id);
              setShopIds((prev) => prev.filter((id) => id !== shop.id));
              await removeFavoriteShop(ownerId, shop.id);
              await refresh();
            }}
            onCall={() => openPhone(shop.phone).catch(linkFail)}
            onOpenMaps={() => openShopInMaps(shop, locale).catch(linkFail)}
            onPress={() => openFavoriteShop(shop.id, isStoreShopType(shop.type))}
          />
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { width: '100%', maxWidth: 1024, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48 },
  title: { fontSize: 26, fontWeight: '900', marginBottom: 8 },
  lead: { fontSize: 15, lineHeight: 22, marginBottom: 22 },
  empty: { textAlign: 'center', marginTop: 32, lineHeight: 22 },
});
