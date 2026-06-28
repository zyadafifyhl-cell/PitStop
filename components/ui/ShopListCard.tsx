import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/context/ThemePreferenceContext';
import { useI18n } from '@/context/I18nContext';
import { getShopExtras } from '@/lib/booking/shopExtrasStorage';
import type { ShopExtras } from '@/lib/booking/types';
import { formatEgp } from '@/lib/booking/reporting';
import { getShopOpenStatus } from '@/lib/booking/shopSchedule';
import { formatPhoneDisplay, openPhone } from '@/lib/linking/contact';
import { WashBusyBadge } from '@/components/ui/WashBusyBadge';
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
  onViewDetails?: () => void;
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
  onViewDetails,
  onCall,
  onOpenMaps,
  onPress,
}: Props) {
  const theme = useAppTheme();
  const { locale, t } = useI18n();
  const accent = theme.accent;
  const [extras, setExtras] = useState<ShopExtras | null>(null);

  const refreshExtras = useCallback(async () => {
    const row = await getShopExtras(shopId);
    setExtras(row);
  }, [shopId]);

  useFocusEffect(
    useCallback(() => {
      refreshExtras();
    }, [refreshExtras]),
  );

  const activeOffers = (extras?.offers ?? []).filter((offer) => offer.active);
  const topOffer = activeOffers[0];
  const profileImage = extras?.profileImageUrl || extras?.imageUrls?.[0];
  const offerLabel = topOffer ? (locale === 'ar' ? (topOffer.titleAr || topOffer.title) : topOffer.title) : null;
  const resolvedName = locale === 'ar' ? extras?.profileNameAr || extras?.profileName || name : extras?.profileName || name;
  const resolvedAddress =
    locale === 'ar' ? extras?.profileAddressAr || extras?.profileAddress || address : extras?.profileAddress || address;
  const resolvedPhone = extras?.profilePhone || phone;
  const winchPhone = extras?.winchPhone?.trim() || resolvedPhone;
  const hasWinch = type === 'maintenance' && !!extras?.winchEnabled;
  const openStatus = getShopOpenStatus(extras);
  const openLabel = locale === 'ar' ? openStatus.labelAr : openStatus.labelEn;
  const showBusyBadge = type === 'wash' && extras?.washShopStatus === 'busy';

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
            {extras?.servicePriceEgp != null ? (
              <View style={[styles.priceChip, { backgroundColor: theme.accentSoft }]}>
                <Text style={[styles.priceChipText, { color: theme.accent }]}>{formatEgp(extras.servicePriceEgp, locale)}</Text>
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
        <View style={styles.identityRow}>
          {profileImage ? <Image source={{ uri: profileImage }} style={styles.avatar} contentFit="cover" /> : null}
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: theme.text }]}>{resolvedName}</Text>
            <Text style={[styles.address, { color: theme.textMuted }]}>{resolvedAddress}</Text>
            <Text
              style={[
                styles.openStatus,
                { color: openStatus.isOpen ? theme.green : theme.textDim },
              ]}>
              {openLabel}
            </Text>
            {showBusyBadge ? <WashBusyBadge /> : null}
          </View>
        </View>
        {extras?.servicePriceEgp != null ? (
          <Text style={[styles.priceMeta, { color: theme.accent }]}>{formatEgp(extras.servicePriceEgp, locale)}</Text>
        ) : null}
        {activeOffers.length > 0 ? (
          <Pressable
            onPress={() => router.push(`/shop-profile/${shopId}`)}
            style={styles.offersLink}>
            <Text style={[styles.offersLinkText, { color: theme.accent }]}>
              {t('shop_card_available_offers')} →
            </Text>
          </Pressable>
        ) : null}
        {offerLabel ? (
          <View style={[styles.offerChip, { backgroundColor: theme.accentSoft }]}>
            <Text style={[styles.offerChipText, { color: theme.accent }]}>{offerLabel}</Text>
          </View>
        ) : null}
        {hasWinch ? (
          <View style={[styles.offerChip, { backgroundColor: theme.accentSoft }]}>
            <Text style={[styles.offerChipText, { color: theme.accent }]}>{t('shop_profile_winch_available')}</Text>
          </View>
        ) : null}
        {extras?.imageUrls?.[0] ? (
          <View style={[styles.coverFrame, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
            <Image source={{ uri: extras.imageUrls[0] }} style={styles.coverImage} contentFit="contain" />
          </View>
        ) : null}

        {resolvedPhone ? (
          <Pressable
            onPress={() => {
              if (hasWinch && winchPhone) {
                openPhone(winchPhone).catch(() => {});
                return;
              }
              if (extras?.profilePhone) {
                openPhone(extras.profilePhone).catch(() => {});
                return;
              }
              onCall?.();
            }}
            style={[styles.phoneRow, { backgroundColor: theme.accentSoft }]}>
            <FontAwesome name="phone" size={14} color={theme.accent} />
            <Text style={[styles.phoneText, { color: theme.text }]}>
              {formatPhoneDisplay(hasWinch && winchPhone ? winchPhone : resolvedPhone)}
            </Text>
          </Pressable>
        ) : null}

        <View style={styles.footer}>
          <Pressable onPress={onViewDetails ?? onPress} style={styles.bookBtn}>
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
  priceChip: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  priceChipText: { fontSize: 11, fontWeight: '800' },
  iconBtn: { padding: 4 },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#111' },
  name: { fontSize: 20, fontWeight: '800', marginBottom: 6 },
  address: { fontSize: 14, lineHeight: 20 },
  openStatus: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  priceMeta: { fontSize: 13, fontWeight: '700', marginTop: 8 },
  offersLink: { marginTop: 8, alignSelf: 'flex-start' },
  offersLinkText: { fontSize: 14, fontWeight: '800' },
  offerChip: {
    marginTop: 8,
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  offerChipText: { fontSize: 12, fontWeight: '800' },
  coverFrame: {
    width: '100%',
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    padding: 8,
    overflow: 'hidden',
  },
  coverImage: {
    width: '100%',
    height: 190,
    borderRadius: 10,
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
