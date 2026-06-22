import { router, type Href } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ServiceOptionCard } from '@/components/ui/ServiceOptionCard';
import { AppTheme } from '@/constants/Theme';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useI18n } from '@/context/I18nContext';
import { getSavedCarProfile, saveCarProfile } from '@/lib/booking/carProfileStorage';
import { getShopById } from '@/lib/booking/demoShops';
import { bookingStatusLabel, formatBookingDateTime, shopTypeLabel } from '@/lib/booking/format';
import { listBookingsForPhone } from '@/lib/booking/storage';
import type { Booking } from '@/lib/booking/types';

export default function HomeScreen() {
  const { t, tp, locale } = useI18n();
  const { customer, logout } = useCustomerAuth();
  const [nextBooking, setNextBooking] = useState<Booking | null>(null);
  const [savedCarType, setSavedCarType] = useState('');
  const [carTypeDraft, setCarTypeDraft] = useState('');

  async function onSignOut() {
    await logout();
    router.replace('/welcome');
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
    }, [refreshHomeData]),
  );

  async function onSaveCarProfile() {
    if (!customer) return;
    const carType = carTypeDraft.trim();
    if (!carType) {
      Alert.alert(t('book_missing_title'), t('book_missing_car_type'));
      return;
    }
    await saveCarProfile(customer.id, { carType });
    setSavedCarType(carType);
    Alert.alert(t('home_car_profile_saved'), carType);
  }

  const greeting = customer
    ? tp('home_greeting_named', { name: customer.name.split(' ')[0] ?? customer.name })
    : t('home_greeting');
  const nextBookingShop = nextBooking ? getShopById(nextBooking.shopId) : undefined;
  const nextBookingShopName = nextBookingShop
    ? locale === 'ar'
      ? nextBookingShop.nameAr
      : nextBookingShop.name
    : nextBooking?.shopId;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.greeting}>{greeting}</Text>

      {nextBooking ? (
        <Pressable onPress={() => router.push('/bookings')} style={styles.nextBookingCard}>
          <Text style={styles.sectionEyebrow}>{t('home_next_booking_title')}</Text>
          <Text style={styles.cardTitle}>{nextBookingShopName}</Text>
          <Text style={styles.cardMeta}>{formatBookingDateTime(nextBooking.scheduledAt, locale)}</Text>
          <Text style={styles.cardMeta}>
            {shopTypeLabel(nextBooking.shopType, locale)} · {bookingStatusLabel(nextBooking.status, locale)}
          </Text>
        </Pressable>
      ) : null}

      <View style={styles.profileCard}>
        <Text style={styles.cardTitle}>{t('home_car_profile_title')}</Text>
        <Text style={styles.cardMeta}>
          {savedCarType
            ? tp('home_car_profile_saved_line', { carType: savedCarType })
            : t('home_car_profile_lead')}
        </Text>
        <View style={styles.profileRow}>
          <TextInput
            value={carTypeDraft}
            onChangeText={setCarTypeDraft}
            placeholder={t('home_car_profile_placeholder')}
            placeholderTextColor={AppTheme.textDim}
            style={styles.profileInput}
          />
          <Pressable onPress={onSaveCarProfile} style={styles.profileSaveBtn}>
            <Text style={styles.profileSaveText}>{t('home_car_profile_save')}</Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.title}>{t('home_pick_service')}</Text>
      <Text style={styles.lead}>{t('home_pick_service_lead')}</Text>

      <ServiceOptionCard
        type="maintenance"
        title={t('service_maintenance_title')}
        subtitle={t('service_maintenance_sub')}
        onPress={() => router.push(`/service/maintenance` as Href)}
      />
      <ServiceOptionCard
        type="wash"
        title={t('service_wash_title')}
        subtitle={t('service_wash_sub')}
        onPress={() => router.push(`/service/wash` as Href)}
      />
      <ServiceOptionCard
        type="parts"
        title={t('service_parts_title')}
        subtitle={t('service_parts_sub')}
        onPress={() => router.push(`/service/parts` as Href)}
      />
      <ServiceOptionCard
        type="winch"
        title={t('service_winch_title')}
        subtitle={t('service_winch_sub')}
        onPress={() => router.push(`/service/winch` as Href)}
      />

      <Text style={styles.sectionTitle}>{t('home_offers_title')}</Text>
      <View style={styles.offersRow}>
        <Pressable onPress={() => router.push('/service/wash' as Href)} style={styles.offerCard}>
          <Text style={styles.offerTitle}>{t('home_offer_wash_title')}</Text>
          <Text style={styles.offerMeta}>{t('home_offer_wash_body')}</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/service/maintenance' as Href)} style={styles.offerCard}>
          <Text style={styles.offerTitle}>{t('home_offer_maintenance_title')}</Text>
          <Text style={styles.offerMeta}>{t('home_offer_maintenance_body')}</Text>
        </Pressable>
      </View>

      <Pressable onPress={onSignOut} style={styles.signOut}>
        <Text style={styles.signOutText}>{t('home_sign_out')}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppTheme.bg },
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
  profileSaveText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  sectionTitle: { color: AppTheme.text, fontSize: 20, fontWeight: '900', marginTop: 6, marginBottom: 12 },
  offersRow: { flexDirection: 'row', gap: 10 },
  offerCard: {
    flex: 1,
    backgroundColor: AppTheme.card,
    borderWidth: 1,
    borderColor: AppTheme.border,
    borderRadius: 16,
    padding: 14,
  },
  offerTitle: { color: AppTheme.text, fontSize: 14, fontWeight: '900', marginBottom: 6 },
  offerMeta: { color: AppTheme.textMuted, fontSize: 12, lineHeight: 17 },
  signOut: { marginTop: 20, alignItems: 'center', paddingVertical: 12 },
  signOutText: { color: AppTheme.textDim, fontSize: 14, fontWeight: '600' },
});
