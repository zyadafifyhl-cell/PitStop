import { router, type Href } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ActiveVehiclePicker } from '@/components/customer/ActiveVehiclePicker';
import { CustomerNotificationsBell } from '@/components/customer/CustomerNotificationsBell';
import { AppTheme, type AppThemeTokens } from '@/constants/Theme';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useI18n } from '@/context/I18nContext';
import { useShopCatalog } from '@/context/ShopCatalogContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { getShopById } from '@/lib/booking/catalogRepository';
import { getAreaById } from '@/lib/booking/areas';
import { bookingStatusLabel, formatBookingDateTime, shopTypeLabel } from '@/lib/booking/format';
import {
  fetchNextUpcomingBookingForPhone,
  getMyPenaltyBalance,
  isHomeNextUpcomingBooking,
  applyVirtualBookingLifecycle,
  type PenaltyBalance,
} from '@/lib/booking/storage';
import type { Booking, ShopOffer, ShopType } from '@/lib/booking/types';
import { listAllActiveOffers, subscribeOffersRealtime } from '@/lib/booking/offerRepository';
import { isStoreShopType } from '@/lib/booking/storeCatalog';
import { listCustomerVehicles } from '@/lib/booking/vehicleStorage';
import { formatOfferBadge, isOfferLive, buildOfferBadgeMessages } from '@/lib/booking/offerPricing';
import { formatEgp } from '@/lib/booking/reporting';

const EMPTY_PENALTY_BALANCE: PenaltyBalance = {
  outstandingBalance: 0,
  pendingDisputes: 0,
  collectibleBalance: 0,
};

function bookingStatusTone(status: Booking['status'], theme: AppThemeTokens) {
  if (status === 'confirmed') {
    return { bg: 'rgba(16, 185, 129, 0.15)', color: '#10B981', border: 'rgba(16, 185, 129, 0.30)' };
  }
  if (status === 'in_progress') {
    return { bg: theme.accentSoft, color: theme.warm, border: theme.chipBorder };
  }
  if (status === 'done') return { bg: theme.successSoft, color: theme.success, border: theme.success };
  if (status === 'no_show') return { bg: theme.dangerSoft, color: theme.danger, border: theme.danger };
  return { bg: theme.cardHover, color: theme.textMuted, border: theme.border };
}

function CurvyCard({
  theme,
  children,
  style,
}: {
  theme: ReturnType<typeof useAppTheme>;
  children: React.ReactNode;
  style?: object;
}) {
  return (
    <LinearGradient
      colors={['rgba(30, 90, 230, 0.08)', '#0E1726', '#0E1726']}
      locations={[0, 0.6, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.sectionCard, { borderColor: 'rgba(30, 90, 230, 0.25)' }, style]}>
      {children}
    </LinearGradient>
  );
}

