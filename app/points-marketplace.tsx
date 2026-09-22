import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { OwnerSectionCard } from '@/components/owner/OwnerSectionCard';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { shopTypeLabel } from '@/lib/booking/format';
import {
  listEligibleMerchantLoyaltyEntries,
  MERCHANT_LOYALTY_REDEEM_POINTS_PER_EGP,
  type MerchantLoyaltyMarketplaceEntry,
} from '@/lib/booking/merchantLoyaltyRepository';
import { getShopExtras } from '@/lib/booking/shopExtrasStorage';

type MerchantCardProps = {
  entry: MerchantLoyaltyMarketplaceEntry;
  locale: 'en' | 'ar';
  onPress: () => void;
};

function MerchantLoyaltyCard({ entry, locale, onPress }: MerchantCardProps) {
  const { t } = useI18n();
  const theme = useAppTheme();
  const [avatarUri, setAvatarUri] = useState<string | undefined>(undefined);

  React.useEffect(() => {
    let active = true;
    getShopExtras(entry.shopId)
      .then((extras) => {
        if (!active) return;
        setAvatarUri(extras.profileImageUrl || extras.imageUrls?.[0]);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [entry.shopId]);

  const shopName = locale === 'ar' ? entry.shopNameAr : entry.shopName;
  const discountEgp = (entry.pointsBalance / MERCHANT_LOYALTY_REDEEM_POINTS_PER_EGP).toFixed(1);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${shopName}, ${entry.pointsBalance} ${t('loyalty_marketplace_points_balance_label')}`}
      style={({ pressed }) => [
        styles.merchantCard,
        {
          backgroundColor: theme.card,
          borderColor: theme.border,
        },
        pressed ? styles.merchantCardPressed : null,
      ]}>
      <View style={styles.merchantRow}>
        <View style={[styles.avatarWrap, { backgroundColor: theme.cardHover, borderColor: theme.border }]}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: theme.cardHover }]}>
              <Text style={[styles.avatarInitial, { color: theme.text }]}>{shopName.charAt(0).toUpperCase()}</Text>
            </View>
          )}
        </View>

        <View style={styles.merchantBody}>
          <Text style={[styles.shopName, { color: theme.text }]} numberOfLines={2}>
            {shopName}
          </Text>
          <Text style={[styles.shopType, { color: theme.textMuted }]}>{shopTypeLabel(entry.shopType, locale)}</Text>
        </View>

        <View style={styles.balanceCol}>
          <Text style={[styles.balanceValue, { color: theme.text }]}>{entry.pointsBalance}</Text>
          <Text style={[styles.balanceLabel, { color: theme.textMuted }]}>{t('loyalty_marketplace_points_balance_label')}</Text>
        </View>
      </View>

      <Text style={[styles.exchangeHint, { color: theme.textMuted }]}>{t('loyalty_marketplace_exchange_hint')}</Text>
      <Text style={[styles.discountHint, { color: theme.textMuted }]}>
        ≈ {discountEgp} EGP {locale === 'ar' ? 'خصم متاح' : 'discount available'}
      </Text>
      <Text style={[styles.tapHint, { color: theme.text }]}>{t('loyalty_marketplace_tap_to_book')}</Text>
    </Pressable>
  );
}

export default function PointsMarketplaceScreen() {
  const theme = useAppTheme();
  const { t, locale } = useI18n();
  const { customer, isGuest } = useCustomerAuth();
  const [entries, setEntries] = useState<MerchantLoyaltyMarketplaceEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshEntries = useCallback(async () => {
    if (!customer?.id) {
      setEntries([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const rows = await listEligibleMerchantLoyaltyEntries(customer.id);
      setEntries(rows);
    } catch (error) {
      console.warn('Points marketplace refresh failed:', error);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [customer?.id]);

  useFocusEffect(
    useCallback(() => {
      refreshEntries();
    }, [refreshEntries]),
  );

  function openShop(shopId: string) {
    router.push(`/shop-profile/${shopId}`);
  }

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: theme.bg }]}
      contentContainerStyle={styles.content}>
      <OwnerSectionCard
        theme={theme}
        title={t('loyalty_marketplace_per_shop_title')}
        subtitle={t('loyalty_marketplace_per_shop_lead')}>
        <Text style={[styles.introNote, { color: theme.text }]}>{t('loyalty_marketplace_exchange_hint')}</Text>
      </OwnerSectionCard>

      {isGuest || !customer ? (
        <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('loyalty_marketplace_sign_in')}</Text>
        </View>
      ) : loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={theme.warm} />
        </View>
      ) : entries.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('loyalty_marketplace_empty_points')}</Text>
        </View>
      ) : (
        entries.map((entry) => (
          <MerchantLoyaltyCard
            key={entry.shopId}
            entry={entry}
            locale={locale}
            onPress={() => openShop(entry.shopId)}
          />
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { width: '100%', maxWidth: 1024, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48, gap: 4 },
  introNote: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 24,
  },
  loadingWrap: { paddingVertical: 48, alignItems: 'center' },
  emptyCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 24,
    marginTop: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 28,
    textAlign: 'center',
  },
  merchantCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 18,
    marginBottom: 12,
  },
  merchantCardPressed: { opacity: 0.92, transform: [{ scale: 0.995 }] },
  merchantRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
  },
  avatar: { width: '100%', height: '100%' },
  avatarPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontSize: 22, fontWeight: '700' },
  merchantBody: { flex: 1, minWidth: 0 },
  shopName: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
  },
  shopType: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 4,
    lineHeight: 22,
  },
  balanceCol: { alignItems: 'flex-end', minWidth: 72 },
  balanceValue: {
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 32,
  },
  balanceLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
    textAlign: 'right',
  },
  exchangeHint: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 14,
    lineHeight: 22,
  },
  discountHint: {
    fontSize: 16,
    lineHeight: 22,
    marginTop: 4,
  },
  tapHint: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 10,
    lineHeight: 22,
  },
});
