import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { StarRatingSelector } from '@/components/reviews/StarRatingSelector';
import type { AppThemeTokens } from '@/constants/Theme';
import type { Locale, TranslationKey } from '@/lib/i18n/strings';
import {
  formatBookingIdLabel,
  formatOrderCardDateTime,
  orderStatusLabel,
  orderTotalLabel,
  resolveShopDisplayName,
  serviceIconName,
} from '@/lib/booking/customerOrderPresentation';
import { getShopById } from '@/lib/booking/catalogRepository';
import type { Booking } from '@/lib/booking/types';

const RATING_DIVIDER = 'rgba(255,255,255,0.05)';

type Props = {
  booking: Booking;
  locale: Locale;
  theme: AppThemeTokens;
  t: (key: TranslationKey) => string;
  alreadyRated: boolean;
  savedRating?: number;
  ratingBusy: boolean;
  onViewDetails: () => void;
  onBookAgain: () => void;
  onRate: (rating: number) => void;
};

export function OrderListCard({
  booking,
  locale,
  theme,
  t,
  alreadyRated,
  savedRating = 0,
  ratingBusy,
  onViewDetails,
  onBookAgain,
  onRate,
}: Props) {
  const shop = getShopById(booking.shopId);
  const shopName = resolveShopDisplayName(shop, booking.shopId, locale);
  const showRatingFooter = booking.status === 'done';
  const [selectedRating, setSelectedRating] = useState(savedRating);

  useEffect(() => {
    if (savedRating > 0) setSelectedRating(savedRating);
  }, [savedRating]);

  const displayRating = alreadyRated ? savedRating || selectedRating : selectedRating;

  function onPressStar(ratingValue: number) {
    if (alreadyRated || ratingBusy) return;
    setSelectedRating(ratingValue);
    onRate(ratingValue);
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.cardBody}>
        <View style={styles.topRow}>
          <Text style={[styles.statusText, { color: theme.textMuted }]}>
            {orderStatusLabel(booking.status, locale)}
          </Text>
          <Text style={[styles.dateText, { color: theme.textMuted }]}>
            {formatOrderCardDateTime(booking.scheduledAt, locale)}
          </Text>
        </View>

        <View style={styles.contentRow}>
          <View style={[styles.serviceIcon, { backgroundColor: theme.accentSoft }]}>
            <FontAwesome name={serviceIconName(booking.shopType)} size={20} color={theme.warm} />
          </View>
          <View style={styles.contentMeta}>
            <Text style={[styles.shopName, { color: theme.text }]} numberOfLines={2}>
              {shopName}
            </Text>
            <Text style={[styles.bookingId, { color: theme.textMuted }]}>
              {formatBookingIdLabel(booking.id, locale)}
            </Text>
          </View>
        </View>

        <View style={styles.actionRow}>
          <View style={styles.priceBlock}>
            <Text style={[styles.totalPrice, { color: theme.text }]}>{orderTotalLabel(booking, locale)}</Text>
            <Pressable onPress={onViewDetails} accessibilityRole="link">
              <Text style={[styles.viewDetails, { color: theme.accent }]}>{t('orders_view_details')}</Text>
            </Pressable>
          </View>
          <Pressable
            onPress={onBookAgain}
            style={[styles.bookAgainBtn, { borderColor: theme.text }]}
            accessibilityRole="button">
            <Text style={[styles.bookAgainText, { color: theme.text }]}>{t('orders_book_again')}</Text>
          </Pressable>
        </View>
      </View>

      {showRatingFooter ? (
        <View style={[styles.rateFooter, { borderTopColor: RATING_DIVIDER }]}>
          <Text style={[styles.rateLabel, { color: theme.textMuted }]}>{t('orders_rate')}</Text>
          {ratingBusy ? (
            <ActivityIndicator color={theme.warm} />
          ) : (
            <StarRatingSelector
              value={displayRating}
              onChange={onPressStar}
              size={32}
              gap={6}
              filledColor={theme.warm}
              emptyColor={theme.textDim}
              disabled={alreadyRated}
            />
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 20,
    marginBottom: 14,
    overflow: 'hidden',
  },
  cardBody: {
    padding: 16,
    gap: 14,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  statusText: { fontSize: 15, fontWeight: '700' },
  dateText: { fontSize: 15, fontWeight: '600' },
  contentRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  serviceIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentMeta: { flex: 1, gap: 4 },
  shopName: { fontSize: 19, fontWeight: '900', lineHeight: 24 },
  bookingId: { fontSize: 15, fontWeight: '600', lineHeight: 20 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  priceBlock: { flex: 1, gap: 6 },
  totalPrice: { fontSize: 20, fontWeight: '900', lineHeight: 26 },
  viewDetails: { fontSize: 15, fontWeight: '800' },
  bookAgainBtn: {
    minWidth: 132,
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookAgainText: { fontSize: 15, fontWeight: '900' },
  rateFooter: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rateLabel: { fontSize: 16, fontWeight: '800', flexShrink: 0 },
});
