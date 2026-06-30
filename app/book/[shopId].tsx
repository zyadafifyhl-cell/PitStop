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
import { ServiceMultiPicker } from '@/components/booking/ServiceMultiPicker';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useI18n } from '@/context/I18nContext';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useShopCatalog } from '@/context/ShopCatalogContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { formatVehicleDisplay } from '@/components/customer/ActiveVehiclePicker';
import { getSavedCarProfile } from '@/lib/booking/carProfileStorage';
import { getShopById } from '@/lib/booking/catalogRepository';
import { getShopExtras, shopHasSavedSchedule } from '@/lib/booking/shopExtrasStorage';
import {
  buildScheduledIso,
  defaultBookingDateYmd,
  formatBookingDateTime,
  formatShopScheduleLine,
  shopTypeLabel,
} from '@/lib/booking/format';
import { formatEgp } from '@/lib/booking/reporting';
import {
  buildSlotsForShopDate,
  getActiveServices,
  shopHasCustomerSchedule,
  type SlotAvailability,
  type TimeSlotOption,
} from '@/lib/booking/shopSchedule';
import { createBooking, getSavedCustomerPhone, listBookingsForShop, saveCustomerPhone } from '@/lib/booking/storage';
import { getPrimaryVehicle } from '@/lib/booking/vehicleStorage';
import { formatPhoneDisplay, openPhone, openShopInMaps } from '@/lib/linking/contact';
import { buildBookReturnTo } from '@/lib/auth/returnTo';
import { userAlert } from '@/lib/ui/userAlert';
import { normalizePhoneE164 } from '@/lib/phone';
import type { Booking, ShopExtras } from '@/lib/booking/types';

function resolveBookingPhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const local = trimmed.startsWith('+20') ? `0${trimmed.slice(3)}` : trimmed;
  return normalizePhoneE164(local);
}

