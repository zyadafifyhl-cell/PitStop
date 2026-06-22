import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ShopListCard } from '@/components/ui/ShopListCard';
import { AppTheme } from '@/constants/Theme';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useI18n } from '@/context/I18nContext';
import { getShopById } from '@/lib/booking/demoShops';
import { listFavoriteShopIds, removeFavoriteShop } from '@/lib/booking/favoritesStorage';
import { shopTypeLabel } from '@/lib/booking/format';
import { openPhone, openShopInMaps } from '@/lib/linking/contact';

export default function FavoritesScreen() {
  const { t, locale } = useI18n();
  const { customer } = useCustomerAuth();
  const [shopIds, setShopIds] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    if (!customer) {
      setShopIds([]);
      return;
    }
    const ids = await listFavoriteShopIds(customer.id);
    setShopIds(ids);
  }, [customer]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  function linkFail() {
    Alert.alert(t('settings_link_fail_title'), t('settings_link_fail_body'));
  }

  const shops = shopIds
    .map((id) => getShopById(id))
    .filter((s): s is NonNullable<typeof s> => !!s);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('tab_favorites')}</Text>
      <Text style={styles.lead}>{t('favorites_lead')}</Text>

      {shops.length === 0 ? (
        <Text style={styles.empty}>{t('favorites_empty')}</Text>
      ) : (
        shops.map((shop) => (
          <ShopListCard
            key={shop.id}
            name={locale === 'ar' ? shop.nameAr : shop.name}
            address={locale === 'ar' ? shop.addressAr : shop.address}
            type={shop.type}
            typeLabel={shopTypeLabel(shop.type, locale)}
            rating={shop.rating}
            phone={shop.phone}
            bookLabel={t('book_tap_to_book')}
            isFavorite
            onToggleFavorite={async () => {
              if (!customer) return;
              await removeFavoriteShop(customer.id, shop.id);
              await refresh();
            }}
            onCall={() => openPhone(shop.phone).catch(linkFail)}
            onOpenMaps={() => openShopInMaps(shop, locale).catch(linkFail)}
            onPress={() =>
              router.push({ pathname: '/book/[shopId]', params: { shopId: shop.id } })
            }
          />
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppTheme.bg },
  content: { padding: 20, paddingBottom: 40 },
  title: { color: AppTheme.text, fontSize: 26, fontWeight: '900', marginBottom: 8 },
  lead: { color: AppTheme.textMuted, fontSize: 15, lineHeight: 22, marginBottom: 22 },
  empty: { color: AppTheme.textMuted, textAlign: 'center', marginTop: 32, lineHeight: 22 },
});
