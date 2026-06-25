import { router, useLocalSearchParams } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useEffect, useMemo, useState } from 'react';
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
import { getShopExtras } from '@/lib/booking/shopExtrasStorage';
import {
  TIME_SLOTS,
  buildScheduledIso,
  defaultBookingDateYmd,
  shopTypeLabel,
} from '@/lib/booking/format';
import { createBooking, saveCustomerPhone } from '@/lib/booking/storage';
import { formatPhoneDisplay, openPhone, openShopInMaps } from '@/lib/linking/contact';
import { buildBookReturnTo } from '@/lib/auth/returnTo';
import { normalizePhoneE164 } from '@/lib/phone';
import type { ShopExtras } from '@/lib/booking/types';

export default function BookShopScreen() {
  const { shopId } = useLocalSearchParams<{ shopId: string }>();
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const { t, locale, isRTL } = useI18n();
  const { customer, isGuest } = useCustomerAuth();
  const { ready: catalogReady } = useShopCatalog();

  const shop = useMemo(
    () => (catalogReady && shopId ? getShopById(shopId) : undefined),
    [catalogReady, shopId],
  );

  const defaultPhone = customer?.phone.replace('+20', '0') ?? '';
  const [phone, setPhone] = useState(defaultPhone);
  const [carType, setCarType] = useState('');
  const [savedCarType, setSavedCarType] = useState('');
  const [editingSavedCar, setEditingSavedCar] = useState(false);
  const [carColor, setCarColor] = useState('');
  const [dateYmd, setDateYmd] = useState(defaultBookingDateYmd());
  const [timeSlot, setTimeSlot] = useState(TIME_SLOTS[1]);
  const [saving, setSaving] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);
  const [shopExtras, setShopExtras] = useState<ShopExtras | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!customer?.id || carType.trim()) return;
      const profile = await getSavedCarProfile(customer.id);
      if (!cancelled && profile?.carType) {
        setSavedCarType(profile.carType);
        setCarType(profile.carType);
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
        params: { intent: 'booking', returnTo: buildBookReturnTo(String(shopId)) },
      });
      return;
    }
    if (!shop) return;
    const normalizedPhone = normalizePhoneE164(phone);
    if (!normalizedPhone) {
      Alert.alert(t('auth_phone_invalid_title'), t('auth_phone_invalid_body'));
      return;
    }
    if (!carType.trim()) {
      Alert.alert(t('book_missing_title'), t('book_missing_car_type'));
      return;
    }
    const scheduledAt = buildScheduledIso(dateYmd, timeSlot);
    if (!scheduledAt) {
      Alert.alert(t('book_missing_title'), t('book_invalid_datetime'));
      return;
    }

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
      });
      await saveCustomerPhone(normalizedPhone);
      setSuccessVisible(true);
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

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: palette.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.shopName, { color: palette.text }]}>{shopName}</Text>
        <Text style={[styles.meta, { color: palette.text }]}>
          {shopTypeLabel(shop.type, locale)} · {shopAddress}
        </Text>

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

        <Text style={[styles.label, { color: palette.text }]}>{t('book_time_label')}</Text>
        <View style={[styles.slots, isRTL && styles.slotsRtl]}>
          {TIME_SLOTS.map((slot) => {
            const active = slot === timeSlot;
            return (
              <Pressable
                key={slot}
                onPress={() => setTimeSlot(slot)}
                style={[
                  styles.slot,
                  {
                    backgroundColor: active ? palette.tint : colorScheme === 'dark' ? '#1c1c1e' : '#f0f4f8',
                    borderColor: active ? palette.tint : colorScheme === 'dark' ? '#444' : '#ddd',
                  },
                ]}>
                <Text style={{ color: active ? '#fff' : palette.text, fontWeight: '600' }}>{slot}</Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={onSubmit}
          disabled={saving}
          style={[
            styles.primaryBtn,
            { backgroundColor: palette.tint, opacity: saving ? 0.65 : 1 },
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
  shopContactRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  contactChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  contactChipText: { fontSize: 13, fontWeight: '700' },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8, marginTop: 10 },
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
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotsRtl: { flexDirection: 'row-reverse' },
  slot: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  primaryBtn: {
    marginTop: 24,
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
