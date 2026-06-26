import { router, type Href } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ServiceOptionCard } from '@/components/ui/ServiceOptionCard';
import { AppTheme } from '@/constants/Theme';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useI18n } from '@/context/I18nContext';
import { useShopCatalog } from '@/context/ShopCatalogContext';
import { useAppTheme, useThemePreference } from '@/context/ThemePreferenceContext';
import { useAppSignOut } from '@/lib/auth/useAppSignOut';
import { getSavedCarProfile, saveCarProfile } from '@/lib/booking/carProfileStorage';
import { getShopById } from '@/lib/booking/catalogRepository';
import { bookingStatusLabel, formatBookingDateTime, shopTypeLabel } from '@/lib/booking/format';
import { listBookingsForPhone } from '@/lib/booking/storage';
import type { Booking, ShopOffer, ShopType } from '@/lib/booking/types';
import { listAllShopExtras } from '@/lib/booking/shopExtrasStorage';
import { listShopsByType } from '@/lib/booking/catalogRepository';

export default function HomeScreen() {
  const { t, tp, locale } = useI18n();
  const theme = useAppTheme();
  const { effectivePreference } = useThemePreference();
  const { customer, isGuest } = useCustomerAuth();
  const { signOut, busy: signingOut } = useAppSignOut();
  const { ready: catalogReady, version: catalogVersion } = useShopCatalog();
  const [nextBooking, setNextBooking] = useState<Booking | null>(null);
  const [savedCarType, setSavedCarType] = useState('');
  const [carTypeDraft, setCarTypeDraft] = useState('');
  const [saveNotice, setSaveNotice] = useState<{ title: string; body: string } | null>(null);
  const [liveOffers, setLiveOffers] = useState<
    Array<{ shopId: string; shopName: string; shopType: ShopType; offer: ShopOffer }>
  >([]);
  const [serviceSearch, setServiceSearch] = useState('');
  const [serviceFilter, setServiceFilter] = useState<'all' | 'wash'>('all');

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
    const extrasRows = await listAllShopExtras();
    const extrasByShop = new Map(extrasRows.map((row) => [row.shopId, row]));
    const cards: Array<{ shopId: string; shopName: string; shopType: ShopType; offer: ShopOffer }> = [];

    for (const shopType of ['wash', 'maintenance'] as ShopType[]) {
      for (const shop of listShopsByType(shopType)) {
        const extras = extrasByShop.get(shop.id);
        if (!extras?.offers.length) continue;
        const shopName = locale === 'ar' ? shop.nameAr : shop.name;
        for (const offer of extras.offers) {
          cards.push({ shopId: shop.id, shopName, shopType, offer });
        }
      }
    }
    setLiveOffers(cards.slice(0, 8));
  }, [catalogReady, catalogVersion, locale]);

  async function onSignOut() {
    await signOut();
  }

  const refreshHomeData = useCallback(async () => {
    if (!customer) {
      setNextBooking(null);
      setSavedCarType('');
      setCarTypeDraft('');
      return;
    }

    const [profile, bookings] = await Promise.all([
      getSavedCarProfile(customer.id),
      customer.phone ? listBookingsForPhone(customer.phone) : Promise.resolve([]),
    ]);
    const carType = profile?.carType ?? '';
    setSavedCarType(carType);
    setCarTypeDraft(carType);

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
    }, [refreshHomeData, loadLiveOffers]),
  );

  async function onSaveCarProfile() {
    if (!customer) return;
    const carType = carTypeDraft.trim();
    if (!carType) {
      setSaveNotice({ title: t('book_missing_title'), body: t('book_missing_car_type') });
      return;
    }
    await saveCarProfile(customer.id, { carType });
    setSavedCarType(carType);
    setSaveNotice({
      title: t('home_car_profile_saved'),
      body: tp('home_car_profile_saved_body', { carType }),
    });
  }

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
  const backgroundLogo =
    effectivePreference === 'light'
      ? require('../../assets/images/pitstop-logo-light.png')
      : require('../../assets/images/pitstop-logo-dark.png');

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <View pointerEvents="none" style={styles.backgroundLogoWrap}>
        <Image
          source={backgroundLogo}
          style={[styles.backgroundLogo, { opacity: effectivePreference === 'light' ? 0.045 : 0.06 }]}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={[styles.greeting, { color: theme.textMuted }]}>{greeting}</Text>

      {nextBooking ? (
        <Pressable
          onPress={() => router.push('/bookings')}
          style={[styles.nextBookingCard, { backgroundColor: theme.accentSoft, borderColor: theme.accent }]}>
          <Text style={[styles.sectionEyebrow, { color: theme.accent }]}>{t('home_next_booking_title')}</Text>
          <Text style={[styles.cardTitle, { color: theme.text }]}>{nextBookingShopName}</Text>
          <Text style={[styles.cardMeta, { color: theme.textMuted }]}>{formatBookingDateTime(nextBooking.scheduledAt, locale)}</Text>
          <Text style={[styles.cardMeta, { color: theme.textMuted }]}>
            {shopTypeLabel(nextBooking.shopType, locale)} · {bookingStatusLabel(nextBooking.status, locale)}
          </Text>
        </Pressable>
      ) : null}

      <View style={[styles.profileCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>{t('home_car_profile_title')}</Text>
        <Text style={[styles.cardMeta, { color: theme.textMuted }]}>
          {savedCarType
            ? tp('home_car_profile_saved_line', { carType: savedCarType })
            : t('home_car_profile_lead')}
        </Text>
        <View style={styles.profileRow}>
          <TextInput
            value={carTypeDraft}
            onChangeText={setCarTypeDraft}
            placeholder={t('home_car_profile_placeholder')}
            placeholderTextColor={theme.textDim}
            style={[styles.profileInput, { backgroundColor: theme.bgElevated, borderColor: theme.border, color: theme.text }]}
          />
          <Pressable onPress={onSaveCarProfile} style={[styles.profileSaveBtn, { backgroundColor: theme.accent }]}>
            <Text style={[styles.profileSaveText, { color: theme.onAccent }]}>{t('home_car_profile_save')}</Text>
          </Pressable>
        </View>
      </View>

      <Text style={[styles.title, { color: theme.text }]}>{t('home_pick_service')}</Text>
      <Text style={[styles.lead, { color: theme.textMuted }]}>{t('home_pick_service_lead')}</Text>

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
        ).map((chip) => (
          <Pressable
            key={chip.id}
            onPress={() => setServiceFilter(chip.id)}
            style={[
              styles.filterChip,
              { borderColor: theme.border, backgroundColor: theme.bgElevated },
              serviceFilter === chip.id && { backgroundColor: theme.accent, borderColor: theme.accent },
            ]}>
            <Text
              style={[
                styles.filterChipText,
                { color: serviceFilter === chip.id ? theme.onAccent : theme.textMuted },
              ]}>
              {chip.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {serviceCards.map((card) => (
        <ServiceOptionCard
          key={card.type}
          type={card.type}
          title={card.title}
          subtitle={card.subtitle}
          onPress={() => router.push(card.href)}
        />
      ))}

      <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('home_offers_carousel')}</Text>
      <Text style={[styles.offerMeta, { color: theme.textMuted, marginBottom: 10 }]}>{t('home_offers_title')}</Text>
      {liveOffers.length === 0 ? (
        <Text style={[styles.offerMeta, { color: theme.textMuted, marginBottom: 8 }]}>{t('home_offers_empty')}</Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.offersCarousel}>
          {liveOffers.map(({ shopId, shopName, shopType, offer }) => (
            <Pressable
              key={offer.id}
              onPress={() => router.push(`/shop-profile/${shopId}` as Href)}
              style={[styles.offerCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.offerEyebrow, { color: theme.accent }]}>{shopTypeLabel(shopType, locale)}</Text>
              <Text style={[styles.offerTitle, { color: theme.text }]} numberOfLines={2}>
                {locale === 'ar' ? offer.titleAr || offer.title : offer.title}
              </Text>
              <Text style={[styles.offerMeta, { color: theme.textMuted }]} numberOfLines={1}>
                {shopName}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {(customer || isGuest) ? (
        <Pressable onPress={onSignOut} disabled={signingOut} style={styles.signOut}>
          <Text style={[styles.signOutText, { color: theme.textDim, opacity: signingOut ? 0.5 : 1 }]}>
            {t('home_sign_out')}
          </Text>
        </Pressable>
      ) : null}
      </ScrollView>

      <Modal
        visible={!!saveNotice}
        transparent
        animationType="fade"
        onRequestClose={() => setSaveNotice(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{saveNotice?.title}</Text>
            <Text style={[styles.modalBody, { color: theme.textMuted }]}>{saveNotice?.body}</Text>
            <Pressable
              onPress={() => setSaveNotice(null)}
              style={[styles.modalBtnPrimary, { backgroundColor: theme.accent, marginTop: 16 }]}>
              <Text style={[styles.modalBtnPrimaryText, { color: theme.onAccent }]}>{t('welcome_ok')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flex: 1 },
  backgroundLogoWrap: {
    position: 'absolute',
    top: 56,
    alignSelf: 'center',
    width: 820,
    height: 820,
  },
  backgroundLogo: { width: '100%', height: '100%' },
  content: { padding: 20, paddingBottom: 40 },
  greeting: { color: AppTheme.textMuted, fontSize: 14, marginBottom: 6 },
  title: { color: AppTheme.text, fontSize: 28, fontWeight: '900', marginBottom: 8 },
  lead: { color: AppTheme.textMuted, fontSize: 15, lineHeight: 22, marginBottom: 24 },
  sectionEyebrow: {
    color: AppTheme.accent,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.6,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  nextBookingCard: {
    backgroundColor: AppTheme.accentSoft,
    borderWidth: 1,
    borderColor: AppTheme.accent,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
  },
  profileCard: {
    backgroundColor: AppTheme.card,
    borderWidth: 1,
    borderColor: AppTheme.border,
    borderRadius: 18,
    padding: 16,
    marginBottom: 22,
  },
  cardTitle: { color: AppTheme.text, fontSize: 17, fontWeight: '900', marginBottom: 4 },
  cardMeta: { color: AppTheme.textMuted, fontSize: 13, lineHeight: 19 },
  profileRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  profileInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: AppTheme.border,
    backgroundColor: AppTheme.bgElevated,
    color: AppTheme.text,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  profileSaveBtn: {
    backgroundColor: AppTheme.accent,
    borderRadius: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileSaveText: { fontSize: 13, fontWeight: '800' },
  sectionTitle: { color: AppTheme.text, fontSize: 20, fontWeight: '900', marginTop: 6, marginBottom: 12 },
  searchInput: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    marginBottom: 10,
  },
  filtersRow: { gap: 8, paddingBottom: 14 },
  filterChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  filterChipText: { fontSize: 13, fontWeight: '800' },
  offersCarousel: { gap: 12, paddingBottom: 4 },
  offerCard: {
    width: 220,
    backgroundColor: AppTheme.card,
    borderWidth: 1,
    borderColor: AppTheme.border,
    borderRadius: 16,
    padding: 14,
  },
  offerTitle: { color: AppTheme.text, fontSize: 14, fontWeight: '900', marginBottom: 6 },
  offerEyebrow: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', marginBottom: 4 },
  offerMeta: { color: AppTheme.textMuted, fontSize: 12, lineHeight: 17 },
  signOut: { marginTop: 20, alignItems: 'center', paddingVertical: 12 },
  signOutText: { color: AppTheme.textDim, fontSize: 14, fontWeight: '600' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderRadius: 18,
    padding: 20,
  },
  modalTitle: { fontSize: 20, fontWeight: '900', marginBottom: 10 },
  modalBody: { fontSize: 15, lineHeight: 22 },
  modalBtnPrimary: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalBtnPrimaryText: { fontSize: 15, fontWeight: '800' },
});
