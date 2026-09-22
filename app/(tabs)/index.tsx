import { router, type Href } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { formatVehicleDisplay } from '@/components/customer/ActiveVehiclePicker';
import { CustomerNotificationsBell } from '@/components/customer/CustomerNotificationsBell';
import { type AppThemeTokens } from '@/constants/Theme';
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
  listOutstandingPenaltyBookingsForPhone,
  pickPrimaryOutstandingPenaltyBooking,
  type PenaltyBalance,
} from '@/lib/booking/storage';
import type { Booking, ShopOffer, ShopType } from '@/lib/booking/types';
import { listAllActiveOffers, subscribeOffersRealtime } from '@/lib/booking/offerRepository';
import { isStoreShopType } from '@/lib/booking/storeCatalog';
import { listCustomerVehicles, loadVehiclePickerState } from '@/lib/booking/vehicleStorage';
import { formatOfferBadge, isOfferLive, buildOfferBadgeMessages } from '@/lib/booking/offerPricing';
import { formatEgp } from '@/lib/booking/reporting';

const EMPTY_PENALTY_BALANCE: PenaltyBalance = {
  outstandingBalance: 0,
  pendingDisputes: 0,
  collectibleBalance: 0,
};

const HOME = {
  bg: '#F8FAFC',
  card: '#FFFFFF',
  text: '#0F172A',
  muted: '#64748B',
  accent: '#0066FF',
  ice: '#E0F2FE',
  iceText: '#0369A1',
  cyan: '#00D2FF',
  border: 'rgba(148, 163, 184, 0.38)',
};

function bookingStatusTone(status: Booking['status'], _theme: AppThemeTokens) {
  if (status === 'confirmed') {
    return { bg: HOME.ice, color: HOME.iceText, border: 'rgba(14, 165, 233, 0.28)' };
  }
  if (status === 'in_progress') {
    return { bg: 'rgba(0, 102, 255, 0.10)', color: HOME.accent, border: 'rgba(0, 102, 255, 0.22)' };
  }
  if (status === 'done') return { bg: 'rgba(16, 185, 129, 0.12)', color: '#047857', border: 'rgba(16, 185, 129, 0.28)' };
  if (status === 'no_show') return { bg: 'rgba(239, 68, 68, 0.10)', color: '#B91C1C', border: 'rgba(239, 68, 68, 0.25)' };
  return { bg: '#F1F5F9', color: HOME.muted, border: HOME.border };
}

function serviceIconName(type: ShopType): React.ComponentProps<typeof FontAwesome>['name'] {
  if (type === 'wash') return 'tint';
  if (type === 'maintenance') return 'wrench';
  if (type === 'parts') return 'cogs';
  return 'shopping-bag';
}

