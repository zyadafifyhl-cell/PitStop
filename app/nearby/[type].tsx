import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ShopListCard } from '@/components/ui/ShopListCard';
import { AppTheme } from '@/constants/Theme';
import { useI18n } from '@/context/I18nContext';
import { formatDistance, listShopsSortedByDistance } from '@/lib/booking/nearby';
import { shopTypeLabel } from '@/lib/booking/format';
import { parseShopType } from '@/lib/booking/serviceType';
import { openAllShopsInMaps, openPhone, openShopInMaps } from '@/lib/linking/contact';

export default function NearbyScreen() {
  const { type: rawType } = useLocalSearchParams<{ type: string }>();
  const { t, locale } = useI18n();
  const type = parseShopType(rawType);
  const [loading, setLoading] = useState(true);
  const [locationDenied, setLocationDenied] = useState(false);
  const [shops, setShops] = useState<ReturnType<typeof listShopsSortedByDistance>>([]);

  const load = useCallback(async () => {
    if (!type) return;
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
    setShops(listShopsSortedByDistance(type, lat, lng));
    setLoading(false);
  }, [type]);

  useEffect(() => {
    load();
  }, [load]);

  if (!type) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{t('service_invalid')}</Text>
      </View>
    );
  }

  const serviceLabel = shopTypeLabel(type, locale);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('nearby_title')}</Text>
      <Text style={styles.lead}>
        {locationDenied ? t('nearby_no_location') : t('nearby_lead')}
      </Text>
      <Text style={styles.badge}>{serviceLabel}</Text>

      {loading ? (
        <ActivityIndicator color={AppTheme.accent} style={{ marginTop: 24 }} />
      ) : (
        <>
          <Pressable
            onPress={() =>
              openAllShopsInMaps(shops, serviceLabel, locale).catch(() =>
                Alert.alert(t('settings_link_fail_title'), t('settings_link_fail_body')),
              )
            }
            style={styles.mapsAllBtn}>
            <Text style={styles.mapsAllText}>{t('nearby_open_all_maps')}</Text>
          </Pressable>

          {shops.map((shop, index) => (
            <ShopListCard
              key={shop.id}
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
              distanceLabel={formatDistance(shop.distanceKm, locale)}
              bookLabel={t('book_tap_to_book')}
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
                router.push({ pathname: '/book/[shopId]', params: { shopId: shop.id } })
              }
            />
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppTheme.bg },
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: AppTheme.bg },
  muted: { color: AppTheme.textMuted },
  title: { color: AppTheme.text, fontSize: 24, fontWeight: '900', marginBottom: 8 },
  lead: { color: AppTheme.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 12 },
  badge: { color: AppTheme.accent, fontSize: 13, fontWeight: '700', marginBottom: 16 },
  mapsAllBtn: {
    backgroundColor: AppTheme.accentSoft,
    borderWidth: 1,
    borderColor: AppTheme.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  mapsAllText: { color: AppTheme.accent, fontWeight: '700', fontSize: 14 },
});
