import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ShopProfileLoadingScreen } from '@/components/shop/ShopProfileLoadingScreen';
import { ShopProfileStoreSection } from '@/components/shop/ShopProfileStoreSection';
import { WorkingHoursTable } from '@/components/ui/WorkingHoursTable';
import { ShopMediaImage } from '@/components/ui/ShopMediaImage';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { useI18n } from '@/context/I18nContext';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { shopTypeLabel } from '@/lib/booking/format';
import { formatEgp } from '@/lib/booking/reporting';
import { applyCampaignPrice, formatOfferBadge, isOfferLive, pickBestLiveOffer, buildOfferBadgeMessages } from '@/lib/booking/offerPricing';
import { isOrderHistoryReview } from '@/lib/booking/reviewConstants';
import { formatReviewStarRow } from '@/lib/booking/reviewsStorage';
import {
  bootstrapShopProfileFromCache,
  fetchShopProfileRemote,
  shopExtrasFingerprint,
} from '@/lib/booking/shopProfileLoader';
import { getActiveServices, getWeeklyHoursDisplayRows } from '@/lib/booking/shopSchedule';
import type { Shop, ShopExtras, ShopOffer, ShopReview } from '@/lib/booking/types';
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
  const { t, locale, isRTL } = useI18n();
  const { isGuest, customer } = useCustomerAuth();
  const [shop, setShop] = useState<Shop | null>(null);
  const [loading, setLoading] = useState(true);
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
  const extrasFingerprintRef = useRef<string | null>(null);
  const pageScrollRef = useRef<ScrollView>(null);
  const servicesOffsetY = useRef(0);
  const [promoWidth, setPromoWidth] = useState(0);
  const [activeOfferIndex, setActiveOfferIndex] = useState(0);

  const applyRemoteSnapshot = useCallback(
    (snapshot: Awaited<ReturnType<typeof fetchShopProfileRemote>>, options?: { force?: boolean }) => {
      const nextFingerprint = shopExtrasFingerprint(snapshot.extras);
      const extrasChanged = options?.force || extrasFingerprintRef.current !== nextFingerprint;

      if (snapshot.shop) {
        setShop((prev) => {
          if (!prev) return snapshot.shop;
          if (prev.id !== snapshot.shop!.id) return snapshot.shop;
          if (
            prev.name === snapshot.shop!.name &&
            prev.phone === snapshot.shop!.phone &&
            prev.address === snapshot.shop!.address &&
            prev.latitude === snapshot.shop!.latitude &&
            prev.longitude === snapshot.shop!.longitude
          ) {
            return prev;
          }
          return snapshot.shop;
        });
      } else {
        setShop(null);
      }

      if (extrasChanged) {
        extrasFingerprintRef.current = nextFingerprint;
        setExtras(snapshot.extras);
      }

      setBranchCoords((prev) => {
        if (
          snapshot.branchCoords &&
          prev?.latitude === snapshot.branchCoords.latitude &&
          prev?.longitude === snapshot.branchCoords.longitude
        ) {
          return prev;
        }
        return snapshot.branchCoords;
      });

      setReviews(snapshot.reviews);
      setAverageRating(snapshot.averageRating);
      setReviewCount(snapshot.reviewCount);
      setCustomerAlreadyReviewed(!!snapshot.customerReview);
      setCustomerReviewRating(snapshot.customerReview?.rating ?? 0);
      setCustomerReviewFromOrders(
        snapshot.customerReview ? isOrderHistoryReview(snapshot.customerReview.body) : false,
      );
    },
    [],
  );

  useEffect(() => {
    if (!shopId) {
      setShop(null);
      setExtras(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    extrasFingerprintRef.current = null;

    (async () => {
      const cached = await bootstrapShopProfileFromCache(shopId);
      if (cancelled) return;

      if (cached.shop) {
        setShop(cached.shop);
        setExtras(cached.extras);
        setBranchCoords(cached.branchCoords);
        extrasFingerprintRef.current = shopExtrasFingerprint(cached.extras);
        setLoading(false);
      }

      try {
        const remote = await fetchShopProfileRemote(shopId, customer?.id);
        if (cancelled) return;
        applyRemoteSnapshot(remote, { force: !cached.shop });
        if (!remote.shop) {
          setShop(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shopId, customer?.id, applyRemoteSnapshot]);

  const refreshRemote = useCallback(async () => {
    if (!shopId) return;
    const remote = await fetchShopProfileRemote(shopId, customer?.id);
    applyRemoteSnapshot(remote);
  }, [shopId, customer?.id, applyRemoteSnapshot]);

  useFocusEffect(
    useCallback(() => {
      void refreshRemote();
    }, [refreshRemote]),
  );

  useEffect(() => {
    setActiveOfferIndex(0);
    setPromoWidth(0);
  }, [shopId]);

  const offerBadgeMessages = useMemo(() => buildOfferBadgeMessages(t), [t]);

  if (loading && !shop) {
    return <ShopProfileLoadingScreen />;
  }

  if (!shop || !extras) {
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
  const liveOffers = (extras?.offers ?? []).filter((offer) => isOfferLive(offer));
  const preferredOfferId =
    offerId && liveOffers.some((offer) => offer.id === offerId)
      ? offerId
      : pickBestLiveOffer(liveOffers)?.id;
  const preferredOffer = preferredOfferId
    ? liveOffers.find((offer) => offer.id === preferredOfferId)
    : undefined;
  const offers = preferredOffer
    ? [preferredOffer, ...liveOffers.filter((offer) => offer.id !== preferredOffer.id)]
    : liveOffers;
  const pricingOffer = offers[Math.min(activeOfferIndex, Math.max(offers.length - 1, 0))] ?? null;
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
    const bookParams: Record<string, string> = { shopId: id };
    if (serviceId) bookParams.serviceIds = serviceId;
    if (pricingOffer?.id) bookParams.offerId = pricingOffer.id;
    if (isGuest || !customer) {
      router.push({
        pathname: '/auth-required',
        params: {
          intent: 'booking',
          returnTo: buildBookReturnTo(id, serviceId ? [serviceId] : undefined, pricingOffer?.id),
        },
      });
      return;
    }
    router.push({
      pathname: '/book/[shopId]',
      params: bookParams as { shopId: string; serviceIds?: string; offerId?: string },
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

  function scrollToServices() {
    pageScrollRef.current?.scrollTo({
      y: Math.max(0, servicesOffsetY.current - 12),
      animated: true,
    });
  }

  function onPromoScroll(offsetX: number, cardWidth: number) {
    if (cardWidth <= 0 || offers.length <= 1) return;
    const next = Math.round(offsetX / cardWidth);
    const clamped = Math.max(0, Math.min(offers.length - 1, next));
    if (clamped !== activeOfferIndex) setActiveOfferIndex(clamped);
  }

  function formatOfferValidity(offer: ShopOffer) {
    const raw = offer.endDate || offer.validUntil;
    if (!raw) return '';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return '';
    return t('shop_offer_valid_until').replace(
      '{date}',
      date.toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-EG'),
    );
  }

  function renderOfferCard(offer: ShopOffer, width?: number) {
    const title = locale === 'ar' ? offer.titleAr || offer.title : offer.title;
    const description = offer.description?.trim();
    const validity = formatOfferValidity(offer);
    return (
      <View
        style={[
          styles.promoCard,
          width ? { width } : null,
          { backgroundColor: theme.warmSoft, borderColor: theme.warm },
        ]}>
        <Text style={[styles.promoBannerBadge, { color: theme.warm }]}>
          {formatOfferBadge(offer, offerBadgeMessages)}
        </Text>
        <Text style={[styles.promoBannerTitle, { color: theme.text }]} numberOfLines={2}>
          {title}
        </Text>
        {description ? (
          <Text style={[styles.promoBannerBody, { color: theme.textMuted }]} numberOfLines={3}>
            {description}
          </Text>
        ) : null}
        {validity ? (
          <Text style={[styles.promoBannerBody, { color: theme.textMuted }]}>{validity}</Text>
        ) : null}
        <Pressable
          onPress={scrollToServices}
          style={[
            styles.promoExploreBtn,
            { borderColor: theme.warm, alignSelf: isRTL ? 'flex-end' : 'flex-start' },
          ]}>
          <Text style={[styles.promoExploreText, { color: theme.warm }]}>
            {t('shop_profile_explore_deal')}
          </Text>
        </Pressable>
      </View>
    );
  }

  function renderOfferCarousel() {
    const fallbackWidth = Math.max(Dimensions.get('window').width - 56, 240);
    const cardWidth = promoWidth > 0 ? promoWidth : fallbackWidth;
    const multiple = offers.length > 1;

    return (
      <View
        style={styles.promoCarouselWrap}
        onLayout={(event) => {
          const width = Math.round(event.nativeEvent.layout.width);
          if (width > 0 && width !== promoWidth) setPromoWidth(width);
        }}>
        {multiple ? (
          <>
            <ScrollView
              horizontal
              pagingEnabled
              nestedScrollEnabled
              disableIntervalMomentum
              decelerationRate="fast"
              snapToInterval={cardWidth}
              snapToAlignment="start"
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(event) => {
                onPromoScroll(event.nativeEvent.contentOffset.x, cardWidth);
              }}
              onScroll={(event) => {
                if (Platform.OS === 'web') {
                  onPromoScroll(event.nativeEvent.contentOffset.x, cardWidth);
                }
              }}
              scrollEventThrottle={16}>
              {offers.map((offer) => (
                <View key={offer.id} style={{ width: cardWidth }}>
                  {renderOfferCard(offer, cardWidth)}
                </View>
              ))}
            </ScrollView>
            <View style={styles.promoDots}>
              {offers.map((offer, index) => (
                <View
                  key={offer.id}
                  style={[
                    styles.promoDot,
                    {
                      backgroundColor: index === activeOfferIndex ? theme.warm : theme.border,
                    },
                  ]}
                />
              ))}
            </View>
          </>
        ) : (
          renderOfferCard(offers[0])
        )}
      </View>
    );
  }

  function closeImageViewer() {
    setViewerOpen(false);
    setViewerUri(null);
  }

  function renderImageViewerModal() {
    const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
    const viewerWidth = Math.min(screenWidth * 0.92, screenWidth - 32);
    const viewerHeight = screenHeight * 0.8;

    return (
      <Modal visible={viewerOpen} transparent animationType="fade" onRequestClose={closeImageViewer}>
        <View style={styles.viewerRoot}>
          <Pressable style={styles.viewerBackdropPressable} onPress={closeImageViewer} accessibilityRole="button" />
          {viewerUri ? (
            <View style={styles.viewerImageWrap} pointerEvents="box-none">
              <ShopMediaImage
                uri={viewerUri}
                style={[styles.viewerImage, { width: viewerWidth, height: viewerHeight }]}
                contentFit="contain"
              />
            </View>
          ) : null}
        </View>
      </Modal>
    );
  }

  return (
    <>
    <ScrollView
      ref={pageScrollRef}
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={styles.content}>
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

        {offers.length ? renderOfferCarousel() : null}
      </View>

      <View
        onLayout={(event) => {
          servicesOffsetY.current = event.nativeEvent.layout.y;
        }}
        style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('shop_profile_services')}</Text>
        {services.length === 0 ? (
          <Text style={[styles.serviceMeta, { color: theme.textMuted }]}>
            {t('shop_profile_services_empty')}
          </Text>
        ) : (
          services.map((service) => {
          const label = locale === 'ar' ? service.nameAr || service.name : service.name;
          const details = locale === 'ar' ? service.descriptionAr || service.description : service.description;
          return (
            <View key={service.id} style={[styles.serviceRow, { borderColor: theme.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.serviceName, { color: theme.text }]}>{label}</Text>
                <Text style={[styles.serviceMeta, { color: theme.textMuted }]}>
                  {service.durationMinutes} {locale === 'ar' ? 'دقيقة' : 'min'}
                </Text>
                {details ? (
                  <Text style={[styles.serviceMeta, { color: theme.textDim }]}>{details}</Text>
                ) : null}
                {renderOfferPrice(service.priceEgp)}
              </View>
              <Pressable
                onPress={() => goToBook(service.id)}
                style={[styles.serviceBookBtn, { backgroundColor: theme.accent }]}>
                <Text style={[styles.serviceBookText, { color: theme.onAccent }]}>{t('shop_profile_book_service')}</Text>
              </Pressable>
            </View>
          );
        })
        )}
      </View>

      {galleryImages.length ? (
        <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('shop_profile_album')}</Text>
          <ScrollView
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.albumStrip}>
            {galleryImages.map((uri) => (
              <Pressable
                key={uri}
                onPress={() => openViewer(uri)}
                accessibilityRole="imagebutton"
                accessibilityLabel={t('shop_profile_view_image')}
                style={styles.albumThumb}>
                <ShopMediaImage
                  uri={uri}
                  style={styles.albumImage}
                  contentFit="cover"
                  fallbackIcon="photo"
                />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <ShopProfileStoreSection shopId={shop.id} shopType={shop.type} shopName={shopName} />

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
            void refreshRemote();
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
      </View>

    </ScrollView>
    {renderImageViewerModal()}
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { width: '100%', maxWidth: 1024, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 32, gap: 12 },
  heroCard: { borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  coverImage: { width: '100%', height: 170 },
  profileRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 12, paddingBottom: 12, alignItems: 'center', marginTop: -36 },
  profileImage: { width: 90, height: 90, borderRadius: 45, borderWidth: 3 },
  title: { fontSize: 22, fontWeight: '800' },
  meta: { marginTop: 4, fontSize: 13, lineHeight: 18 },
  promoCarouselWrap: {
    marginHorizontal: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  promoCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 6,
  },
  promoBannerBadge: { fontSize: 13, fontWeight: '900' },
  promoBannerTitle: { fontSize: 16, fontWeight: '800' },
  promoBannerBody: { fontSize: 13, lineHeight: 19 },
  promoExploreBtn: {
    marginTop: 4,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  promoExploreText: { fontSize: 13, fontWeight: '600', letterSpacing: 0.5 },
  promoDots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 8 },
  promoDot: { width: 7, height: 7, borderRadius: 4 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, paddingBottom: 12 },
  primaryBtn: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  primaryBtnText: { fontSize: 14, fontWeight: '800' },
  secondaryBtn: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 12 },
  secondaryBtnText: { fontSize: 13, fontWeight: '600', letterSpacing: 0.5 },
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
  serviceBookBtn: { borderRadius: 9, paddingHorizontal: 12, paddingVertical: 8 },
  serviceBookText: { fontSize: 13, fontWeight: '600', letterSpacing: 0.5 },
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
  albumStrip: { gap: 10, paddingVertical: 2 },
  albumThumb: {
    width: 140,
    height: 100,
    borderRadius: 10,
    overflow: 'hidden',
  },
  albumImage: { width: 140, height: 100, borderRadius: 10 },
  infoLine: { fontSize: 14, lineHeight: 20 },
  offerPriceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  strikePrice: { textDecorationLine: 'line-through' },
  viewerRoot: {
    flex: 1,
    position: 'relative',
  },
  viewerBackdropPressable: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.86)',
    zIndex: 1,
  },
  viewerImageWrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  viewerImage: {
    maxWidth: '100%',
    ...(Platform.OS === 'web' ? ({ objectFit: 'contain' } as Record<string, string>) : null),
  },
});
