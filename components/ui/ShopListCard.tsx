import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/context/ThemePreferenceContext';
import { useI18n } from '@/context/I18nContext';
import { getShopExtras } from '@/lib/booking/shopExtrasStorage';
import type { ShopExtras } from '@/lib/booking/types';
import { formatEgp } from '@/lib/booking/reporting';
import { formatPhoneDisplay } from '@/lib/linking/contact';
import type { ShopType } from '@/lib/booking/types';

type Props = {
  shopId: string;
  name: string;
  address: string;
  type: ShopType;
  typeLabel: string;
  rating?: number;
  phone?: string;
  distanceLabel?: string;
  bookLabel: string;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  onCall?: () => void;
  onOpenMaps?: () => void;
  onPress: () => void;
};

export function ShopListCard({
  shopId,
  name,
  address,
  type,
  typeLabel,
  rating,
  phone,
  distanceLabel,
  bookLabel,
  isFavorite,
  onToggleFavorite,
  onCall,
  onOpenMaps,
  onPress,
}: Props) {
  const theme = useAppTheme();
  const { locale, t } = useI18n();
  const accent = theme.accent;
  const [extras, setExtras] = useState<ShopExtras | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const row = await getShopExtras(shopId);
      if (!cancelled) setExtras(row);
    })();
    return () => {
      cancelled = true;
    };
  }, [shopId]);

  const topOffer = extras?.offers?.[0];
  const offerLabel = topOffer ? (locale === 'ar' ? (topOffer.titleAr || topOffer.title) : topOffer.title) : null;

  return (
    <View style={styles.wrap}>
      <LinearGradient
        colors={[theme.bgElevated, theme.card]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, { borderColor: theme.border }]}>
        <View style={styles.topRow}>
          <View style={[styles.badge, { backgroundColor: theme.accentSoft }]}>
            <Text style={[styles.badgeText, { color: accent }]}>{typeLabel}</Text>
          </View>
          <View style={styles.topRight}>
            {distanceLabel ? <Text style={[styles.distance, { color: theme.accent }]}>{distanceLabel}</Text> : null}
            {rating != null ? (
              <View style={styles.rating}>
                <FontAwesome name="star" size={12} color={theme.text} />
                <Text style={[styles.ratingText, { color: theme.text }]}>{rating.toFixed(1)}</Text>
              </View>
            ) : null}
            {onToggleFavorite ? (
              <Pressable onPress={onToggleFavorite} hitSlop={8} style={styles.iconBtn}>
                <FontAwesome
                  name={isFavorite ? 'heart' : 'heart-o'}
                  size={20}
                  color={isFavorite ? theme.danger : theme.textDim}
                />
              </Pressable>
            ) : null}
          </View>
        </View>
        <Text style={[styles.name, { color: theme.text }]}>{name}</Text>
        <Text style={[styles.address, { color: theme.textMuted }]}>{address}</Text>
        {extras?.servicePriceEgp != null ? (
          <Text style={[styles.priceMeta, { color: theme.accent }]}>
            {t('shop_card_price_from')}: {formatEgp(extras.servicePriceEgp, locale)}
          </Text>
        ) : null}
        {offerLabel ? (
          <View style={[styles.offerChip, { backgroundColor: theme.accentSoft }]}>
            <Text style={[styles.offerChipText, { color: theme.accent }]}>{offerLabel}</Text>
          </View>
        ) : null}
        {extras?.imageUrls?.[0] ? (
          <Image source={{ uri: extras.imageUrls[0] }} style={styles.coverImage} />
        ) : null}

        {phone && onCall ? (
          <Pressable onPress={onCall} style={[styles.phoneRow, { backgroundColor: theme.accentSoft }]}>
            <FontAwesome name="phone" size={14} color={theme.accent} />
            <Text style={[styles.phoneText, { color: theme.text }]}>{formatPhoneDisplay(phone)}</Text>
          </Pressable>
        ) : null}

        <View style={styles.footer}>
          <Pressable onPress={onPress} style={styles.bookBtn}>
            <Text style={[styles.book, { color: accent }]}>{bookLabel}</Text>
          </Pressable>
          <View style={styles.footerIcons}>
            {onOpenMaps ? (
              <Pressable onPress={onOpenMaps} hitSlop={8} style={styles.iconBtn}>
                <FontAwesome name="map-marker" size={18} color={accent} />
              </Pressable>
            ) : null}
            <Pressable onPress={onPress} hitSlop={8}>
              <FontAwesome name="arrow-circle-right" size={18} color={accent} />
            </Pressable>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  distance: { fontSize: 12, fontWeight: '700' },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingText: { fontSize: 13, fontWeight: '600' },
  iconBtn: { padding: 4 },
  name: { fontSize: 20, fontWeight: '800', marginBottom: 6 },
  address: { fontSize: 14, lineHeight: 20 },
  priceMeta: { fontSize: 13, fontWeight: '700', marginTop: 8 },
  offerChip: {
    marginTop: 8,
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  offerChipText: { fontSize: 12, fontWeight: '800' },
  coverImage: {
    width: '100%',
    height: 130,
    borderRadius: 10,
    marginTop: 10,
    backgroundColor: '#111',
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  phoneText: { fontSize: 15, fontWeight: '700' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  bookBtn: { flex: 1 },
  footerIcons: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  book: { fontSize: 15, fontWeight: '700' },
});
