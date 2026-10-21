import FontAwesome from '@expo/vector-icons/FontAwesome';
import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BRAND_COBALT } from '@/constants/Brand';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import type { ShopOffer, ShopType } from '@/lib/booking/types';

const KOHLY = BRAND_COBALT;
const WHITE = '#FFFFFF';
const CARD_WIDTH = 304;

export type CompactOfferItem = {
  shopId: string;
  shopName: string;
  shopArea: string;
  shopType: ShopType;
  offer: ShopOffer;
};

type Props = {
  title: string;
  emptyLabel: string;
  items: CompactOfferItem[];
  rtl?: boolean;
  badgeFor: (offer: ShopOffer) => string;
  titleFor: (offer: ShopOffer) => string;
  onPressOffer: (item: CompactOfferItem) => void;
};

export function CompactOffersCarousel({
  title,
  emptyLabel,
  items,
  rtl = false,
  badgeFor,
  titleFor,
  onPressOffer,
}: Props) {
  const theme = useAppTheme();

  return (
    <View style={styles.wrap}>
      <Text style={[styles.heading, { color: theme.text }, rtl && styles.textRtl]}>{title}</Text>
      {items.length === 0 ? (
        <Text style={[styles.empty, { color: theme.textMuted }, rtl && styles.textRtl]}>{emptyLabel}</Text>
      ) : (
        <ScrollView
          horizontal
          nestedScrollEnabled
          snapToInterval={CARD_WIDTH + 10}
          decelerationRate="fast"
          disableIntervalMomentum
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.track, rtl && styles.trackRtl]}
          style={styles.scroller}>
          {items.map((item) => (
            <Pressable
              key={item.offer.id}
              onPress={() => onPressOffer(item)}
              style={({ pressed, hovered }) => [styles.card, (pressed || hovered) && styles.cardActive]}>
              <View style={styles.badge}>
                <Text style={styles.badgeText} numberOfLines={2}>
                  {badgeFor(item.offer)}
                </Text>
              </View>
              <View style={styles.copy}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {titleFor(item.offer)}
                </Text>
                <Text style={styles.shop} numberOfLines={1}>
                  {item.shopName} — {item.shopArea}
                </Text>
              </View>
              <View style={styles.arrow}>
                <FontAwesome name={rtl ? 'chevron-left' : 'chevron-right'} size={11} color={KOHLY} />
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    marginBottom: 12,
  },
  heading: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
    marginBottom: 8,
  },
  empty: {
    fontSize: 13,
    lineHeight: 18,
  },
  textRtl: {
    textAlign: 'right',
  },
  scroller: {
    marginHorizontal: -4,
    ...(Platform.OS === 'web'
      ? ({ scrollbarWidth: 'none', msOverflowStyle: 'none' } as object)
      : null),
  },
  track: {
    gap: 10,
    paddingHorizontal: 4,
    paddingBottom: 2,
  },
  trackRtl: {
    flexDirection: 'row-reverse',
  },
  card: {
    width: CARD_WIDTH,
    height: 90,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: KOHLY,
    borderWidth: 1,
    borderColor: KOHLY,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
  },
  cardActive: {
    borderColor: WHITE,
    ...(Platform.OS === 'web' ? { boxShadow: '0 0 12px rgba(0, 37, 92, 0.35)' } : null),
  },
  badge: {
    maxWidth: 92,
    minWidth: 78,
    backgroundColor: WHITE,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: KOHLY,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  shop: {
    color: WHITE,
    fontSize: 11,
    fontWeight: '600',
  },
  arrow: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: WHITE,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
