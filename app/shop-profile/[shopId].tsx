import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { WorkingHoursTable } from '@/components/ui/WorkingHoursTable';
import { ShopMediaImage } from '@/components/ui/ShopMediaImage';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { useI18n } from '@/context/I18nContext';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useShopCatalog } from '@/context/ShopCatalogContext';
import { getShopById } from '@/lib/booking/catalogRepository';
import { shopTypeLabel } from '@/lib/booking/format';
import { formatEgp } from '@/lib/booking/reporting';
import { applyCampaignPrice, formatOfferBadge, isOfferLive, pickBestLiveOffer, buildOfferBadgeMessages } from '@/lib/booking/offerPricing';
import { getCustomerShopReview, listShopReviews, computeShopRatingSummary, formatReviewStarRow } from '@/lib/booking/reviewsStorage';
import { isOrderHistoryReview } from '@/lib/booking/reviewConstants';
import { getShopExtras } from '@/lib/booking/shopExtrasStorage';
import { getActiveServices, getWeeklyHoursDisplayRows } from '@/lib/booking/shopSchedule';
import type { ShopExtras, ShopOffer, ShopReview } from '@/lib/booking/types';
import { fetchBranchProfile, fetchDefaultBranchCoordinates, fetchDefaultBranchProfile } from '@/lib/booking/wash/branchRepository';
import { syncWashBranchToShopExtras } from '@/lib/booking/wash/washSync';
import { resolveShopMedia } from '@/lib/media/shopImages';
import { WashStatusBadge, type WashCustomerStatus } from '@/components/ui/WashBusyBadge';
import { ShopReviewForm } from '@/components/reviews/ShopReviewForm';
import { formatPhoneDisplay, openBranchDirections, openPhone } from '@/lib/linking/contact';
import { shareShopProfile } from '@/lib/linking/share';
import { buildBookReturnTo } from '@/lib/auth/returnTo';