export default function BookShopScreen() {
  const {
    shopId,
    serviceId: rawServiceId,
    serviceIds: rawServiceIds,
    offerId: rawOfferId,
  } = useLocalSearchParams<{
    shopId: string;
    serviceId?: string;
    serviceIds?: string;
    offerId?: string;
  }>();
  const legacyServiceId = Array.isArray(rawServiceId) ? rawServiceId[0] : rawServiceId;
  const serviceIdsParam = Array.isArray(rawServiceIds) ? rawServiceIds[0] : rawServiceIds;
  const offerId = Array.isArray(rawOfferId) ? rawOfferId[0] : rawOfferId;
  const initialServiceIds = useMemo(() => {
    if (serviceIdsParam) {
      return serviceIdsParam.split(',').map((s: string) => s.trim()).filter(Boolean);
    }
    if (legacyServiceId) return [legacyServiceId];
    return [];
  }, [serviceIdsParam, legacyServiceId]);
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const theme = useAppTheme();
  const { t, locale, isRTL } = useI18n();
  const { customer, isGuest } = useCustomerAuth();
  const { ready: catalogReady, version: catalogVersion } = useShopCatalog();

  const shop = useMemo(
    () => (catalogReady && shopId ? getShopById(shopId) : undefined),
    [catalogReady, catalogVersion, shopId],
  );

  const [resolvedPhone, setResolvedPhone] = useState('');
  const [carType, setCarType] = useState('');
  const [savedCarLabel, setSavedCarLabel] = useState('');
  const [editingSavedCar, setEditingSavedCar] = useState(false);
  const [carColor, setCarColor] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');
  const [vehicleId, setVehicleId] = useState<string | undefined>();
  const [dateYmd, setDateYmd] = useState(defaultBookingDateYmd());
  const [timeSlot, setTimeSlot] = useState('');
  const [saving, setSaving] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);
  const [receiptSummary, setReceiptSummary] = useState<{
    shopName: string;
    serviceLabels: string[];
    totalPrice: number;
    totalMinutes: number;
    scheduledAt: string;
    timeSlot: string;
  } | null>(null);
  const [shopExtras, setShopExtras] = useState<ShopExtras | null>(null);
  const [shopBookings, setShopBookings] = useState<Booking[]>([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>(initialServiceIds);

  const activeServices = useMemo(() => getActiveServices(shopExtras), [shopExtras]);

  useEffect(() => {
    if (initialServiceIds.length) {
      setSelectedServiceIds(initialServiceIds);
      return;
    }
    if (activeServices[0]?.id) {
      setSelectedServiceIds([activeServices[0].id]);
    }
  }, [initialServiceIds.join(','), activeServices.map((s) => s.id).join(',')]);

  const selectedServices = useMemo(
    () =>
      selectedServiceIds
        .map((id) => activeServices.find((s) => s.id === id))
        .filter((s): s is NonNullable<typeof s> => !!s),
    [selectedServiceIds, activeServices],
  );

  const activeOffer = useMemo(
    () => (offerId ? shopExtras?.offers.find((o) => o.id === offerId && o.active) : undefined),
    [offerId, shopExtras],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const profilePhone = customer?.phone?.trim();
      if (profilePhone) {
        if (!cancelled) setResolvedPhone(profilePhone);
        return;
      }
      const saved = await getSavedCustomerPhone();
      if (!cancelled && saved?.trim()) setResolvedPhone(saved.trim());
    })();
    return () => {
      cancelled = true;
    };
  }, [customer?.phone, customer?.id]);

  const loadCarProfileForBooking = useCallback(async () => {
    if (!customer?.id) return;
    const vehicle = await getPrimaryVehicle(customer.id);
    if (vehicle) {
      setVehicleId(vehicle.id);
      setCarType(vehicle.makeModel);
      setSavedCarLabel(formatVehicleDisplay(vehicle));
      setCarColor(vehicle.color ?? '');
      setEditingSavedCar(false);
      return;
    }
    const profile = await getSavedCarProfile(customer.id);
    if (profile?.carType) {
      setSavedCarLabel(profile.carType);
      setCarType(profile.carType);
      setCarColor('');
      setEditingSavedCar(false);
    }
  }, [customer?.id]);

  useFocusEffect(
    useCallback(() => {
      loadCarProfileForBooking();
    }, [loadCarProfileForBooking]),
  );

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
    if (!shopExtras) return shopExtras;
    const duration =
      selectedServices.reduce((sum, s) => sum + s.durationMinutes, 0) ||
      shopExtras.serviceDurationMinutes;
    return { ...shopExtras, serviceDurationMinutes: duration };
  }, [shopExtras, selectedServices]);

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
          returnTo: buildBookReturnTo(
            String(shopId),
            selectedServiceIds.length ? selectedServiceIds : undefined,
            offerId,
          ),
        },
      });
      return;
    }
    if (!shop) return;
    const normalizedPhone = resolveBookingPhone(resolvedPhone);
    if (!normalizedPhone) {
      userAlert(t('book_missing_title'), t('book_missing_phone_profile'));
      return;
    }
    if (!carType.trim()) {
      userAlert(t('book_missing_title'), t('book_missing_car_type'));
      return;
    }
    if (shop.type === 'wash' && activeServices.length && selectedServices.length === 0) {
      userAlert(t('book_missing_title'), t('book_missing_service'));
      return;
    }
    const scheduledAt = buildScheduledIso(dateYmd, timeSlot);
    if (!scheduledAt) {
      userAlert(t('book_missing_title'), t('book_invalid_datetime'));
      return;
    }

    const serviceName = selectedServices.map((s) => s.name).join(' + ') || undefined;
    const serviceNameAr =
      selectedServices.map((s) => s.nameAr || s.name).join(' + ') || undefined;
    const serviceDurationMinutes =
      selectedServices.reduce((sum, s) => sum + s.durationMinutes, 0) || undefined;
    const servicePriceEgp =
      selectedServices.reduce((sum, s) => sum + s.priceEgp, 0) ||
      (shop.type === 'wash' ? activeServices[0]?.priceEgp : shopExtras?.servicePriceEgp);
    const offerNote = activeOffer
      ? locale === 'ar'
        ? activeOffer.titleAr || activeOffer.title
        : activeOffer.title
      : undefined;
    const notesCombined = [offerNote ? `${t('book_offer_applied')}: ${offerNote}` : '', customerNotes.trim()]
      .filter(Boolean)
      .join('\n');

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
        serviceId: selectedServices[0]?.id,
        serviceName,
        serviceNameAr,
        serviceDurationMinutes,
        servicePriceEgp,
        customerNotes: notesCombined || undefined,
        vehicleId,
      });
      await saveCustomerPhone(normalizedPhone);
      setReceiptSummary({
        shopName,
        serviceLabels,
        totalPrice,
        totalMinutes,
        scheduledAt,
        timeSlot,
      });
      setSuccessVisible(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('book_submit_fail_body');
      userAlert(t('book_submit_fail_title'), message);
    } finally {
      setSaving(false);
    }
  }

  function onFinalizeBooking() {
    setSuccessVisible(false);
    setReceiptSummary(null);
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

  const serviceLabels = selectedServices.map((s) =>
    locale === 'ar' ? s.nameAr || s.name : s.name,
  );
  const totalPrice = selectedServices.reduce((sum, s) => sum + s.priceEgp, 0);
  const totalMinutes = selectedServices.reduce((sum, s) => sum + s.durationMinutes, 0);

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

        {activeOffer ? (
          <View style={[styles.offerBanner, { backgroundColor: theme.accentSoft, borderColor: theme.accent }]}>
            <Text style={[styles.offerBannerTitle, { color: theme.accent }]}>{t('book_offer_banner')}</Text>
            <Text style={[styles.offerBannerBody, { color: theme.text }]}>
              {locale === 'ar' ? activeOffer.titleAr || activeOffer.title : activeOffer.title}
            </Text>
          </View>
        ) : null}

        {shop.type === 'wash' && activeServices.length > 0 ? (
          <ServiceMultiPicker
            services={activeServices}
            selectedIds={selectedServiceIds}
            onChange={setSelectedServiceIds}
            disabled={saving}
          />
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
              {t('book_phone_from_profile')}
            </Text>
            <Text style={[styles.savedCarText, { color: palette.text }]}>
              {resolvedPhone ? formatPhoneDisplay(resolvedPhone) : t('book_phone_missing_profile')}
            </Text>
          </View>
        </View>

        <Text style={[styles.label, { color: palette.text }]}>{t('book_car_type_label')}</Text>
        {savedCarLabel && !editingSavedCar ? (
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
                {t('home_active_vehicle_title')}
              </Text>
              <Text style={[styles.savedCarText, { color: palette.text }]}>{savedCarLabel}</Text>
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
              selectedServices[0]?.durationMinutes ?? shopExtras.serviceDurationMinutes,
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
            {serviceLabels.length ? (
              serviceLabels.map((label) => (
                <Text key={label} style={[styles.summaryLine, { color: palette.tabIconDefault }]}>
                  · {label}
                </Text>
              ))
            ) : null}
            {totalPrice > 0 ? (
              <Text style={[styles.summaryLine, { color: palette.tabIconDefault }]}>
                {formatEgp(totalPrice, locale)}
                {totalMinutes > 0
                  ? ` · ${totalMinutes} ${locale === 'ar' ? 'دقيقة' : 'min'}`
                  : ''}
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
          disabled={saving || !timeSlot || !resolvedPhone || selectedSlot?.status === 'booked'}
          style={[
            styles.primaryBtn,
            {
              backgroundColor: palette.tint,
              opacity: saving || !timeSlot || !resolvedPhone ? 0.65 : 1,
            },
          ]}>
          <Text style={styles.primaryBtnText}>{saving ? t('book_saving') : t('book_submit')}</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={successVisible} transparent animationType="fade" onRequestClose={onFinalizeBooking}>
        <View style={styles.successBackdrop}>
          <View
            style={[
              styles.successCard,
              {
                backgroundColor: theme.card,
                borderColor: theme.border,
              },
            ]}>
            <View style={[styles.successIconWrap, { backgroundColor: theme.accent }]}>
              <FontAwesome name="check" size={28} color={theme.onAccent} />
            </View>
            <Text style={[styles.successTitle, { color: theme.text }]}>{t('book_receipt_title')}</Text>
            <Text style={[styles.successLead, { color: theme.textMuted }]}>{t('book_receipt_lead')}</Text>

            <View style={[styles.receiptCard, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
              <Text style={[styles.receiptShop, { color: theme.text }]}>{receiptSummary?.shopName ?? shopName}</Text>

              {receiptSummary?.serviceLabels.length ? (
                <View style={styles.receiptSection}>
                  <Text style={[styles.receiptLabel, { color: theme.textMuted }]}>{t('book_receipt_services')}</Text>
                  {receiptSummary.serviceLabels.map((label) => (
                    <Text key={label} style={[styles.receiptBullet, { color: theme.text }]}>
                      · {label}
                    </Text>
                  ))}
                </View>
              ) : null}

              <View style={styles.receiptSection}>
                <Text style={[styles.receiptLabel, { color: theme.textMuted }]}>{t('book_receipt_total')}</Text>
                <Text style={[styles.receiptValue, { color: theme.text }]}>
                  {formatEgp(receiptSummary?.totalPrice ?? totalPrice, locale)}
                  {(receiptSummary?.totalMinutes ?? totalMinutes) > 0
                    ? ` · ${receiptSummary?.totalMinutes ?? totalMinutes} ${locale === 'ar' ? 'دقيقة' : 'min'}`
                    : ''}
                </Text>
              </View>

              <View style={styles.receiptSection}>
                <Text style={[styles.receiptLabel, { color: theme.textMuted }]}>{t('book_receipt_appointment')}</Text>
                <Text style={[styles.receiptValue, { color: theme.text }]}>
                  {receiptSummary?.scheduledAt
                    ? formatBookingDateTime(receiptSummary.scheduledAt, locale)
                    : `${dateYmd} · ${timeSlot}`}
                </Text>
                {receiptSummary?.timeSlot ? (
                  <Text style={[styles.receiptMeta, { color: theme.textMuted }]}>
                    {t('book_receipt_slot')}: {receiptSummary.timeSlot}
                  </Text>
                ) : null}
              </View>
            </View>

            <Pressable onPress={onFinalizeBooking} style={[styles.successBtn, { backgroundColor: theme.accent }]}>
              <Text style={[styles.successBtnText, { color: theme.onAccent }]}>{t('book_receipt_finalize')}</Text>
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
  offerBanner: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 },
  offerBannerTitle: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', marginBottom: 4 },
  offerBannerBody: { fontSize: 15, fontWeight: '800' },
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
  successTitle: { fontSize: 22, fontWeight: '900', textAlign: 'center', marginBottom: 8 },
  successLead: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 16 },
  receiptCard: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 18,
    gap: 12,
  },
  receiptShop: { fontSize: 18, fontWeight: '900' },
  receiptSection: { gap: 4 },
  receiptLabel: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  receiptBullet: { fontSize: 14, lineHeight: 20 },
  receiptValue: { fontSize: 15, fontWeight: '800', lineHeight: 22 },
  receiptMeta: { fontSize: 13, lineHeight: 18 },
  successBtn: {
    width: '100%',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  successBtnText: { fontWeight: '800', fontSize: 16 },
});
