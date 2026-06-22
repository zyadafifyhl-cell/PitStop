import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AreaCard } from '@/components/ui/AreaCard';
import { AppTheme } from '@/constants/Theme';
import { useI18n } from '@/context/I18nContext';
import { DEMO_AREAS } from '@/lib/booking/areas';
import { countShopsByTypeAndArea, listAreasWithShops, listShopsByType } from '@/lib/booking/demoShops';
import { shopTypeLabel } from '@/lib/booking/format';
import { parseShopType } from '@/lib/booking/serviceType';
import { openAllShopsInMaps } from '@/lib/linking/contact';

export default function PickAreaScreen() {
  const { type: rawType } = useLocalSearchParams<{ type: string }>();
  const { t, locale } = useI18n();
  const type = parseShopType(rawType);

  const areas = useMemo(() => {
    if (!type) return [];
    const withShops = new Set(listAreasWithShops(type));
    return DEMO_AREAS.filter((a) => withShops.has(a.id));
  }, [type]);

  const shops = useMemo(() => {
    if (!type) return [];
    return listShopsByType(type);
  }, [type]);

  if (!type) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{t('service_invalid')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.badge}>{shopTypeLabel(type, locale)}</Text>
      <Text style={styles.title}>{t('area_pick_title')}</Text>
      <Text style={styles.lead}>{t('area_pick_lead')}</Text>

      {areas.length === 0 ? (
        <Text style={styles.empty}>{t('area_no_shops')}</Text>
      ) : (
        <>
          <Pressable
            onPress={() =>
              openAllShopsInMaps(shops, shopTypeLabel(type, locale), locale).catch(() =>
                Alert.alert(t('settings_link_fail_title'), t('settings_link_fail_body')),
              )
            }
            style={styles.mapsTab}>
            <Text style={styles.mapsTabText}>
              Google Maps · {locale === 'ar' ? 'كل الأماكن القريبة' : 'All nearby places'}
            </Text>
          </Pressable>

          {areas.map((area) => {
            const count = countShopsByTypeAndArea(type, area.id);
            const title = locale === 'ar' ? area.nameAr : area.name;
            const subtitle = locale === 'ar' ? area.cityAr : area.city;
            return (
              <AreaCard
                key={area.id}
                title={title}
                subtitle={subtitle}
                shopCount={count}
                shopCountLabel={t('area_shop_count')}
                onPress={() =>
                  router.push({
                    pathname: '/service/[type]/[areaId]',
                    params: { type, areaId: area.id },
                  })
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
  screen: { flex: 1, backgroundColor: AppTheme.bg },
  content: { padding: 20, paddingBottom: 40 },
  center: {
    flex: 1,
    backgroundColor: AppTheme.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { color: AppTheme.textMuted },
  badge: {
    color: AppTheme.accent,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  title: { color: AppTheme.text, fontSize: 26, fontWeight: '900', marginBottom: 8 },
  lead: { color: AppTheme.textMuted, fontSize: 15, lineHeight: 22, marginBottom: 14 },
  mapsTab: {
    backgroundColor: AppTheme.accentSoft,
    borderWidth: 1,
    borderColor: AppTheme.accent,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  mapsTabText: { color: AppTheme.accent, fontSize: 13, fontWeight: '800' },
  empty: { color: AppTheme.textMuted, textAlign: 'center', marginTop: 24 },
});
