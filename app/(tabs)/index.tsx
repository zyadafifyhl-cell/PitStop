import { router, type Href } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AutomotiveBackground } from '@/components/ui/AutomotiveBackground';
import { ActiveVehiclePicker } from '@/components/customer/ActiveVehiclePicker';
import { HomeHeroCarAnimation } from '@/components/home/HomeHeroCarAnimation';
import { AppTheme } from '@/constants/Theme';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useI18n } from '@/context/I18nContext';
import { useShopCatalog } from '@/context/ShopCatalogContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { useAppSignOut } from '@/lib/auth/useAppSignOut';
import { getShopById } from '@/lib/booking/catalogRepository';
import { getAreaById } from '@/lib/booking/areas';
import { bookingStatusLabel, formatBookingDateTime, shopTypeLabel } from '@/lib/booking/format';
import { listBookingsForPhone } from '@/lib/booking/storage';
import type { Booking, ShopOffer, ShopType } from '@/lib/booking/types';
import { listAllActiveOffers } from '@/lib/booking/offerRepository';
import { isOfferLive } from '@/lib/booking/offerPricing';

function bookingStatusTone(status: Booking['status']) {
  if (status === 'pending') return { bg: 'rgba(0, 212, 255, 0.18)', color: '#A5F3FC' };
  if (status === 'confirmed' || status === 'in_progress') return { bg: 'rgba(0, 82, 255, 0.20)', color: '#BFDBFE' };
  if (status === 'done') return { bg: 'rgba(34, 197, 94, 0.22)', color: '#DCFCE7' };
  if (status === 'no_show') return { bg: 'rgba(234, 179, 8, 0.24)', color: '#FEF08A' };
  return { bg: 'rgba(239, 68, 68, 0.24)', color: '#FECACA' };
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
    <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }, style]}>
      {children}
    </View>
  );
}

