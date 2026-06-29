import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Image } from 'expo-image';
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

import { useAppTheme } from '@/context/ThemePreferenceContext';
import { useI18n } from '@/context/I18nContext';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useShopCatalog } from '@/context/ShopCatalogContext';
import { getShopById } from '@/lib/booking/catalogRepository';
import { shopTypeLabel } from '@/lib/booking/format';
import { formatEgp } from '@/lib/booking/reporting';
import { listShopReviews, seedDemoReviews } from '@/lib/booking/reviewsStorage';
import { getShopExtras } from '@/lib/booking/shopExtrasStorage';
import { formatWeeklyHoursLines, getActiveServices } from '@/lib/booking/shopSchedule';
import type { ShopExtras, ShopReview } from '@/lib/booking/types';
import { fetchDefaultBranchCoordinates } from '@/lib/booking/wash/branchRepository';
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
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [branchCoords, setBranchCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  const shop = useMemo(
    () => (catalogReady && shopId ? getShopById(shopId) : undefined),
    [catalogReady, catalogVersion, shopId],
  );

  const refreshExtras = useCallback(async () => {
    if (!shop) return;
    const [row, reviewRows, coords] = await Promise.all([
      getShopExtras(shop.id),
      listShopReviews(shop.id),
      fetchDefaultBranchCoordinates(shop.id),
    ]);
    setExtras(row);
    setBranchCoords(coords);
    setReviews(
      (reviewRows.length ? reviewRows : seedDemoReviews(shop.id)).filter((review) => !review.hidden),
    );
  }, [shop]);

  useFocusEffect(
    useCallback(() => {
      refreshExtras();
    }, [refreshExtras]),
  );

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
  const profileImage = extras?.profileImageUrl || extras?.imageUrls?.[0];
  const coverImage = extras?.imageUrls?.[0] || profileImage;
  const offers = (extras?.offers ?? []).filter((offer) => offer.active);
  const services = getActiveServices(extras);
  const hoursLines = formatWeeklyHoursLines(extras, locale);
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

  function goToBook(serviceId?: string, fromOfferId?: string) {
    const id = String(shopId);
    if (isGuest || !customer) {
      router.push({
        pathname: '/auth-required',
        params: {
          intent: 'booking',
          returnTo: buildBookReturnTo(id, serviceId ? [serviceId] : undefined, fromOfferId),
        },
      });
      return;
    }
    router.push({
      pathname: '/book/[shopId]',
      params: {
        shopId: id,
        ...(serviceId ? { serviceIds: serviceId } : {}),
        ...(fromOfferId ? { offerId: fromOfferId } : {}),
      },
    });
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
        {coverImage ? (
          <Pressable onPress={() => openViewer(coverImage)}>
            <Image source={{ uri: coverImage }} style={styles.coverImage} contentFit="cover" />
          </Pressable>
        ) : (
          <View style={[styles.coverImage, { backgroundColor: theme.bgElevated }]} />
        )}
        <View style={styles.profileRow}>
          {profileImage ? (
            <Pressable onPress={() => openViewer(profileImage)}>
              <Image source={{ uri: profileImage }} style={styles.profileImage} contentFit="cover" />
            </Pressable>
          ) : (
            <View style={[styles.profileImage, { backgroundColor: theme.bgElevated, alignItems: 'center', justifyContent: 'center' }]}>
              <FontAwesome name="building" size={26} color={theme.textDim} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: theme.text }]}>{shopName}</Text>
            <Text style={[styles.meta, { color: theme.textMuted }]}>
              {shopTypeLabel(shop.type, locale)} · {address}
            </Text>
            {shop.rating != null ? (
              <Text style={[styles.meta, { color: theme.textMuted }]}>★ {shop.rating.toFixed(1)}</Text>
            ) : null}
          </View>
        </View>

        {washStatusBadge ? (
          <WashStatusBadge status={washStatusBadge} vacationReturnDate={extras?.vacationReturnDate} />
        ) : null}

        <View style={styles.actionRow}>
          {extras?.imageUrls?.length ? (
            <Pressable
              onPress={() => setGalleryOpen(true)}
              style={[styles.secondaryBtn, { borderColor: theme.border }]}>
              <Text style={[styles.secondaryBtnText, { color: theme.text }]}>{t('shop_profile_view_gallery')}</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => openViewer(profileImage || coverImage)} style={[styles.secondaryBtn, { borderColor: theme.border }]}>
              <Text style={[styles.secondaryBtnText, { color: theme.text }]}>{t('shop_profile_view_image')}</Text>
            </Pressable>
          )}
        </View>

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
        {services.map((service) => {
          const label = locale === 'ar' ? service.nameAr || service.name : service.name;
          return (
            <View key={service.id} style={[styles.serviceRow, { borderColor: theme.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.serviceName, { color: theme.text }]}>{label}</Text>
                <Text style={[styles.serviceMeta, { color: theme.textMuted }]}>
                  {formatEgp(service.priceEgp, locale)} · {service.durationMinutes}{' '}
                  {locale === 'ar' ? 'دقيقة' : 'min'}
                </Text>
              </View>
              <Pressable onPress={() => goToBook(service.id)} style={[styles.serviceBookBtn, { backgroundColor: theme.accentSoft }]}>
                <Text style={[styles.serviceBookText, { color: theme.accent }]}>{t('shop_profile_book_service')}</Text>
              </Pressable>
            </View>
          );
        })}
      </View>

      <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('shop_profile_working_hours')}</Text>
        {hoursLines.map((line) => (
          <Text key={line} style={[styles.infoLine, { color: theme.textMuted }]}>
            {line}
          </Text>
        ))}
      </View>

      <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('shop_profile_reviews')}</Text>
        <ShopReviewForm shopId={shop.id} onSubmitted={refreshExtras} />
        {reviews.map((review) => (
          <View key={review.id} style={[styles.reviewRow, { borderColor: theme.border }]}>
            <View style={styles.reviewHeader}>
              <Text style={[styles.reviewName, { color: theme.text }]}>{review.customerName}</Text>
              <Text style={[styles.reviewRating, { color: theme.accent }]}>{'★'.repeat(review.rating)}</Text>
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

      {extras?.imageUrls?.length ? (
        <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('shop_profile_album')}</Text>
          <View style={styles.albumGrid}>
            {extras.imageUrls.map((uri) => (
              <Pressable key={uri} onPress={() => openViewer(uri)}>
                <Image source={{ uri }} style={styles.albumImage} contentFit="cover" />
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
                  <Text style={[styles.offerText, { color: theme.accent }]}>{label}</Text>
                  <Text style={[styles.infoLine, { color: theme.textMuted, marginTop: 4 }]}>
                    {t('shop_offer_valid_until').replace(
                      '{date}',
                      new Date(offer.validUntil).toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-EG'),
                    )}
                  </Text>
                  <Pressable
                    onPress={() => goToBook(services[0]?.id, offer.id)}
                    style={[styles.serviceBookBtn, { backgroundColor: theme.accent, marginTop: 8, alignSelf: 'flex-start' }]}>
                    <Text style={[styles.serviceBookText, { color: theme.onAccent }]}>{t('shop_offer_book')}</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : null}
      </View>

      <Modal visible={galleryOpen} transparent animationType="slide" onRequestClose={() => setGalleryOpen(false)}>
        <View style={styles.galleryBackdrop}>
          <View style={[styles.galleryCard, { backgroundColor: theme.card }]}>
            <Text style={[styles.sectionTitle, { color: theme.text, padding: 12 }]}>{t('shop_profile_view_gallery')}</Text>
            <ScrollView contentContainerStyle={styles.galleryScroll}>
              {(extras?.imageUrls ?? []).map((uri) => (
                <Pressable key={uri} onPress={() => { setGalleryOpen(false); openViewer(uri); }}>
                  <Image source={{ uri }} style={styles.galleryImage} contentFit="cover" />
                </Pressable>
              ))}
            </ScrollView>
            <Pressable onPress={() => setGalleryOpen(false)} style={[styles.galleryClose, { borderColor: theme.border }]}>
              <Text style={{ color: theme.text, fontWeight: '700' }}>{t('add_cancel')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={viewerOpen} transparent animationType="fade" onRequestClose={() => setViewerOpen(false)}>
        <View style={styles.viewerBackdrop}>
          <Pressable style={styles.viewerBackdrop} onPress={() => setViewerOpen(false)}>
            {viewerUri ? <Image source={{ uri: viewerUri }} style={styles.viewerImage} contentFit="contain" /> : null}
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
  profileRow: { flexDirection: 'row', gap: 12, padding: 12, alignItems: 'center' },
  profileImage: { width: 90, height: 90, borderRadius: 45 },
  title: { fontSize: 22, fontWeight: '800' },
  meta: { marginTop: 4, fontSize: 13, lineHeight: 18 },
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
  albumImage: { width: 102, height: 102, borderRadius: 10, backgroundColor: '#111' },
  infoLine: { fontSize: 14, lineHeight: 20 },
  offerChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start' },
  offerCard: { borderWidth: 1, borderRadius: 12, padding: 12 },
  offerText: { fontSize: 12, fontWeight: '700' },
  galleryBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  galleryCard: { maxHeight: '80%', borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  galleryScroll: { padding: 12, gap: 10 },
  galleryImage: { width: '100%', height: 220, borderRadius: 12, marginBottom: 10 },
  galleryClose: { borderTopWidth: 1, padding: 16, alignItems: 'center' },
  viewerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.86)', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '92%', height: '78%' },
});