function SurfaceCard({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[styles.sectionCard, style]}>{children}</View>;
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
  const [penaltyBalance, setPenaltyBalance] = useState<PenaltyBalance>(EMPTY_PENALTY_BALANCE);
  const [penaltyBookings, setPenaltyBookings] = useState<Booking[]>([]);
  const [activeVehicleLabel, setActiveVehicleLabel] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const serviceColumns = width >= 900 ? 4 : 2;
  const contentWidth = Math.min(width, 1024) - 40;
  const serviceCardWidth = (contentWidth - 12 * (serviceColumns - 1)) / serviceColumns;

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
      setPenaltyBookings([]);
      return;
    }

    const [upcoming, balance, outstandingPenalties] = await Promise.all([
      fetchNextUpcomingBookingForPhone(customer.phone),
      getMyPenaltyBalance().catch(() => EMPTY_PENALTY_BALANCE),
      listOutstandingPenaltyBookingsForPhone(customer.phone).catch(() => []),
    ]);
    setNextBookingSnapshot(upcoming);
    setPenaltyBalance(balance);
    setPenaltyBookings(outstandingPenalties);
    setNowMs(Date.now());
  }, [customer?.phone]);

  const nextBooking = useMemo(() => {
    if (!nextBookingSnapshot) return null;
    const effective = applyVirtualBookingLifecycle(nextBookingSnapshot, nowMs);
    return isHomeNextUpcomingBooking(effective, nowMs) ? effective : null;
  }, [nextBookingSnapshot, nowMs]);

  const refreshActiveVehicle = useCallback(async () => {
    if (!customer?.id || isGuest) {
      setActiveVehicleLabel(null);
      return;
    }
    const [, picker] = await Promise.all([
      listCustomerVehicles(customer.id),
      loadVehiclePickerState(customer.id),
    ]);
    const vehicle = picker.activeVehicle ?? picker.vehicles[0] ?? null;
    setActiveVehicleLabel(vehicle ? formatVehicleDisplay(vehicle) : null);
  }, [customer?.id, isGuest]);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    void refreshActiveVehicle();
  }, [refreshActiveVehicle]);

  useFocusEffect(
    useCallback(() => {
      refreshHomeData();
      loadLiveOffers();
      void refreshActiveVehicle();
    }, [refreshHomeData, loadLiveOffers, refreshActiveVehicle]),
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
  const primaryPenaltyBooking = useMemo(
    () => pickPrimaryOutstandingPenaltyBooking(penaltyBookings),
    [penaltyBookings],
  );

  function openPenaltyCause() {
    if (primaryPenaltyBooking) {
      router.push(`/booking/${primaryPenaltyBooking.id}` as Href);
      return;
    }
    router.push('/bookings');
  }

  return (
    <View style={[styles.screen, { backgroundColor: HOME.bg }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <View style={styles.topHeaderRow}>
          <View style={styles.greetingBlock}>
            <Text style={styles.greetingName}>
              {greetingName ? tp('home_greeting_named', { name: greetingName }) : t('home_greeting')}
            </Text>
            <Pressable
              onPress={() => router.push('/settings/vehicles')}
              style={({ pressed }) => [styles.vehiclePill, pressed && styles.actionPressed]}>
              <FontAwesome name="car" size={11} color={HOME.iceText} />
              <Text style={styles.vehiclePillText} numberOfLines={1}>
                {activeVehicleLabel || t('store_no_vehicle')}
              </Text>
            </Pressable>
          </View>
          {customer && !isGuest ? (
            <View style={styles.headerBellSlot}>
              <CustomerNotificationsBell embedded iconColor={HOME.text} />
            </View>
          ) : null}
        </View>

        {penaltyBalance.outstandingBalance > 0 ? (
          <Pressable
            onPress={openPenaltyCause}
            style={({ pressed }) => [styles.penaltyBanner, pressed && styles.actionPressed]}>
            <View style={styles.penaltyIcon}>
              <FontAwesome name="exclamation" size={16} color="#B91C1C" />
            </View>
            <View style={styles.penaltyCopy}>
              <Text style={styles.penaltyTitle}>{t('home_penalty_balance_title')}</Text>
              <Text style={styles.penaltyBody}>
                {penaltyBookings.length > 1
                  ? tp('home_penalty_balance_body_multi', {
                      amount: formatEgp(penaltyBalance.outstandingBalance, locale),
                      count: String(penaltyBookings.length),
                    })
                  : tp('home_penalty_balance_body', {
                      amount: formatEgp(penaltyBalance.outstandingBalance, locale),
                    })}
              </Text>
              {penaltyBalance.pendingDisputes > 0 ? (
                <Text style={styles.penaltyPending}>{t('home_penalty_dispute_pending')}</Text>
              ) : null}
            </View>
            <FontAwesome name="chevron-right" size={13} color="#B91C1C" />
          </Pressable>
        ) : null}

        {nextBooking ? (
          <SurfaceCard style={styles.heroCard}>
            <View style={styles.nextBookingTopRow}>
              <View style={styles.bookingIdentity}>
                <View style={styles.bookingIconBadge}>
                  <FontAwesome
                    name={nextBooking.shopType === 'wash' ? 'tint' : 'wrench'}
                    size={18}
                    color={HOME.accent}
                  />
                </View>
                <View style={styles.bookingTitleBlock}>
                  <Text style={styles.sectionEyebrow}>{t('home_next_booking_title')}</Text>
                  <Text style={styles.cardTitle}>{nextBookingShopName}</Text>
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
              <FontAwesome name="calendar" size={12} color={HOME.muted} />
              <Text style={styles.cardMeta}>{formatBookingDateTime(nextBooking.scheduledAt, locale)}</Text>
            </View>
            <Text style={styles.cardMeta}>{shopTypeLabel(nextBooking.shopType, locale)}</Text>
          </SurfaceCard>
        ) : null}

        <View style={styles.pillsRow}>
          <Pressable
            onPress={() => router.push('/settings/vehicles')}
            style={({ pressed }) => [styles.actionPill, styles.actionPillPrimary, pressed && styles.actionPressed]}>
            <Text style={styles.actionPillPrimaryText}>+ {t('home_manage_vehicles')}</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/bookings')}
            style={({ pressed }) => [styles.actionPill, styles.actionPillGhost, pressed && styles.actionPressed]}>
            <Text style={styles.actionPillGhostText}>{t('book_success_view_bookings')}</Text>
          </Pressable>
        </View>

        <SurfaceCard>
          <Text style={styles.sectionTitle}>{t('home_pick_service')}</Text>
          <Text style={styles.sectionSub}>{t('home_pick_service_lead')}</Text>
          <TextInput
            value={serviceSearch}
            onChangeText={setServiceSearch}
            onFocus={() => setServiceSearchFocused(true)}
            onBlur={() => setServiceSearchFocused(false)}
            placeholder={t('home_search_placeholder')}
            placeholderTextColor={HOME.muted}
            style={[
              styles.searchInput,
              Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
              {
                borderColor: serviceSearchFocused ? HOME.accent : HOME.border,
              },
            ]}
          />

          <View style={styles.serviceGrid}>
            {serviceCards.map((card) => (
              <Pressable
                key={card.type}
                onPress={() => {
                  if ('href' in card && card.href) {
                    router.push(card.href);
                  }
                }}
                style={({ pressed, hovered }) => [
                  styles.serviceCard,
                  { width: serviceCardWidth },
                  (pressed || hovered) && styles.serviceCardHover,
                ]}>
                <View style={styles.serviceIcon}>
                  <FontAwesome name={serviceIconName(card.type)} size={18} color={HOME.accent} />
                </View>
                <Text style={styles.serviceTitle}>{card.title}</Text>
                <Text style={styles.serviceSub} numberOfLines={2}>
                  {card.subtitle}
                </Text>
              </Pressable>
            ))}
          </View>
        </SurfaceCard>

        <SurfaceCard>
          <Text style={styles.sectionTitle}>{t('home_offers_carousel')}</Text>
          <Text style={styles.sectionSub}>{t('home_offers_title')}</Text>
          {liveOffers.length === 0 ? (
            <Text style={[styles.offerMeta, { marginBottom: 8 }]}>{t('home_offers_empty')}</Text>
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
                    style={({ pressed, hovered }) => [
                      styles.offerCard,
                      (pressed || hovered) && styles.serviceCardHover,
                    ]}>
                    <Text style={styles.offerEyebrow}>{shopTypeLabel(shopType, locale)}</Text>
                    <View style={styles.offerBadgeCapsule}>
                      <Text style={styles.offerBadgeCapsuleText}>{formatOfferBadge(offer, offerBadgeMessages)}</Text>
                    </View>
                    <Text style={styles.offerTitle} numberOfLines={2}>
                      {locale === 'ar' ? offer.titleAr || offer.title : offer.title}
                    </Text>
                    {description ? (
                      <Text style={styles.offerMeta} numberOfLines={2}>
                        {description}
                      </Text>
                    ) : null}
                    <Text style={styles.offerShop} numberOfLines={1}>
                      {shopName} — {shopArea}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </SurfaceCard>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: 1024,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 52,
  },
  topHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 18,
  },
  greetingBlock: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
  },
  greetingName: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.5,
    lineHeight: 32,
    color: HOME.text,
  },
  vehiclePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: 220,
    backgroundColor: HOME.ice,
    borderWidth: 1,
    borderColor: 'rgba(14, 165, 233, 0.22)',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  vehiclePillText: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
    color: HOME.iceText,
  },
  headerBellSlot: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: HOME.card,
    borderWidth: 1,
    borderColor: HOME.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  penaltyBanner: {
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.28)',
    backgroundColor: '#FEF2F2',
    borderRadius: 20,
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
    borderRadius: 999,
    backgroundColor: 'rgba(239, 68, 68, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  penaltyCopy: { flex: 1, gap: 3 },
  penaltyTitle: { color: '#7F1D1D', fontSize: 15, fontWeight: '700' },
  penaltyBody: { color: '#991B1B', fontSize: 13, lineHeight: 18, fontWeight: '600' },
  penaltyPending: { color: '#B91C1C', fontSize: 12, lineHeight: 17, fontWeight: '700' },
  sectionCard: {
    backgroundColor: HOME.card,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.28)',
    borderRadius: 24,
    padding: 18,
    marginBottom: 14,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  heroCard: {
    paddingVertical: 20,
  },
  actionPressed: { transform: [{ scale: 0.98 }], opacity: 0.92 },
  sectionEyebrow: {
    color: HOME.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginBottom: 3,
    textTransform: 'uppercase',
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
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: HOME.ice,
    borderWidth: 1,
    borderColor: 'rgba(14, 165, 233, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmedBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  confirmedDot: { width: 5, height: 5, borderRadius: 999 },
  confirmedBadgeText: { fontSize: 11, fontWeight: '700' },
  bookingMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 4 },
  cardTitle: { color: HOME.text, fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  cardMeta: { color: HOME.muted, fontSize: 14, lineHeight: 20 },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  actionPill: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPillPrimary: {
    backgroundColor: HOME.accent,
  },
  actionPillGhost: {
    backgroundColor: HOME.card,
    borderWidth: 1,
    borderColor: HOME.border,
  },
  actionPillPrimaryText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  actionPillGhostText: { fontSize: 14, fontWeight: '700', color: HOME.text },
  sectionTitle: { color: HOME.text, fontSize: 20, fontWeight: '700', marginBottom: 6, letterSpacing: -0.3 },
  sectionSub: { color: HOME.muted, fontSize: 14, lineHeight: 21, marginBottom: 14 },
  searchInput: {
    backgroundColor: HOME.bg,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: HOME.text,
    marginBottom: 14,
  },
  serviceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  serviceCard: {
    backgroundColor: HOME.card,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.28)',
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 14,
    minHeight: 132,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  serviceCardHover: {
    borderColor: 'rgba(0, 102, 255, 0.35)',
    shadowOpacity: 0.1,
  },
  serviceIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: HOME.ice,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  serviceTitle: { fontSize: 16, fontWeight: '700', lineHeight: 21, color: HOME.text, marginBottom: 4 },
  serviceSub: { fontSize: 13, lineHeight: 18, color: HOME.muted },
  offersCarousel: { gap: 12, paddingBottom: 4 },
  offerCard: {
    width: 230,
    backgroundColor: HOME.bg,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.28)',
    borderRadius: 20,
    padding: 16,
  },
  offerTitle: { color: HOME.text, fontSize: 16, fontWeight: '700', marginBottom: 7, lineHeight: 22 },
  offerBadgeCapsule: {
    alignSelf: 'flex-start',
    backgroundColor: HOME.ice,
    borderWidth: 1,
    borderColor: 'rgba(14, 165, 233, 0.22)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 8,
  },
  offerBadgeCapsuleText: { fontSize: 12, fontWeight: '800', color: HOME.iceText },
  offerEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 8,
    color: HOME.muted,
  },
  offerMeta: { color: HOME.muted, fontSize: 13, lineHeight: 19 },
  offerShop: { color: HOME.text, fontSize: 13, lineHeight: 19, fontWeight: '600', marginTop: 6 },
});
