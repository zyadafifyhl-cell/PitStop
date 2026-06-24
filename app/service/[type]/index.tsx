import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AreaCard } from '@/components/ui/AreaCard';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { DEMO_AREAS } from '@/lib/booking/areas';
import { countShopsByTypeAndArea, listAreasWithShops, listShopsByType } from '@/lib/booking/demoShops';
import { shopTypeLabel } from '@/lib/booking/format';
import { parseShopType } from '@/lib/booking/serviceType';
import { openAllShopsInMaps } from '@/lib/linking/contact';

export default function PickAreaScreen() {
  const { type: rawType } = useLocalSearchParams<{ type: string }>();
  const { t, locale } = useI18n();
  const theme = useAppTheme();
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
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <Text style={[styles.error, { color: theme.textMuted }]}>{t('service_invalid')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.screen, { backgroundColor: theme.bg }]} contentContainerStyle={styles.content}>
      <Text style={[styles.badge, { color: theme.accent }]}>{shopTypeLabel(type, locale)}</Text>
      <Text style={[styles.title, { color: theme.text }]}>{t('area_pick_title')}</Text>
      <Text style={[styles.lead, { color: theme.textMuted }]}>{t('area_pick_lead')}</Text>

      {areas.length === 0 ? (
        <Text style={[styles.empty, { color: theme.textMuted }]}>{t('area_no_shops')}</Text>
      ) : (
        <>
          <Pressable
            onPress={() =>
              openAllShopsInMaps(shops, shopTypeLabel(type, locale), locale).catch(() =>
                Alert.alert(t('settings_link_fail_title'), t('settings_link_fail_body')),
              )
            }
            style={[styles.mapsTab, { backgroundColor: theme.accentSoft, borderColor: theme.accent }]}>
            <Text style={[styles.mapsTabText, { color: theme.accent }]}>
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
  lead: { fontSize: 15, lineHeight: 22, marginBottom: 14 },
  mapsTab: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  mapsTabText: { fontSize: 13, fontWeight: '800' },
  empty: { textAlign: 'center', marginTop: 24 },
});
