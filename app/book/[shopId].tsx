import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BookingDatePicker } from '@/components/ui/BookingDatePicker';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useI18n } from '@/context/I18nContext';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useShopCatalog } from '@/context/ShopCatalogContext';
import { getSavedCarProfile } from '@/lib/booking/carProfileStorage';
import { getShopById } from '@/lib/booking/catalogRepository';
import { getShopExtras, shopHasSavedSchedule } from '@/lib/booking/shopExtrasStorage';
import {
  buildScheduledIso,
  defaultBookingDateYmd,
  formatShopScheduleLine,
  shopTypeLabel,
} from '@/lib/booking/format';
import { formatEgp } from '@/lib/booking/reporting';
import {
  buildSlotsForShopDate,
  getServiceById,
  shopHasCustomerSchedule,
  type SlotAvailability,
  type TimeSlotOption,
} from '@/lib/booking/shopSchedule';
import { createBooking, listBookingsForShop, saveCustomerPhone } from '@/lib/booking/storage';
import { getPrimaryVehicle } from '@/lib/booking/vehicleStorage';
import { formatPhoneDisplay, openPhone, openShopInMaps } from '@/lib/linking/contact';
import { buildBookReturnTo } from '@/lib/auth/returnTo';
import { userAlert } from '@/lib/ui/userAlert';
import { normalizePhoneE164 } from '@/lib/phone';
import type { Booking, ShopExtras } from '@/lib/booking/types';

