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
import { formatPhoneDisplay, openMapsAtCoordinates, openPhone } from '@/lib/linking/contact';
import { WashStatusBadge, type WashCustomerStatus } from '@/components/ui/WashBusyBadge';
import type { ShopType } from '@/lib/booking/types';

type Props = {
  shopId: string;
  name: string;
  address: string;
  type: ShopType;
  typeLabel: string;
  /** @deprecated Use averageRating from live shop_reviews instead. */
  rating?: number;
  averageRating?: number | null;
  reviewCount?: number;
  latitude?: number | null;
  longitude?: number | null;
  phone?: string;
  distanceLabel?: string;
  bookLabel: string;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  onCall?: () => void;
  onOpenMaps?: () => void;
  onPress: () => void;
  hasActiveOffer?: boolean;
  offerDiscountPercent?: number;
};

export function ShopListCard({
  shopId,
  name,
  address,
  type,
  typeLabel,
  averageRating,
  reviewCount,
  latitude,
  longitude,
  phone,
  distanceLabel,
  bookLabel,
  isFavorite,
  onToggleFavorite,
  onCall,
  onOpenMaps,
  onPress,
  hasActiveOffer = false,
  offerDiscountPercent = 0,
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
  const profileImage = extras?.profileImageUrl;
  const coverImage = extras?.imageUrls?.[0];
  const offerLabel = topOffer ? (locale === 'ar' ? (topOffer.titleAr || topOffer.title) : topOffer.title) : null;
  const resolvedName = locale === 'ar' ? extras?.profileNameAr || extras?.profileName || name : extras?.profileName || name;
  const resolvedAddress =
    locale === 'ar' ? extras?.profileAddressAr || extras?.profileAddress || address : extras?.profileAddress || address;
  const resolvedPhone = extras?.profilePhone || phone;
  const winchPhone = extras?.winchPhone?.trim() || resolvedPhone;
  const hasWinch = type === 'maintenance' && !!extras?.winchEnabled;
  const openStatus = getShopOpenStatus(extras);
  const openLabel = locale === 'ar' ? openStatus.labelAr : openStatus.labelEn;
  const washStatusBadge: WashCustomerStatus | null =
    type === 'wash' &&
    (extras?.washShopStatus === 'busy' ||
      extras?.washShopStatus === 'closed' ||
      extras?.washShopStatus === 'vacation')
      ? extras.washShopStatus
      : null;

  const mapLat = latitude ?? null;
  const mapLng = longitude ?? null;

  function handleOpenMaps() {
    if (mapLat != null && mapLng != null && Number.isFinite(mapLat) && Number.isFinite(mapLng)) {
      openMapsAtCoordinates(mapLat, mapLng, resolvedName).catch(() => onOpenMaps?.());
      return;
    }
    onOpenMaps?.();
  }

  return (
    <View style={styles.wrap}>
      <LinearGradient
        colors={[theme.bgElevated, theme.card]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, { borderColor: theme.border }]}>
        <View style={styles.topRow}>
          <View style={styles.topLeft}>
            <View style={[styles.badge, { backgroundColor: theme.accentSoft }]}>
              <Text style={[styles.badgeText, { color: accent }]}>{typeLabel}</Text>
            </View>
            {hasActiveOffer ? (
              <View style={[styles.offerBadge, { backgroundColor: theme.dangerSoft, borderColor: theme.danger }]}>
                <Text style={[styles.offerBadgeText, { color: theme.danger }]}>
                  {offerDiscountPercent > 0
                    ? t('offer_active_badge_pct').replace('{pct}', String(Math.round(offerDiscountPercent)))
                    : t('offer_active_badge')}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={styles.topRight}>
            {distanceLabel ? (
              <View style={styles.distanceRow}>
                <FontAwesome name="map-marker" size={12} color={theme.warm} />
                <Text style={[styles.distance, { color: theme.warm }]}>{distanceLabel}</Text>
              </View>
            ) : null}
            {averageRating != null ? (
              <View style={styles.rating}>
                <FontAwesome name="star" size={12} color={theme.text} />
                <Text style={[styles.ratingText, { color: theme.text }]}>
                  {averageRating.toFixed(1)}
                  {reviewCount ? ` (${reviewCount})` : ''}
                </Text>
              </View>
            ) : (
              <Text style={[styles.ratingPlaceholder, { color: theme.textDim }]}>{t('shop_rating_none')}</Text>
            )}
            {extras?.servicePriceEgp != null && type !== 'wash' ? (
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
            {washStatusBadge ? (
              <WashStatusBadge
                status={washStatusBadge}
                compact
                vacationReturnDate={extras?.vacationReturnDate}
              />
            ) : null}
          </View>
        </View>
        {extras?.servicePriceEgp != null && type !== 'wash' ? (
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
        {coverImage ? (
          <View style={[styles.coverFrame, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
            <Image source={{ uri: coverImage }} style={styles.coverImage} contentFit="cover" />
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
          <Pressable onPress={onPress} style={[styles.bookBtn, { backgroundColor: theme.accent }]}>
            <Text style={[styles.book, { color: theme.onAccent }]}>{bookLabel}</Text>
          </Pressable>
          {(onOpenMaps || (mapLat != null && mapLng != null)) ? (
            <Pressable onPress={handleOpenMaps} hitSlop={8} style={styles.iconBtn} accessibilityLabel={t('book_open_maps')}>
              <FontAwesome name="map-marker" size={18} color={accent} />
            </Pressable>
          ) : null}
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1, flexWrap: 'wrap', justifyContent: 'flex-end' },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  distanceRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  distance: { fontSize: 12, fontWeight: '800' },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingText: { fontSize: 13, fontWeight: '600' },
  ratingPlaceholder: { fontSize: 11, fontWeight: '600' },
  priceChip: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  priceChipText: { fontSize: 11, fontWeight: '800' },
  iconBtn: { padding: 4 },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#111' },
  name: { fontSize: 20, fontWeight: '800', marginBottom: 6 },
  offerBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
  },
  offerBadgeText: { fontSize: 11, fontWeight: '800' },
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
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  coverImage: {
    width: '100%',
    height: 190,
    borderRadius: 18,
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
    gap: 10,
  },
  bookBtn: {
    flex: 1,
    borderRadius: 28,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  book: { fontSize: 15, fontWeight: '800' },
});
