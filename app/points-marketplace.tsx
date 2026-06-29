import { router } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useI18n } from '@/context/I18nContext';
import { useShopCatalog } from '@/context/ShopCatalogContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { getShopById } from '@/lib/booking/catalogRepository';
import {
  getLoyaltyPoints,
  listMarketplacePartners,
  MARKETPLACE_REWARDS,
  type MarketplacePartner,
} from '@/lib/booking/loyaltyPointsStorage';
import { shopTypeLabel } from '@/lib/booking/format';

export default function PointsMarketplaceScreen() {
  const theme = useAppTheme();
  const { t, locale } = useI18n();
  const { customer, isGuest } = useCustomerAuth();
  const { ready: catalogReady } = useShopCatalog();
  const [points, setPoints] = useState(0);

  const refreshPoints = useCallback(async () => {
    if (!customer) {
      setPoints(0);
      return;
    }
    const balance = await getLoyaltyPoints({ customerId: customer.id, phone: customer.phone });
    setPoints(balance);
  }, [customer]);

  React.useEffect(() => {
    refreshPoints();
  }, [refreshPoints]);

  const partners: MarketplacePartner[] = catalogReady ? listMarketplacePartners(locale) : [];

  function openShop(partner: MarketplacePartner) {
    router.push(`/shop-profile/${partner.shop.id}`);
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={styles.content}>
      <View style={[styles.hero, { backgroundColor: theme.accentSoft, borderColor: theme.accent }]}>
        <Text style={[styles.heroLabel, { color: theme.textMuted }]}>{t('loyalty_points_balance_label')}</Text>
        <Text style={[styles.heroValue, { color: theme.accent }]}>{points}</Text>
        <Text style={[styles.heroHint, { color: theme.textMuted }]}>{t('loyalty_points_earn_hint')}</Text>
      </View>

      <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('loyalty_marketplace_rewards_title')}</Text>
      <View style={styles.rewardGrid}>
        {MARKETPLACE_REWARDS.map((reward) => {
          const title = locale === 'ar' ? reward.titleAr : reward.titleEn;
          const desc = locale === 'ar' ? reward.descriptionAr : reward.descriptionEn;
          const affordable = points >= reward.pointsRequired;
          return (
            <View
              key={reward.id}
              style={[
                styles.rewardCard,
                {
                  borderColor: affordable ? theme.accent : theme.border,
                  backgroundColor: theme.card,
                },
              ]}>
              <Text style={[styles.rewardPoints, { color: theme.accent }]}>
                {t('loyalty_marketplace_points_required').replace('{points}', String(reward.pointsRequired))}
              </Text>
              <Text style={[styles.rewardTitle, { color: theme.text }]}>{title}</Text>
              <Text style={[styles.rewardDesc, { color: theme.textMuted }]}>{desc}</Text>
            </View>
          );
        })}
      </View>

      <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('loyalty_marketplace_partners_title')}</Text>
      <Text style={[styles.sectionLead, { color: theme.textMuted }]}>{t('loyalty_marketplace_partners_lead')}</Text>

      {isGuest || !customer ? (
        <Text style={[styles.guestHint, { color: theme.textDim }]}>{t('loyalty_marketplace_sign_in')}</Text>
      ) : partners.length === 0 ? (
        <Text style={[styles.guestHint, { color: theme.textMuted }]}>{t('loyalty_marketplace_empty')}</Text>
      ) : (
        partners.map((partner) => {
          const shopName = locale === 'ar' ? partner.shop.nameAr : partner.shop.name;
          return (
            <Pressable
              key={partner.shop.id}
              onPress={() => openShop(partner)}
              style={[styles.partnerCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.partnerHeader}>
                <Text style={[styles.partnerName, { color: theme.text }]} numberOfLines={1}>
                  {shopName}
                </Text>
                <Text style={[styles.partnerType, { color: theme.accent }]}>
                  {shopTypeLabel(partner.shop.type, locale)}
                </Text>
              </View>
              <Text style={[styles.partnerArea, { color: theme.textMuted }]}>{partner.areaLabel}</Text>
              <View style={styles.thresholdList}>
                {partner.rewards.map((reward) => (
                  <View key={reward.id} style={[styles.thresholdChip, { backgroundColor: theme.bgElevated }]}>
                    <Text style={[styles.thresholdText, { color: theme.text }]}>
                      {t('loyalty_marketplace_threshold')
                        .replace('{points}', String(reward.pointsRequired))
                        .replace('{reward}', locale === 'ar' ? reward.titleAr : reward.titleEn)}
                    </Text>
                  </View>
                ))}
              </View>
              {partner.shop.type === 'wash' && partner.shop.latitude ? (
                <Text style={[styles.mapHint, { color: theme.textDim }]}>{t('loyalty_marketplace_tap_shop')}</Text>
              ) : null}
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32, gap: 8 },
  hero: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    alignItems: 'center',
    marginBottom: 8,
  },
  heroLabel: { fontSize: 13, fontWeight: '700' },
  heroValue: { fontSize: 42, fontWeight: '900', marginVertical: 4 },
  heroHint: { fontSize: 12, textAlign: 'center', lineHeight: 18 },
  sectionTitle: { fontSize: 17, fontWeight: '900', marginTop: 8 },
  sectionLead: { fontSize: 13, lineHeight: 20, marginBottom: 8 },
  rewardGrid: { gap: 10, marginBottom: 8 },
  rewardCard: { borderWidth: 1, borderRadius: 14, padding: 14 },
  rewardPoints: { fontSize: 12, fontWeight: '800', marginBottom: 6 },
  rewardTitle: { fontSize: 16, fontWeight: '900', marginBottom: 4 },
  rewardDesc: { fontSize: 13, lineHeight: 19 },
  guestHint: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
  partnerCard: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 10 },
  partnerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  partnerName: { fontSize: 16, fontWeight: '900', flex: 1 },
  partnerType: { fontSize: 11, fontWeight: '800' },
  partnerArea: { fontSize: 13, marginTop: 4, marginBottom: 10 },
  thresholdList: { gap: 6 },
  thresholdChip: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  thresholdText: { fontSize: 12, fontWeight: '700', lineHeight: 17 },
  mapHint: { fontSize: 11, marginTop: 8, fontStyle: 'italic' },
});