export default function BookShopScreen() {
  const { shopId, serviceId: rawServiceId } = useLocalSearchParams<{ shopId: string; serviceId?: string }>();
  const serviceId = Array.isArray(rawServiceId) ? rawServiceId[0] : rawServiceId;
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const { t, locale, isRTL } = useI18n();
  const { customer, isGuest } = useCustomerAuth();
  const { ready: catalogReady, version: catalogVersion } = useShopCatalog();

  const shop = useMemo(
    () => (catalogReady && shopId ? getShopById(shopId) : undefined),
    [catalogReady, catalogVersion, shopId],
  );

  const defaultPhone = customer?.phone.replace('+20', '0') ?? '';
  const [phone, setPhone] = useState(defaultPhone);
  const [carType, setCarType] = useState('');
  const [savedCarType, setSavedCarType] = useState('');
  const [editingSavedCar, setEditingSavedCar] = useState(false);
  const [carColor, setCarColor] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');
  const [vehicleId, setVehicleId] = useState<string | undefined>();
  const [dateYmd, setDateYmd] = useState(defaultBookingDateYmd());
  const [timeSlot, setTimeSlot] = useState('');
  const [saving, setSaving] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);
  const [shopExtras, setShopExtras] = useState<ShopExtras | null>(null);
  const [shopBookings, setShopBookings] = useState<Booking[]>([]);

  const selectedService = useMemo(
    () => getServiceById(shopExtras, serviceId),
    [shopExtras, serviceId],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!customer?.id || carType.trim()) return;
      const [profile, vehicle] = await Promise.all([
        getSavedCarProfile(customer.id),
        getPrimaryVehicle(customer.id),
      ]);
      if (!cancelled) {
        if (vehicle) {
          setVehicleId(vehicle.id);
          setCarType(vehicle.makeModel);
          setSavedCarType(vehicle.makeModel);
          if (vehicle.color) setCarColor(vehicle.color);
        } else if (profile?.carType) {
          setSavedCarType(profile.carType);
          setCarType(profile.carType);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customer?.id, carType]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!shop) return;
      const row = await getShopExtras(shop.id);
      if (!cancelled) setShopExtras(row);
    })();
    return () => {
      cancelled = true;
    };
  }, [shop]);

  const refreshShopExtras = useCallback(async () => {
    if (!shop) return;
    const [row, bookings] = await Promise.all([getShopExtras(shop.id), listBookingsForShop(shop.id)]);
    setShopExtras(row);
    setShopBookings(bookings);
  }, [shop]);

  useFocusEffect(
    useCallback(() => {
      refreshShopExtras();
    }, [refreshShopExtras]),
  );

  const hasOwnerSchedule = shopHasCustomerSchedule(shopExtras) || shopHasSavedSchedule(shopExtras);

  const slotExtras = useMemo(() => {
    if (!shopExtras || !selectedService) return shopExtras;
    return { ...shopExtras, serviceDurationMinutes: selectedService.durationMinutes };
  }, [shopExtras, selectedService]);

  const timeSlots = useMemo((): TimeSlotOption[] => {
    if (!hasOwnerSchedule) return [];
    return buildSlotsForShopDate({
      extras: slotExtras,
      dateYmd,
      bookings: shopBookings,
    });
  }, [hasOwnerSchedule, slotExtras, dateYmd, shopBookings]);

  useEffect(() => {
    const available = timeSlots.filter((s) => s.status !== 'booked');
    if (!available.length) {
      setTimeSlot('');
      return;
    }
    if (!timeSlot || !available.some((s) => s.time === timeSlot)) {
      setTimeSlot(available[0].time);
    }
  }, [timeSlots, timeSlot]);

  if (!shop) {
    return (
      <View style={[styles.center, { backgroundColor: palette.background }]}>
        <Text style={{ color: palette.text }}>{t('book_shop_not_found')}</Text>
      </View>
    );
  }

  async function onSubmit() {
    if (isGuest || !customer) {
      router.push({
        pathname: '/auth-required',
        params: {
          intent: 'booking',
          returnTo: buildBookReturnTo(String(shopId), serviceId),
        },
      });
      return;
    }
    if (!shop) return;
    const normalizedPhone = normalizePhoneE164(phone);
    if (!normalizedPhone) {
      userAlert(t('auth_phone_invalid_title'), t('auth_phone_invalid_body'));
      return;
    }
    if (!carType.trim()) {
      userAlert(t('book_missing_title'), t('book_missing_car_type'));
      return;
    }
    const scheduledAt = buildScheduledIso(dateYmd, timeSlot);
    if (!scheduledAt) {
      userAlert(t('book_missing_title'), t('book_invalid_datetime'));
      return;
    }

    const serviceName = selectedService?.name;
    const serviceNameAr = selectedService?.nameAr;
    const serviceDurationMinutes = selectedService?.durationMinutes;
    const servicePriceEgp = selectedService?.priceEgp ?? shopExtras?.servicePriceEgp;

    setSaving(true);
    try {
      await createBooking({
        shopId: shop.id,
        shopType: shop.type,
        customerId: customer?.id,
        customerPhone: normalizedPhone,
        carType: carType.trim(),
        carColor: carColor.trim(),
        scheduledAt,
        serviceId: selectedService?.id ?? serviceId,
        serviceName,
        serviceNameAr,
        serviceDurationMinutes,
        servicePriceEgp,
        customerNotes: customerNotes.trim() || undefined,
        vehicleId,
      });
      await saveCustomerPhone(normalizedPhone);
      setSuccessVisible(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('book_submit_fail_body');
      userAlert(t('book_submit_fail_title'), message);
    } finally {
      setSaving(false);
    }
  }

  function onViewBookings() {
    setSuccessVisible(false);
    router.replace('/bookings');
  }

  const shopName =
    locale === 'ar'
      ? shopExtras?.profileNameAr || shopExtras?.profileName || shop.nameAr
      : shopExtras?.profileName || shop.name;
  const shopAddress =
    locale === 'ar'
      ? shopExtras?.profileAddressAr || shopExtras?.profileAddress || shop.addressAr
      : shopExtras?.profileAddress || shop.address;
  const shopPhone = shopExtras?.profilePhone || shop.phone;

  const serviceLabel = selectedService
    ? locale === 'ar'
      ? selectedService.nameAr || selectedService.name
      : selectedService.name
    : null;

  const selectedSlot = timeSlots.find((s) => s.time === timeSlot);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: palette.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.shopName, { color: palette.text }]}>{shopName}</Text>
        <Text style={[styles.meta, { color: palette.text }]}>
          {shopTypeLabel(shop.type, locale)} · {shopAddress}
        </Text>

        {selectedService ? (
          <View
            style={[
              styles.serviceCard,
              {
                borderColor: colorScheme === 'dark' ? '#444' : '#ddd',
                backgroundColor: colorScheme === 'dark' ? '#1c1c1e' : '#f8fafc',
              },
            ]}>
            <Text style={[styles.serviceName, { color: palette.text }]}>{serviceLabel}</Text>
            <Text style={[styles.serviceMeta, { color: palette.tabIconDefault }]}>
              {formatEgp(selectedService.priceEgp, locale)} · {selectedService.durationMinutes}{' '}
              {locale === 'ar' ? 'دقيقة' : 'min'}
            </Text>
          </View>
        ) : null}

        <View style={styles.shopContactRow}>
          <Pressable
            onPress={() => openPhone(shopPhone).catch(() => Alert.alert(t('settings_link_fail_title'), t('settings_link_fail_body')))}
            style={[styles.contactChip, { borderColor: palette.tint }]}>
            <Text style={[styles.contactChipText, { color: palette.tint }]}>
              {t('book_call_shop')} · {formatPhoneDisplay(shopPhone)}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => openShopInMaps(shop, locale).catch(() => Alert.alert(t('settings_link_fail_title'), t('settings_link_fail_body')))}
            style={[styles.contactChip, { borderColor: palette.tint }]}>
            <Text style={[styles.contactChipText, { color: palette.tint }]}>{t('book_open_maps')}</Text>
          </Pressable>
        </View>

        <Text style={[styles.label, { color: palette.text }]}>{t('book_your_phone_label')}</Text>
        <TextInput
          placeholder={t('auth_phone_placeholder')}
          placeholderTextColor={palette.tabIconDefault}
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
          style={inputStyle(colorScheme, palette)}
        />

        <Text style={[styles.label, { color: palette.text }]}>{t('book_car_type_label')}</Text>
        {savedCarType && !editingSavedCar ? (
          <View
            style={[
              styles.savedCarCard,
              {
                borderColor: colorScheme === 'dark' ? '#444' : '#ccc',
                backgroundColor: colorScheme === 'dark' ? '#1c1c1e' : '#fff',
              },
            ]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.savedCarLabel, { color: palette.tabIconDefault }]}>
                {t('home_car_profile_title')}
              </Text>
              <Text style={[styles.savedCarText, { color: palette.text }]}>{savedCarType}</Text>
            </View>
            <Pressable onPress={() => setEditingSavedCar(true)} style={styles.changeCarBtn}>
              <Text style={{ color: palette.tint, fontWeight: '800', fontSize: 13 }}>
                {t('home_car_profile_change')}
              </Text>
            </Pressable>
          </View>
        ) : (
          <TextInput
            placeholder={t('book_car_type_placeholder')}
            placeholderTextColor={palette.tabIconDefault}
            value={carType}
            onChangeText={setCarType}
            style={inputStyle(colorScheme, palette)}
          />
        )}

        <Text style={[styles.label, { color: palette.text }]}>{t('book_car_color_label')}</Text>
        <TextInput
          placeholder={t('book_car_color_placeholder')}
          placeholderTextColor={palette.tabIconDefault}
          value={carColor}
          onChangeText={setCarColor}
          style={inputStyle(colorScheme, palette)}
        />

        <Text style={[styles.label, { color: palette.text }]}>{t('book_customer_notes_label')}</Text>
        <TextInput
          placeholder={t('book_customer_notes_placeholder')}
          placeholderTextColor={palette.tabIconDefault}
          value={customerNotes}
          onChangeText={setCustomerNotes}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          style={[inputStyle(colorScheme, palette), styles.notesInput]}
        />

        <BookingDatePicker
          valueYmd={dateYmd}
          onChangeYmd={setDateYmd}
          locale={locale}
          label={t('book_date_label')}
          pickHint={t('book_date_pick_hint')}
          borderColor={colorScheme === 'dark' ? '#444' : '#ccc'}
          backgroundColor={colorScheme === 'dark' ? '#1c1c1e' : '#fff'}
          textColor={palette.text}
        />

        {hasOwnerSchedule && shopExtras?.workOpenTime && shopExtras.workCloseTime && shopExtras.serviceDurationMinutes ? (
          <Text style={[styles.scheduleHint, { color: palette.tabIconDefault }]}>
            {formatShopScheduleLine(
              shopExtras.workOpenTime,
              shopExtras.workCloseTime,
              selectedService?.durationMinutes ?? shopExtras.serviceDurationMinutes,
              locale,
            )}
          </Text>
        ) : hasOwnerSchedule ? null : (
          <Text style={[styles.scheduleHint, { color: palette.tabIconDefault }]}>{t('book_no_shop_hours')}</Text>
        )}

        <Text style={[styles.label, { color: palette.text }]}>{t('book_time_label')}</Text>
        {!hasOwnerSchedule ? (
          <Text style={[styles.meta, { color: palette.tabIconDefault }]}>{t('book_no_shop_hours')}</Text>
        ) : timeSlots.length === 0 ? (
          <Text style={[styles.meta, { color: palette.tabIconDefault }]}>{t('book_no_slots')}</Text>
        ) : (
          <View style={[styles.slots, isRTL && styles.slotsRtl]}>
            {timeSlots.map((slot) => {
              const active = slot.time === timeSlot;
              const disabled = slot.status === 'booked';
              return (
                <Pressable
                  key={slot.time}
                  onPress={() => !disabled && setTimeSlot(slot.time)}
                  disabled={disabled}
                  style={[
                    styles.slot,
                    slotStyle(slot.status, active, disabled, colorScheme, palette),
                  ]}>
                  <Text
                    style={{
                      color: disabled ? palette.tabIconDefault : active ? '#fff' : palette.text,
                      fontWeight: '600',
                      opacity: disabled ? 0.5 : 1,
                    }}>
                    {slot.time}
                  </Text>
                  {slot.status !== 'available' ? (
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: '700',
                        color: disabled ? palette.tabIconDefault : active ? '#fff' : '#b45309',
                        marginTop: 2,
                      }}>
                      {slot.status === 'booked' ? t('slot_booked') : t('slot_almost_full')}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        )}

        {timeSlot && selectedSlot?.status !== 'booked' ? (
          <View
            style={[
              styles.summaryCard,
              {
                borderColor: colorScheme === 'dark' ? '#444' : '#ddd',
                backgroundColor: colorScheme === 'dark' ? '#1c1c1e' : '#f8fafc',
              },
            ]}>
            <Text style={[styles.summaryTitle, { color: palette.text }]}>{t('book_summary_title')}</Text>
            <Text style={[styles.summaryLine, { color: palette.text }]}>{shopName}</Text>
            {serviceLabel ? (
              <Text style={[styles.summaryLine, { color: palette.tabIconDefault }]}>
                {serviceLabel}
                {selectedService ? ` · ${formatEgp(selectedService.priceEgp, locale)}` : ''}
              </Text>
            ) : null}
            <Text style={[styles.summaryLine, { color: palette.tabIconDefault }]}>
              {carType.trim() || '—'}
              {carColor.trim() ? ` · ${carColor.trim()}` : ''}
            </Text>
            <Text style={[styles.summaryLine, { color: palette.tabIconDefault }]}>
              {dateYmd} · {timeSlot}
            </Text>
            {customerNotes.trim() ? (
              <Text style={[styles.summaryLine, { color: palette.tabIconDefault }]}>
                {customerNotes.trim()}
              </Text>
            ) : null}
          </View>
        ) : null}

        <Text style={[styles.policyText, { color: palette.tabIconDefault }]}>{t('book_cancellation_policy')}</Text>

        <Pressable
          onPress={onSubmit}
          disabled={saving || !timeSlot || selectedSlot?.status === 'booked'}
          style={[
            styles.primaryBtn,
            { backgroundColor: palette.tint, opacity: saving || !timeSlot ? 0.65 : 1 },
          ]}>
          <Text style={styles.primaryBtnText}>{saving ? t('book_saving') : t('book_submit')}</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={successVisible} transparent animationType="fade" onRequestClose={onViewBookings}>
        <View style={styles.successBackdrop}>
          <View
            style={[
              styles.successCard,
              {
                backgroundColor: colorScheme === 'dark' ? '#111' : '#fff',
                borderColor: colorScheme === 'dark' ? '#333' : '#ddd',
              },
            ]}>
            <View style={[styles.successIconWrap, { backgroundColor: palette.tint }]}>
              <FontAwesome name="check" size={28} color="#fff" />
            </View>
            <Text style={[styles.successTitle, { color: palette.text }]}>{t('book_success_title')}</Text>
            <Text style={[styles.successBody, { color: palette.tabIconDefault }]}>{t('book_success_body')}</Text>
            <Pressable onPress={onViewBookings} style={[styles.successBtn, { backgroundColor: palette.tint }]}>
              <Text style={styles.successBtnText}>{t('book_success_view_bookings')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function slotStyle(
  status: SlotAvailability,
  active: boolean,
  disabled: boolean,
  colorScheme: 'light' | 'dark' | null | undefined,
  palette: (typeof Colors)['light'],
) {
  if (disabled) {
    return {
      backgroundColor: colorScheme === 'dark' ? '#1a1a1a' : '#eee',
      borderColor: colorScheme === 'dark' ? '#333' : '#ccc',
    };
  }
  if (active) {
    return { backgroundColor: palette.tint, borderColor: palette.tint };
  }
  if (status === 'almost_full') {
    return {
      backgroundColor: colorScheme === 'dark' ? '#2a2008' : '#fef3c7',
      borderColor: '#f59e0b',
    };
  }
  return {
    backgroundColor: colorScheme === 'dark' ? '#1c1c1e' : '#f0f4f8',
    borderColor: colorScheme === 'dark' ? '#444' : '#ddd',
  };
}

function inputStyle(colorScheme: 'light' | 'dark' | null | undefined, palette: (typeof Colors)['light']) {
  return [
    styles.input,
    {
      color: palette.text,
      borderColor: colorScheme === 'dark' ? '#444' : '#ccc',
      backgroundColor: colorScheme === 'dark' ? '#1c1c1e' : '#fff',
    },
  ];
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  content: { padding: 20, paddingBottom: 40 },
  shopName: { fontSize: 22, fontWeight: '800', marginBottom: 4 },
  meta: { fontSize: 14, opacity: 0.8, marginBottom: 10 },
  serviceCard: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 12 },
  serviceName: { fontSize: 17, fontWeight: '800', marginBottom: 4 },
  serviceMeta: { fontSize: 14, fontWeight: '600' },
  shopContactRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  contactChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  contactChipText: { fontSize: 13, fontWeight: '700' },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8, marginTop: 10 },
  scheduleHint: { fontSize: 13, lineHeight: 19, marginBottom: 4, marginTop: 4 },
  savedCarCard: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  savedCarLabel: { fontSize: 12, marginBottom: 2 },
  savedCarText: { fontSize: 16, fontWeight: '800' },
  changeCarBtn: { paddingHorizontal: 8, paddingVertical: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 17,
  },
  notesInput: { minHeight: 88, paddingTop: 14 },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotsRtl: { flexDirection: 'row-reverse' },
  slot: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  summaryCard: { borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 16 },
  summaryTitle: { fontSize: 15, fontWeight: '800', marginBottom: 8 },
  summaryLine: { fontSize: 14, lineHeight: 20, marginBottom: 4 },
  policyText: { fontSize: 12, lineHeight: 18, marginTop: 16 },
  primaryBtn: {
    marginTop: 16,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  successBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  successCard: {
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  successIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  successTitle: { fontSize: 22, fontWeight: '900', textAlign: 'center', marginBottom: 10 },
  successBody: { fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: 20 },
  successBtn: {
    width: '100%',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  successBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