export default function HomeScreen() {
  const { t, tp, locale } = useI18n();
  const theme = useAppTheme();
  const { customer, isGuest } = useCustomerAuth();
  const { signOut, busy: signingOut } = useAppSignOut();
  const { ready: catalogReady, version: catalogVersion } = useShopCatalog();
  const [nextBooking, setNextBooking] = useState<Booking | null>(null);
  const [liveOffers, setLiveOffers] = useState<
    Array<{ shopId: string; shopName: string; shopArea: string; shopType: ShopType; offer: ShopOffer }>
  >([]);
  const [serviceSearch, setServiceSearch] = useState('');
  const [serviceFilter, setServiceFilter] = useState<'all' | 'wash'>('all');
  const [vehicleRefreshKey, setVehicleRefreshKey] = useState(0);

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
        if (serviceFilter === 'wash' && card.type !== 'wash') return false;
        const q = serviceSearch.trim().toLowerCase();
        if (!q) return true;
        return card.title.toLowerCase().includes(q) || card.subtitle.toLowerCase().includes(q);
      }),
    [t, serviceSearch, serviceFilter],
  );

  const loadLiveOffers = useCallback(async () => {
    if (!catalogReady) return;
    const activeOffers = await listAllActiveOffers();
    const cards: Array<{ shopId: string; shopName: string; shopArea: string; shopType: ShopType; offer: ShopOffer }> = [];

    for (const offer of activeOffers.filter((row) => isOfferLive(row))) {
      const shop = getShopById(offer.shopId ?? '');
      if (!shop || (shop.type !== 'wash' && shop.type !== 'maintenance')) continue;
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

  async function onSignOut() {
    await signOut();
  }

  const refreshHomeData = useCallback(async () => {
    if (!customer) {
      setNextBooking(null);
      return;
    }

    const bookings = customer.phone ? await listBookingsForPhone(customer.phone) : [];
    const now = Date.now();
    const upcoming = bookings
      .filter((booking) => {
        const time = new Date(booking.scheduledAt).getTime();
        return time >= now && booking.status !== 'cancelled' && booking.status !== 'done';
      })
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0] ?? null;
    setNextBooking(upcoming);
  }, [customer]);

  useFocusEffect(
    useCallback(() => {
      refreshHomeData();
      loadLiveOffers();
      setVehicleRefreshKey((key) => key + 1);
    }, [refreshHomeData, loadLiveOffers]),
  );

  const greeting = customer
    ? tp('home_greeting_named', { name: customer.name.split(' ')[0] ?? customer.name })
    : t('home_greeting');
  const nextBookingShop =
    catalogReady && nextBooking ? getShopById(nextBooking.shopId) : undefined;
  const nextBookingShopName = nextBookingShop
    ? locale === 'ar'
      ? nextBookingShop.nameAr
      : nextBookingShop.name
    : nextBooking?.shopId;
  const nextStatusTone = nextBooking ? bookingStatusTone(nextBooking.status) : null;

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <AutomotiveBackground theme={theme} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.heroSection}>
          <View style={styles.heroTextCol}>
            <Text style={[styles.greeting, { color: theme.textMuted }]}>{greeting}</Text>
          </View>
          {customer && !isGuest ? (
            <View style={styles.heroCarCol}>
              <HomeHeroCarAnimation />
            </View>
          ) : null}
        </View>
        <Text style={[styles.title, { color: theme.text }]}>{t('home_pick_service')}</Text>
        <Text style={[styles.lead, { color: theme.textMuted }]}>{t('home_pick_service_lead')}</Text>

      <CurvyCard theme={theme}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('screen_vehicle')}</Text>
        <Text style={[styles.sectionSub, { color: theme.textMuted }]}>{t('settings_vehicles_manage_hint')}</Text>
        {customer && !isGuest ? (
          <View style={[styles.vehicleSlot, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
            <Text style={[styles.vehicleSlotTitle, { color: theme.text }]}>{t('home_active_vehicle_title')}</Text>
            <ActiveVehiclePicker key={vehicleRefreshKey} customerId={customer.id} embedded />
          </View>
        ) : (
          <View style={[styles.vehicleSlot, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
            <Text style={[styles.vehicleSlotTitle, { color: theme.text }]}>{t('home_active_vehicle_title')}</Text>
            <Text style={[styles.vehicleSlotSub, { color: theme.textMuted }]}>{t('shop_review_sign_in_hint')}</Text>
          </View>
        )}
        <Pressable onPress={() => router.push('/settings/vehicles')} style={styles.manageVehicleWrap}>
          <LinearGradient
            colors={[theme.warm, theme.accent]}
            start={{ x: 0, y: 0.2 }}
            end={{ x: 1, y: 0.8 }}
            style={styles.manageVehicleBtn}>
            <Text style={styles.manageVehicleText}>+ {t('home_manage_vehicles')}</Text>
          </LinearGradient>
        </Pressable>
      </CurvyCard>

      {nextBooking ? (
        <View style={[styles.nextBookingCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.nextBookingTopRow}>
            <Text style={[styles.sectionEyebrow, { color: theme.warm }]}>{t('home_next_booking_title')}</Text>
            {nextStatusTone ? (
              <View style={[styles.statusBadge, { backgroundColor: nextStatusTone.bg }]}>
                <Text style={[styles.statusBadgeText, { color: nextStatusTone.color }]}>
                  {bookingStatusLabel(nextBooking.status, locale)}
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.cardTitle, { color: theme.text }]}>{nextBookingShopName}</Text>
          <Text style={[styles.cardMeta, { color: theme.textMuted }]}>{formatBookingDateTime(nextBooking.scheduledAt, locale)}</Text>
          <Text style={[styles.cardMeta, { color: theme.textMuted }]}>{shopTypeLabel(nextBooking.shopType, locale)}</Text>
          <Pressable onPress={() => router.push('/bookings')} style={styles.primaryActionWrap}>
            <LinearGradient
              colors={[theme.accent, theme.warm]}
              start={{ x: 0, y: 0.2 }}
              end={{ x: 1, y: 0.8 }}
              style={styles.primaryActionBtn}>
              <Text style={styles.primaryActionText}>{t('book_success_view_bookings')}</Text>
            </LinearGradient>
          </Pressable>
        </View>
      ) : null}

      <CurvyCard theme={theme}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('home_pick_service')}</Text>
        <Text style={[styles.sectionSub, { color: theme.textMuted }]}>{t('home_pick_service_lead')}</Text>
        <TextInput
          value={serviceSearch}
          onChangeText={setServiceSearch}
          placeholder={t('home_search_placeholder')}
          placeholderTextColor={theme.textDim}
          style={[styles.searchInput, { backgroundColor: theme.bgElevated, borderColor: theme.border, color: theme.text }]}
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow}>
          {(
            [
              { id: 'all' as const, label: t('home_filter_all') },
              { id: 'wash' as const, label: t('home_filter_wash') },
            ] as const
          ).map((chip) => {
            const active = serviceFilter === chip.id;
            return (
              <Pressable key={chip.id} onPress={() => setServiceFilter(chip.id)} style={styles.filterChipWrap}>
                {active ? (
                  <LinearGradient
                    colors={[theme.accent, theme.warm]}
                    start={{ x: 0, y: 0.2 }}
                    end={{ x: 1, y: 0.8 }}
                    style={styles.filterChipActive}>
                    <Text style={styles.filterChipTextActive}>{chip.label}</Text>
                  </LinearGradient>
                ) : (
                  <View style={[styles.filterChip, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                    <Text style={[styles.filterChipText, { color: theme.textMuted }]}>{chip.label}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>

        {serviceCards.map((card) => (
          <Pressable
            key={card.type}
            onPress={() => router.push(card.href)}
            style={[styles.serviceRow, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
            <View style={[styles.serviceIcon, { backgroundColor: theme.accentSoft }]}>
              <FontAwesome name={card.type === 'wash' ? 'tint' : card.type === 'maintenance' ? 'wrench' : 'cogs'} size={18} color={theme.warm} />
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
            {liveOffers.map(({ shopId, shopName, shopArea, shopType, offer }) => (
              <Pressable
                key={offer.id}
                onPress={() =>
                  router.push(`/shop-profile/${shopId}?offerId=${encodeURIComponent(offer.id)}` as Href)
                }
                style={[styles.offerCard, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
                <Text style={[styles.offerEyebrow, { color: theme.warm }]}>{shopTypeLabel(shopType, locale)}</Text>
                <Text style={[styles.offerTitle, { color: theme.text }]} numberOfLines={2}>
                  {locale === 'ar' ? offer.titleAr || offer.title : offer.title}
                </Text>
                {offer.discountPercentage > 0 ? (
                  <Text style={[styles.offerMeta, { color: theme.danger, fontWeight: '800' }]}>
                    {t('offer_active_badge_pct').replace('{pct}', String(Math.round(offer.discountPercentage)))}
                  </Text>
                ) : null}
                <Text style={[styles.offerMeta, { color: theme.text }]} numberOfLines={1}>
                  {shopName} — {shopArea}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </CurvyCard>

      {(customer || isGuest) ? (
        <Pressable onPress={onSignOut} disabled={signingOut} style={styles.signOut}>
          <Text style={[styles.signOutText, { color: theme.textDim, opacity: signingOut ? 0.5 : 1 }]}>
            {t('home_sign_out')}
          </Text>
        </Pressable>
      ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 52, gap: 2 },
  heroSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
    minHeight: 88,
  },
  heroTextCol: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 88,
    paddingTop: 8,
  },
  heroCarCol: {
    flexShrink: 0,
    width: '38%',
    maxWidth: 220,
    minWidth: 148,
  },
  greeting: { fontSize: 13, fontWeight: '600', letterSpacing: 0.3 },
  title: { fontSize: 32, fontWeight: '900', marginBottom: 8, letterSpacing: -0.5, lineHeight: 38 },
  lead: { fontSize: 17, lineHeight: 24, marginBottom: 16 },
  sectionCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 16,
    marginBottom: 14,
    overflow: 'hidden',
  },
  vehicleSlot: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  vehicleSlotTitle: { fontSize: 15, fontWeight: '900', marginBottom: 4 },
  vehicleSlotSub: { fontSize: 14, lineHeight: 20 },
  manageVehicleWrap: { marginTop: 12, borderRadius: 999, overflow: 'hidden' },
  manageVehicleBtn: { borderRadius: 999, paddingVertical: 13, alignItems: 'center' },
  manageVehicleText: { fontSize: 15, fontWeight: '900', color: '#000000' },
  sectionEyebrow: {
    color: AppTheme.accent,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.6,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  nextBookingCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 16,
    marginBottom: 14,
  },
  nextBookingTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 2 },
  statusBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  statusBadgeText: { fontSize: 12, fontWeight: '900' },
  cardTitle: { color: AppTheme.text, fontSize: 20, fontWeight: '900', marginBottom: 6 },
  cardMeta: { color: AppTheme.textMuted, fontSize: 15, lineHeight: 22 },
  sectionTitle: { color: AppTheme.text, fontSize: 22, fontWeight: '900', marginBottom: 6 },
  sectionSub: { color: AppTheme.textMuted, fontSize: 15, lineHeight: 22, marginBottom: 12 },
  primaryActionWrap: { marginTop: 12, borderRadius: 999, overflow: 'hidden' },
  primaryActionBtn: { paddingVertical: 13, alignItems: 'center', borderRadius: 999 },
  primaryActionText: { fontSize: 15, fontWeight: '900', color: '#000000' },
  searchInput: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 12,
  },
  filtersRow: { gap: 8, paddingBottom: 16 },
  filterChipWrap: { borderRadius: 999, overflow: 'hidden' },
  filterChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  filterChipActive: { borderRadius: 999, paddingHorizontal: 18, paddingVertical: 11 },
  filterChipText: { fontSize: 15, fontWeight: '900' },
  filterChipTextActive: { fontSize: 15, fontWeight: '900', color: '#000000' },
  serviceRow: {
    borderWidth: 1,
    borderRadius: 20,
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
    borderRadius: 22,
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
  offerEyebrow: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', marginBottom: 4 },
  offerMeta: { color: AppTheme.textMuted, fontSize: 14, lineHeight: 20 },
  signOut: { marginTop: 20, alignItems: 'center', paddingVertical: 12 },
  signOutText: { color: AppTheme.textDim, fontSize: 14, fontWeight: '600' },
});