export default function ShopProfileScreen() {
  const { shopId, offerId: rawOfferId } = useLocalSearchParams<{ shopId: string; offerId?: string }>();
  const offerId = Array.isArray(rawOfferId) ? rawOfferId[0] : rawOfferId;
  const theme = useAppTheme();
  const { t, locale } = useI18n();
  const { isGuest, customer } = useCustomerAuth();
  const { ready: catalogReady, version: catalogVersion } = useShopCatalog();
  const [extras, setExtras] = useState<ShopExtras | null>(null);
  const [reviews, setReviews] = useState<ShopReview[]>([]);
  const [averageRating, setAverageRating] = useState<number | null>(null);
  const [reviewCount, setReviewCount] = useState(0);
  const [customerAlreadyReviewed, setCustomerAlreadyReviewed] = useState(false);
  const [customerReviewRating, setCustomerReviewRating] = useState(0);
  const [customerReviewFromOrders, setCustomerReviewFromOrders] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [branchCoords, setBranchCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  const shop = useMemo(
    () => (catalogReady && shopId ? getShopById(shopId) : undefined),
    [catalogReady, catalogVersion, shopId],
  );

  const refreshExtras = useCallback(async () => {
    if (!shop) return;
    let syncedBranchCoords: { latitude: number; longitude: number } | null = null;
    if (shop.type === 'wash') {
      const currentExtras = await getShopExtras(shop.id);
      const activeBranchId = currentExtras.activeBranchId?.trim();
      const branch = activeBranchId
        ? await fetchBranchProfile(shop.id, activeBranchId)
        : await fetchDefaultBranchProfile(shop.id);
      if (branch) {
        await syncWashBranchToShopExtras(shop.id, branch);
        if (branch.latitude != null && branch.longitude != null) {
          syncedBranchCoords = { latitude: branch.latitude, longitude: branch.longitude };
        }
      }
    }
    const [row, reviewRows, coords, customerReview] = await Promise.all([
      getShopExtras(shop.id),
      listShopReviews(shop.id),
      syncedBranchCoords ? Promise.resolve(syncedBranchCoords) : fetchDefaultBranchCoordinates(shop.id),
      customer?.id ? getCustomerShopReview(shop.id, customer.id) : Promise.resolve(null),
    ]);
    setExtras(row);
    setBranchCoords(coords);
    setCustomerAlreadyReviewed(!!customerReview);
    setCustomerReviewRating(customerReview?.rating ?? 0);
    setCustomerReviewFromOrders(customerReview ? isOrderHistoryReview(customerReview.body) : false);
    const visibleRemote = reviewRows.filter((review) => !review.hidden);
    const summary = computeShopRatingSummary(reviewRows);
    setAverageRating(summary.average);
    setReviewCount(summary.count);
    setReviews(visibleRemote);
  }, [shop, customer?.id]);

  useFocusEffect(
    useCallback(() => {
      refreshExtras();
    }, [refreshExtras]),
  );

  const offerBadgeMessages = useMemo(() => buildOfferBadgeMessages(t), [t]);

  if (!shop) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <Text style={{ color: theme.text }}>{t('book_shop_not_found')}</Text>
      </View>
    );
  }

  const shopName =
    locale === 'ar'
      ? extras?.profileNameAr || extras?.profileName || shop.nameAr
      : extras?.profileName || shop.name;
  const address =
    locale === 'ar'
      ? extras?.profileAddressAr || extras?.profileAddress || shop.addressAr
      : extras?.profileAddress || shop.address;
  const phone = extras?.profilePhone || shop.phone;
  const hasWinch =
    (shop.type === 'maintenance' || shop.type === 'winch') && !!extras?.winchEnabled;
  const winchPhone = extras?.winchPhone || phone;
  const email = extras?.profileEmail;
  const { profileImage, coverImage, galleryImages } = resolveShopMedia(extras);
  const offers = (extras?.offers ?? []).filter((offer) => isOfferLive(offer));
  const pricingOffer = offerId
    ? offers.find((offer) => offer.id === offerId && isOfferLive(offer))
    : pickBestLiveOffer(offers);
  const services = getActiveServices(extras);
  const hoursRows = getWeeklyHoursDisplayRows(extras, locale);
  const visibleReviews = reviews;
  const washStatusBadge: WashCustomerStatus | null =
    shop.type === 'wash' &&
    (extras?.washShopStatus === 'busy' ||
      extras?.washShopStatus === 'closed' ||
      extras?.washShopStatus === 'vacation')
      ? extras.washShopStatus
      : null;

  function openViewer(uri?: string) {
    if (!uri) return;
    setViewerUri(uri);
    setViewerOpen(true);
  }

  function goToBook(serviceId?: string) {
    const id = String(shopId);
    if (isGuest || !customer) {
      router.push({
        pathname: '/auth-required',
        params: {
          intent: 'booking',
          returnTo: buildBookReturnTo(id, serviceId ? [serviceId] : undefined),
        },
      });
      return;
    }
    router.push({
      pathname: '/book/[shopId]',
      params: {
        shopId: id,
        ...(serviceId ? { serviceIds: serviceId } : {}),
      },
    });
  }

  function renderOfferPrice(basePrice: number) {
    if (!pricingOffer) {
      return (
        <Text style={[styles.serviceMeta, { color: theme.textMuted }]}>
          {formatEgp(basePrice, locale)}
        </Text>
      );
    }
    const discounted = applyCampaignPrice(basePrice, pricingOffer, 0);
    if (discounted >= basePrice) {
      return (
        <Text style={[styles.serviceMeta, { color: theme.textMuted }]}>
          {formatEgp(basePrice, locale)}
        </Text>
      );
    }
    return (
      <View style={styles.offerPriceRow}>
        <Text style={[styles.serviceMeta, styles.strikePrice, { color: theme.textDim }]}>
          {formatEgp(basePrice, locale)}
        </Text>
        <Text style={[styles.serviceMeta, { color: theme.danger, fontWeight: '900' }]}>
          {formatEgp(discounted, locale)}
        </Text>
      </View>
    );
  }

  async function onShare() {
    if (!shop) return;
    try {
      await shareShopProfile({ shopId: shop.id, shopName, locale });
    } catch {
      Alert.alert(t('settings_link_fail_title'), t('settings_link_fail_body'));
    }
  }

  async function onDirections() {
    if (!shop) return;
    try {
      const lat = branchCoords?.latitude ?? shop.latitude;
      const lng = branchCoords?.longitude ?? shop.longitude;
      await openBranchDirections(lat, lng, shopName);
    } catch {
      Alert.alert(t('settings_link_fail_title'), t('settings_link_fail_body'));
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={styles.content}>
      <View style={[styles.heroCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Pressable onPress={() => openViewer(coverImage || profileImage)} disabled={!coverImage && !profileImage}>
          <ShopMediaImage uri={coverImage} style={styles.coverImage} fallbackIcon="photo" fallbackIconSize={28} />
        </Pressable>
        <View style={styles.profileRow}>
          <Pressable onPress={() => openViewer(profileImage || coverImage)} disabled={!profileImage && !coverImage}>
            <ShopMediaImage
              uri={profileImage}
              style={[styles.profileImage, { borderColor: theme.card }]}
              fallbackIcon="building"
              fallbackIconSize={26}
            />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: theme.text }]}>{shopName}</Text>
            <Text style={[styles.meta, { color: theme.textMuted }]}>
              {shopTypeLabel(shop.type, locale)} · {address}
            </Text>
            {averageRating != null ? (
              <Text style={[styles.meta, { color: theme.textMuted }]}>
                ★ {averageRating.toFixed(1)}
                {reviewCount ? ` (${reviewCount})` : ''}
              </Text>
            ) : (
              <Text style={[styles.meta, { color: theme.textDim }]}>{t('shop_rating_none')}</Text>
            )}
          </View>
        </View>

        {washStatusBadge ? (
          <WashStatusBadge status={washStatusBadge} vacationReturnDate={extras?.vacationReturnDate} />
        ) : null}

        {pricingOffer ? (
          <View style={[styles.promoBanner, { backgroundColor: theme.warmSoft, borderColor: theme.warm }]}>
            <Text style={[styles.promoBannerBadge, { color: theme.warm }]}>
              {formatOfferBadge(pricingOffer, offerBadgeMessages)}
            </Text>
            <Text style={[styles.promoBannerTitle, { color: theme.text }]}>
              {locale === 'ar' ? pricingOffer.titleAr || pricingOffer.title : pricingOffer.title}
            </Text>
            {pricingOffer.description ? (
              <Text style={[styles.promoBannerBody, { color: theme.textMuted }]}>{pricingOffer.description}</Text>
            ) : null}
          </View>
        ) : null}

        <View style={styles.actionRow}>
          <Pressable onPress={() => openPhone(phone).catch(() => {})} style={[styles.secondaryBtn, { borderColor: theme.border }]}>
            <Text style={[styles.secondaryBtnText, { color: theme.text }]}>{t('shop_profile_call_now')}</Text>
          </Pressable>
          <Pressable onPress={onDirections} style={[styles.secondaryBtn, { borderColor: theme.border }]}>
            <Text style={[styles.secondaryBtnText, { color: theme.text }]}>{t('shop_profile_directions')}</Text>
          </Pressable>
          <Pressable onPress={onShare} style={[styles.secondaryBtn, { borderColor: theme.border }]}>
            <Text style={[styles.secondaryBtnText, { color: theme.text }]}>{t('shop_profile_share')}</Text>
          </Pressable>
        </View>
      </View>

      <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('shop_profile_services')}</Text>
        {services.length === 0 ? (
          <Text style={[styles.serviceMeta, { color: theme.textMuted }]}>
            {t('wash_services_empty')}
          </Text>
        ) : (
          services.map((service) => {
          const label = locale === 'ar' ? service.nameAr || service.name : service.name;
          return (
            <View key={service.id} style={[styles.serviceRow, { borderColor: theme.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.serviceName, { color: theme.text }]}>{label}</Text>
                {renderOfferPrice(service.priceEgp)}
                <Text style={[styles.serviceMeta, { color: theme.textMuted }]}>
                  {service.durationMinutes} {locale === 'ar' ? 'دقيقة' : 'min'}
                </Text>
              </View>
              <Pressable
                onPress={() => goToBook(service.id)}
                style={[styles.serviceBookBtn, { backgroundColor: theme.accentSoft }]}>
                <Text style={[styles.serviceBookText, { color: theme.accent }]}>{t('shop_profile_book_service')}</Text>
              </Pressable>
            </View>
          );
        })
        )}
      </View>

      <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('shop_profile_working_hours')}</Text>
        <WorkingHoursTable rows={hoursRows} />
      </View>

      <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('shop_profile_reviews')}</Text>
        <ShopReviewForm
          shopId={shop.id}
          alreadyRated={customerAlreadyReviewed}
          savedRating={customerReviewRating}
          ratedFromOrders={customerReviewFromOrders}
          onSubmitted={() => {
            setCustomerAlreadyReviewed(true);
            refreshExtras();
          }}
        />
        {reviews.map((review) => (
          <View key={review.id} style={[styles.reviewRow, { borderColor: theme.border }]}>
            <View style={styles.reviewHeader}>
              <Text style={[styles.reviewName, { color: theme.text }]}>{review.customerName}</Text>
              <Text style={[styles.reviewRating, { color: theme.accent }]}>{formatReviewStarRow(review.rating)}</Text>
            </View>
            <Text style={[styles.reviewBody, { color: theme.textMuted }]}>{review.body}</Text>
            {review.ownerReply ? (
              <View style={[styles.reviewReplyBox, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
                <Text style={[styles.reviewReplyLabel, { color: theme.text }]}>
                  {shopName} · {t('shop_review_owner_reply_label')}
                </Text>
                <Text style={[styles.reviewReply, { color: theme.textMuted }]}>{review.ownerReply}</Text>
              </View>
            ) : null}
          </View>
        ))}
      </View>

      <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('shop_profile_contact')}</Text>
        <View style={styles.actionRow}>
          <Pressable onPress={() => openPhone(phone).catch(() => {})} style={[styles.secondaryBtn, { borderColor: theme.border }]}>
            <Text style={[styles.secondaryBtnText, { color: theme.text }]}>
              {t('book_call_shop')} · {formatPhoneDisplay(phone)}
            </Text>
          </Pressable>
          <Pressable onPress={onDirections} style={[styles.secondaryBtn, { borderColor: theme.border }]}>
            <Text style={[styles.secondaryBtnText, { color: theme.text }]}>{t('book_open_maps')}</Text>
          </Pressable>
        </View>
      </View>

      {galleryImages.length ? (
        <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('shop_profile_album')}</Text>
          <View style={styles.albumGrid}>
            {galleryImages.map((uri) => (
              <Pressable key={uri} onPress={() => openViewer(uri)}>
                <ShopMediaImage uri={uri} style={styles.albumImage} fallbackIcon="photo" />
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('shop_profile_more_info')}</Text>
        <Text style={[styles.infoLine, { color: theme.textMuted }]}>
          {t('shop_profile_phone')}: {formatPhoneDisplay(phone)}
        </Text>
        {hasWinch ? (
          <Text style={[styles.infoLine, { color: theme.textMuted }]}>
            {t('shop_profile_winch_available')}: {formatPhoneDisplay(winchPhone)}
          </Text>
        ) : null}
        {email ? (
          <Text style={[styles.infoLine, { color: theme.textMuted }]}>
            {t('shop_profile_email')}: {email}
          </Text>
        ) : null}
        <Text style={[styles.infoLine, { color: theme.textMuted }]}>
          {t('shop_profile_address')}: {address}
        </Text>
        {extras?.servicePriceEgp != null && shop.type !== 'wash' ? (
          <Text style={[styles.infoLine, { color: theme.textMuted }]}>
            {t('shop_profile_price')}: {formatEgp(extras.servicePriceEgp, locale)}
          </Text>
        ) : null}
        {(() => {
          const moreInfoText =
            locale === 'ar'
              ? extras?.moreInfoAr || extras?.moreInfo
              : extras?.moreInfo || extras?.moreInfoAr;
          return moreInfoText ? (
            <Text style={[styles.infoLine, { color: theme.text, marginTop: 8 }]}>{moreInfoText}</Text>
          ) : null;
        })()}
        {offers.length ? (
          <View style={{ marginTop: 8, gap: 8 }}>
            <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>{t('shop_profile_offers')}</Text>
            {offers.map((offer) => {
              const label = locale === 'ar' ? offer.titleAr || offer.title : offer.title;
              const focused = offerId === offer.id;
              return (
                <View
                  key={offer.id}
                  style={[
                    styles.offerCard,
                    {
                      backgroundColor: focused ? theme.accentSoft : theme.bgElevated,
                      borderColor: focused ? theme.accent : theme.border,
                    },
                  ]}>
                  <Text style={[styles.offerBadgeLine, { color: theme.warm }]}>
                    {formatOfferBadge(offer, offerBadgeMessages)}
                  </Text>
                  <Text style={[styles.offerText, { color: theme.text }]}>{label}</Text>
                  <Text style={[styles.infoLine, { color: theme.textMuted, marginTop: 4 }]}>
                    {t('shop_offer_valid_until').replace(
                      '{date}',
                      new Date(offer.endDate || offer.validUntil).toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-EG'),
                    )}
                  </Text>
                  <Pressable
                    onPress={() => goToBook(services[0]?.id)}
                    style={[styles.serviceBookBtn, { backgroundColor: theme.accent, marginTop: 8, alignSelf: 'flex-start' }]}>
                    <Text style={[styles.serviceBookText, { color: theme.onAccent }]}>{t('shop_offer_book')}</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : null}
      </View>

      <Modal visible={viewerOpen} transparent animationType="fade" onRequestClose={() => setViewerOpen(false)}>
        <View style={styles.viewerBackdrop}>
          <Pressable style={styles.viewerBackdrop} onPress={() => setViewerOpen(false)}>
            {viewerUri ? <ShopMediaImage uri={viewerUri} style={styles.viewerImage} contentFit="contain" /> : null}
          </Pressable>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 32, gap: 12 },
  heroCard: { borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  coverImage: { width: '100%', height: 170 },
  profileRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 12, paddingBottom: 12, alignItems: 'center', marginTop: -36 },
  profileImage: { width: 90, height: 90, borderRadius: 45, borderWidth: 3 },
  title: { fontSize: 22, fontWeight: '800' },
  meta: { marginTop: 4, fontSize: 13, lineHeight: 18 },
  promoBanner: {
    marginHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 6,
  },
  promoBannerBadge: { fontSize: 13, fontWeight: '900' },
  promoBannerTitle: { fontSize: 16, fontWeight: '800' },
  promoBannerBody: { fontSize: 13, lineHeight: 19 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, paddingBottom: 12 },
  primaryBtn: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  primaryBtnText: { fontSize: 14, fontWeight: '800' },
  secondaryBtn: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  secondaryBtnText: { fontSize: 13, fontWeight: '700' },
  sectionCard: { borderWidth: 1, borderRadius: 18, padding: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 8 },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  serviceName: { fontSize: 15, fontWeight: '800' },
  serviceMeta: { fontSize: 13, marginTop: 2 },
  serviceBookBtn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  serviceBookText: { fontSize: 13, fontWeight: '800' },
  reviewRow: { borderBottomWidth: 1, paddingVertical: 10, marginBottom: 4 },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  reviewName: { fontSize: 14, fontWeight: '800' },
  reviewRating: { fontSize: 12, fontWeight: '700' },
  reviewBody: { fontSize: 14, lineHeight: 20 },
  reviewReplyBox: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
  },
  reviewReplyLabel: { fontSize: 12, fontWeight: '800' },
  reviewReply: { fontSize: 13, lineHeight: 18 },
  albumGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  albumImage: { width: 102, height: 102, borderRadius: 10 },
  infoLine: { fontSize: 14, lineHeight: 20 },
  offerChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start' },
  offerCard: { borderWidth: 1, borderRadius: 12, padding: 12 },
  offerBadgeLine: { fontSize: 12, fontWeight: '900', marginBottom: 4 },
  offerText: { fontSize: 12, fontWeight: '700' },
  offerPriceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  strikePrice: { textDecorationLine: 'line-through' },
  viewerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.86)', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '92%', height: '78%' },
});
