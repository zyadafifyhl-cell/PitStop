import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { formatOfferBadge, buildOfferBadgeMessages } from '@/lib/booking/offerPricing';
import { deactivateShopOffer, listActiveOffersForShop } from '@/lib/booking/offerRepository';
import type { ShopOffer } from '@/lib/booking/types';

type Props = {
  shopId: string;
  refreshKey?: number;
  onChanged?: () => void | Promise<void>;
};

export function MerchantCampaignList({ shopId, refreshKey = 0, onChanged }: Props) {
  const theme = useAppTheme();
  const { t, locale } = useI18n();
  const offerBadgeMessages = useMemo(() => buildOfferBadgeMessages(t), [t]);
  const [rows, setRows] = useState<ShopOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [endingId, setEndingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const offers = await listActiveOffersForShop(shopId);
      setRows(offers);
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function onEndCampaign(offerId: string) {
    setEndingId(offerId);
    try {
      await deactivateShopOffer(shopId, offerId);
      await load();
      await onChanged?.();
    } finally {
      setEndingId(null);
    }
  }

  if (loading) {
    return <ActivityIndicator color={theme.accent} style={{ marginTop: 8 }} />;
  }

  if (rows.length === 0) {
    return <Text style={[styles.empty, { color: theme.textMuted }]}>{t('campaign_list_empty')}</Text>;
  }

  return (
    <View style={styles.wrap}>
      {rows.map((offer) => {
        const badge = formatOfferBadge(offer, offerBadgeMessages);
        const expiresLabel = offer.expiresAt || offer.endDate;
        return (
          <View
            key={offer.id}
            style={[styles.card, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
            <Text style={[styles.title, { color: theme.text }]}>{offer.title}</Text>
            {offer.description ? (
              <Text style={[styles.meta, { color: theme.textMuted }]}>{offer.description}</Text>
            ) : null}
            <View style={[styles.badge, { backgroundColor: theme.warmSoft, borderColor: theme.warm }]}>
              <Text style={[styles.badgeText, { color: theme.warm }]}>{badge}</Text>
            </View>
            {expiresLabel ? (
              <Text style={[styles.meta, { color: theme.textDim }]}>
                {t('shop_offer_valid_until').replace(
                  '{date}',
                  new Date(expiresLabel).toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-EG'),
                )}
              </Text>
            ) : null}
            <Pressable
              onPress={() => {
                void onEndCampaign(offer.id);
              }}
              disabled={endingId === offer.id}
              style={[
                styles.endBtn,
                {
                  borderColor: theme.danger,
                  opacity: endingId === offer.id ? 0.65 : 1,
                },
              ]}>
              <Text style={[styles.endBtnText, { color: theme.danger }]}>
                {endingId === offer.id ? t('campaign_ending') : t('campaign_end_btn')}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, marginTop: 8 },
  empty: { fontSize: 14, lineHeight: 20, marginTop: 4 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 6 },
  title: { fontSize: 16, fontWeight: '800' },
  meta: { fontSize: 13, lineHeight: 19 },
  badge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 2,
  },
  badgeText: { fontSize: 12, fontWeight: '800' },
  endBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 6,
  },
  endBtnText: { fontSize: 13, fontWeight: '800' },
});