export default function HomeScreen() {
  const { t, tp, locale } = useI18n();
  const theme = useAppTheme();
  const { customer, isGuest } = useCustomerAuth();
  const { ready: catalogReady, version: catalogVersion } = useShopCatalog();
  const [nextBookingSnapshot, setNextBookingSnapshot] = useState<Booking | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [liveOffers, setLiveOffers] = useState<
    Array<{ shopId: string; shopName: string; shopArea: string; shopType: ShopType; offer: ShopOffer }>
  >([]);
  const [serviceSearch, setServiceSearch] = useState('');
  const [serviceSearchFocused, setServiceSearchFocused] = useState(false);
  const [vehicleRefreshKey, setVehicleRefreshKey] = useState(0);
  const [penaltyBalance, setPenaltyBalance] = useState<PenaltyBalance>(EMPTY_PENALTY_BALANCE);

  const offerBadgeMessages = useMemo(
    () => buildOfferBadgeMessages(t),
    [t],
  );

  const serviceCards = useMemo(
    () =>
      [
        {
          type: 'maintenance' as const,
          title: t('service_maintenance_title'),
          subtitle: t('service_maintenance_sub'),
          href: '/service/maintenance' as Href,
        },
        {
          type: 'wash' as const,
          title: t('service_wash_title'),
          subtitle: t('service_wash_sub'),
          href: '/service/wash' as Href,
        },
        {
          type: 'parts' as const,
          title: t('service_parts_title'),
          subtitle: t('service_parts_sub'),
          href: '/service/parts' as Href,
        },
        {
          type: 'accessories' as const,
          title: t('service_accessories_title'),
          subtitle: t('service_accessories_sub'),
          href: '/service/accessories' as Href,
        },
      ].filter((card) => {
        const q = serviceSearch.trim().toLowerCase();
        if (!q) return true;
        return card.title.toLowerCase().includes(q) || card.subtitle.toLowerCase().includes(q);
      }),
    [t, serviceSearch],
  );

  const loadLiveOffers = useCallback(async () => {
    if (!catalogReady) return;
    const activeOffers = await listAllActiveOffers();
    const cards: Array<{ shopId: string; shopName: string; shopArea: string; shopType: ShopType; offer: ShopOffer }> = [];

    for (const offer of activeOffers.filter((row) => isOfferLive(row))) {
      const shop = getShopById(offer.shopId ?? '');
      // Include every merchant type: wash, maintenance, winch, parts, accessories.
      if (!shop) continue;
      const shopName = locale === 'ar' ? shop.nameAr : shop.name;
      const area = getAreaById(shop.areaId);
      const shopArea =
        locale === 'ar'
          ? area?.nameAr || area?.name || shop.addressAr.split(',')[0] || shop.areaId
          : area?.name || shop.address.split(',')[0] || shop.areaId;
      cards.push({ shopId: shop.id, shopName, shopArea, shopType: shop.type, offer });
    }
    setLiveOffers(cards.slice(0, 8));
  }, [catalogReady, catalogVersion, locale]);

  function openFeaturedOffer(shopId: string, shopType: ShopType, offerId: string) {
    if (isStoreShopType(shopType)) {
      router.push({ pathname: '/store', params: { shopId } });
      return;
    }
    router.push(`/shop-profile/${shopId}?offerId=${encodeURIComponent(offerId)}` as Href);
  }

  const refreshHomeData = useCallback(async () => {
    if (!customer?.phone) {
      setNextBookingSnapshot(null);
      setPenaltyBalance(EMPTY_PENALTY_BALANCE);
      return;
    }

    const [upcoming, balance] = await Promise.all([
      fetchNextUpcomingBookingForPhone(customer.phone),
      getMyPenaltyBalance().catch(() => EMPTY_PENALTY_BALANCE),
    ]);
    setNextBookingSnapshot(upcoming);
    setPenaltyBalance(balance);
    setNowMs(Date.now());
  }, [customer?.phone]);

  const nextBooking = useMemo(() => {
    if (!nextBookingSnapshot) return null;
    const effective = applyVirtualBookingLifecycle(nextBookingSnapshot, nowMs);
    return isHomeNextUpcomingBooking(effective, nowMs) ? effective : null;
  }, [nextBookingSnapshot, nowMs]);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!customer?.id || isGuest) return;

    let cancelled = false;
    void listCustomerVehicles(customer.id).then(() => {
      if (!cancelled) {
        setVehicleRefreshKey((key) => key + 1);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [customer?.id, isGuest]);

  useFocusEffect(
    useCallback(() => {
      refreshHomeData();
      loadLiveOffers();
      setVehicleRefreshKey((key) => key + 1);
    }, [refreshHomeData, loadLiveOffers]),
  );

  useEffect(() => {
    const unsubscribe = subscribeOffersRealtime(() => {
      void loadLiveOffers();
    });
    return unsubscribe;
  }, [loadLiveOffers]);

  const greetingName = customer
    ? customer.name.split(' ')[0]?.trim() || customer.name
    : null;
  const nextBookingShop =
    catalogReady && nextBooking ? getShopById(nextBooking.shopId) : undefined;
  const nextBookingShopName = nextBookingShop
    ? locale === 'ar'
      ? nextBookingShop.nameAr
      : nextBookingShop.name
    : nextBooking?.shopId;
  const nextStatusTone = nextBooking ? bookingStatusTone(nextBooking.status, theme) : null;

  return (
    <View style={[styles.screen, { backgroundColor: '#0B1120' }]}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.heroHeaderBlock}>
          <View style={styles.topHeaderRow}>
            <View style={styles.greetingBlock}>
              <Text style={[styles.greetingEyebrow, { color: theme.textMuted }]}>{t('home_greeting')}</Text>
              <Text style={[styles.greetingName, { color: theme.text }]}>
                {greetingName ? tp('home_greeting_named', { name: greetingName }) : t('home_greeting')}
              </Text>
            </View>
            {customer && !isGuest ? (
              <View style={styles.headerBellSlot}>
                <CustomerNotificationsBell embedded />
              </View>
            ) : null}
          </View>

        </View>

      {penaltyBalance.outstandingBalance > 0 ? (
        <Pressable
          onPress={() => router.push('/bookings')}
          style={({ pressed }) => [styles.penaltyBanner, pressed && styles.actionPressed]}>
          <View style={styles.penaltyIcon}>
            <FontAwesome name="exclamation" size={16} color={theme.danger} />
          </View>
          <View style={styles.penaltyCopy}>
            <Text style={styles.penaltyTitle}>{t('home_penalty_balance_title')}</Text>
            <Text style={styles.penaltyBody}>
              {tp('home_penalty_balance_body', {
                amount: formatEgp(penaltyBalance.outstandingBalance, locale),
              })}
            </Text>
            {penaltyBalance.pendingDisputes > 0 ? (
              <Text style={styles.penaltyPending}>{t('home_penalty_dispute_pending')}</Text>
            ) : null}
          </View>
          <FontAwesome name="chevron-right" size={13} color={theme.danger} />
        </Pressable>
      ) : null}

      <CurvyCard theme={theme}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('screen_vehicle')}</Text>
        <Text style={[styles.sectionSub, { color: theme.textMuted }]}>{t('settings_vehicles_manage_hint')}</Text>
        {customer && !isGuest ? (
          <View style={[styles.vehicleSlot, { borderColor: 'rgba(30, 90, 230, 0.18)', backgroundColor: '#131F35' }]}>
            <Text style={[styles.vehicleSlotTitle, { color: theme.text }]}>{t('home_active_vehicle_title')}</Text>
            <ActiveVehiclePicker key={vehicleRefreshKey} customerId={customer.id} embedded />
          </View>
        ) : (
          <View style={[styles.vehicleSlot, { borderColor: 'rgba(30, 90, 230, 0.18)', backgroundColor: '#131F35' }]}>
            <Text style={[styles.vehicleSlotTitle, { color: theme.text }]}>{t('home_active_vehicle_title')}</Text>
            <Text style={[styles.vehicleSlotSub, { color: theme.textMuted }]}>{t('shop_review_sign_in_hint')}</Text>
          </View>
        )}
        <Pressable
          onPress={() => router.push('/settings/vehicles')}
          style={({ pressed }) => [styles.manageVehicleWrap, pressed && styles.actionPressed]}>
          <LinearGradient
            colors={['#2563EB', '#1D4ED8']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.manageVehicleBtn}>
            <Text style={styles.manageVehicleText}>+ {t('home_manage_vehicles')}</Text>
          </LinearGradient>
        </Pressable>
      </CurvyCard>

      {nextBooking ? (
        <LinearGradient
          colors={['rgba(30, 90, 230, 0.08)', '#0E1726', '#0E1726']}
          locations={[0, 0.6, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.nextBookingCard, { borderColor: 'rgba(30, 90, 230, 0.25)' }]}>
          <View style={styles.nextBookingTopRow}>
            <View style={styles.bookingIdentity}>
              <View style={styles.bookingIconBadge}>
                <FontAwesome
                  name={nextBooking.shopType === 'wash' ? 'tint' : 'wrench'}
                  size={18}
                  color="#3B82F6"
                />
              </View>
              <View style={styles.bookingTitleBlock}>
                <Text style={[styles.sectionEyebrow, { color: theme.warm }]}>{t('home_next_booking_title')}</Text>
                <Text style={[styles.cardTitle, { color: '#FFFFFF' }]}>{nextBookingShopName}</Text>
              </View>
            </View>
            {nextStatusTone ? (
              <View
                style={[
                  styles.confirmedBadge,
                  { backgroundColor: nextStatusTone.bg, borderColor: nextStatusTone.border },
                ]}>
                <View style={[styles.confirmedDot, { backgroundColor: nextStatusTone.color }]} />
                <Text style={[styles.confirmedBadgeText, { color: nextStatusTone.color }]}>
                  {bookingStatusLabel(nextBooking.status, locale)}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={styles.bookingMetaRow}>
            <FontAwesome name="calendar" size={12} color="#64748B" />
            <FontAwesome name="clock-o" size={13} color="#64748B" />
            <Text style={[styles.cardMeta, { color: '#94A3B8' }]}>
              {formatBookingDateTime(nextBooking.scheduledAt, locale)}
            </Text>
          </View>
          <Text style={[styles.cardMeta, { color: '#94A3B8' }]}>{shopTypeLabel(nextBooking.shopType, locale)}</Text>
          <Pressable
            onPress={() => router.push('/bookings')}
            style={({ pressed }) => [styles.primaryActionWrap, pressed && styles.actionPressed]}>
            <LinearGradient
              colors={['#2563EB', '#1D4ED8']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.primaryActionBtn}>
              <Text style={styles.primaryActionText}>{t('book_success_view_bookings')}</Text>
            </LinearGradient>
          </Pressable>
        </LinearGradient>
      ) : null}

      <CurvyCard theme={theme}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('home_pick_service')}</Text>
        <Text style={[styles.sectionSub, { color: theme.textMuted }]}>{t('home_pick_service_lead')}</Text>
        <TextInput
          value={serviceSearch}
          onChangeText={setServiceSearch}
          onFocus={() => setServiceSearchFocused(true)}
          onBlur={() => setServiceSearchFocused(false)}
          placeholder={t('home_search_placeholder')}
          placeholderTextColor={theme.textDim}
          style={[
            styles.searchInput,
            Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null,
            {
              backgroundColor: theme.inputBg,
              borderColor: serviceSearchFocused ? theme.accent : theme.border,
              color: theme.text,
            },
          ]}
        />

        {serviceCards.map((card) => (
          <Pressable
            key={card.type}
            onPress={() => {
              if ('href' in card && card.href) {
                router.push(card.href);
              }
            }}
            style={[styles.serviceRow, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
            <View style={[styles.serviceIcon, { backgroundColor: theme.greenSoft }]}>
              <FontAwesome
                name={card.type === 'wash' ? 'tint' : card.type === 'maintenance' ? 'wrench' : 'cogs'}
                size={18}
                color={theme.green}
              />
            </View>
            <View style={styles.serviceMeta}>
              <Text style={[styles.serviceTitle, { color: theme.text }]}>{card.title}</Text>
            </View>
            <FontAwesome name="chevron-right" size={14} color={theme.textDim} />
          </Pressable>
        ))}
      </CurvyCard>

      <CurvyCard theme={theme}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('home_offers_carousel')}</Text>
        <Text style={[styles.sectionSub, { color: theme.textMuted }]}>{t('home_offers_title')}</Text>
        {liveOffers.length === 0 ? (
          <Text style={[styles.offerMeta, { color: theme.textMuted, marginBottom: 8 }]}>{t('home_offers_empty')}</Text>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.offersCarousel}>
            {liveOffers.map(({ shopId, shopName, shopArea, shopType, offer }) => {
              const description = offer.description?.trim();
              return (
                <Pressable
                  key={offer.id}
                  onPress={() => openFeaturedOffer(shopId, shopType, offer.id)}
                  style={[styles.offerCard, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
                  <Text style={[styles.offerEyebrow, { color: theme.warm }]}>{shopTypeLabel(shopType, locale)}</Text>
                  <View style={[styles.offerBadgeCapsule, { backgroundColor: theme.warmSoft, borderColor: theme.warm }]}>
                    <Text style={[styles.offerBadgeCapsuleText, { color: theme.warm }]}>
                      {formatOfferBadge(offer, offerBadgeMessages)}
                    </Text>
                  </View>
                  <Text style={[styles.offerTitle, { color: theme.text }]} numberOfLines={2}>
                    {locale === 'ar' ? offer.titleAr || offer.title : offer.title}
                  </Text>
                  {description ? (
                    <Text style={[styles.offerMeta, { color: theme.textMuted }]} numberOfLines={2}>
                      {description}
                    </Text>
                  ) : null}
                  <Text style={[styles.offerMeta, { color: theme.text }]} numberOfLines={1}>
                    {shopName} — {shopArea}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </CurvyCard>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 52 },
  heroHeaderBlock: {
    marginBottom: 14,
    marginHorizontal: -20,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 10,
  },
  topHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 0,
    paddingBottom: 0,
  },
  greetingBlock: {
    flex: 1,
    gap: 2,
    marginBottom: 0,
    paddingBottom: 0,
  },
  greetingEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  greetingName: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
    lineHeight: 22,
    marginBottom: 0,
  },
  headerBellSlot: {
    flexShrink: 0,
  },
  penaltyBanner: {
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.38)',
    backgroundColor: 'rgba(239, 68, 68, 0.09)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  penaltyIcon: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  penaltyCopy: { flex: 1, gap: 3 },
  penaltyTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  penaltyBody: { color: '#CBD5E1', fontSize: 13, lineHeight: 18, fontWeight: '600' },
  penaltyPending: { color: '#FCA5A5', fontSize: 12, lineHeight: 17, fontWeight: '700' },
  title: { fontSize: 28, fontWeight: '700', marginTop: 0, marginBottom: 4, letterSpacing: -0.3, lineHeight: 32 },
  lead: { fontSize: 16, lineHeight: 21, marginTop: 0, marginBottom: 0 },
  sectionCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    overflow: 'hidden',
  },
  vehicleSlot: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    gap: 8,
  },
  vehicleSlotTitle: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  vehicleSlotSub: { fontSize: 14, lineHeight: 20 },
  manageVehicleWrap: { marginTop: 12, borderRadius: 9, overflow: 'hidden' },
  manageVehicleBtn: {
    minHeight: 48,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#1E5AE6',
    borderTopColor: 'rgba(255, 255, 255, 0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPressed: { transform: [{ scale: 0.98 }] },
  manageVehicleText: { fontSize: 15, fontWeight: '600', letterSpacing: 0.5, color: '#FFFFFF' },
  sectionEyebrow: {
    color: AppTheme.accent,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  nextBookingCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
  },
  nextBookingTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  bookingIdentity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  bookingTitleBlock: { flex: 1 },
  bookingIconBadge: {
    width: 42,
    height: 42,
    borderRadius: 9,
    backgroundColor: 'rgba(30, 90, 230, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(30, 90, 230, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmedBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  confirmedDot: { width: 5, height: 5, borderRadius: 999 },
  confirmedBadgeText: { fontSize: 11, fontWeight: '700' },
  bookingMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  cardTitle: { color: AppTheme.text, fontSize: 20, fontWeight: '700' },
  cardMeta: { color: AppTheme.textMuted, fontSize: 15, lineHeight: 22 },
  sectionTitle: { color: AppTheme.text, fontSize: 22, fontWeight: '700', marginBottom: 6 },
  sectionSub: { color: AppTheme.textMuted, fontSize: 15, lineHeight: 22, marginBottom: 12 },
  primaryActionWrap: { marginTop: 12, borderRadius: 9, overflow: 'hidden' },
  primaryActionBtn: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#1E5AE6',
    borderTopColor: 'rgba(255, 255, 255, 0.25)',
  },
  primaryActionText: { fontSize: 15, fontWeight: '600', letterSpacing: 0.5, color: '#FFFFFF' },
  searchInput: {
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 12,
  },
  serviceRow: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 18,
    paddingHorizontal: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 64,
  },
  serviceIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceMeta: { flex: 1 },
  serviceTitle: { fontSize: 19, fontWeight: '900', lineHeight: 24 },
  offersCarousel: { gap: 12, paddingBottom: 4 },
  offerCard: {
    width: 230,
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
  },
  offerTitle: { color: AppTheme.text, fontSize: 16, fontWeight: '900', marginBottom: 7, lineHeight: 22 },
  offerBadgeCapsule: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 6,
  },
  offerBadgeCapsuleText: { fontSize: 12, fontWeight: '800' },
  offerEyebrow: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', marginBottom: 4 },
  offerMeta: { color: AppTheme.textMuted, fontSize: 14, lineHeight: 20 },
});
