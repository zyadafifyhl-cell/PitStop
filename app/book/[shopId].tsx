import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
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
import { getSavedCarProfile } from '@/lib/booking/carProfileStorage';
import { getShopById } from '@/lib/booking/demoShops';
import {
  TIME_SLOTS,
  buildScheduledIso,
  defaultBookingDateYmd,
  shopTypeLabel,
} from '@/lib/booking/format';
import { createBooking, saveCustomerPhone } from '@/lib/booking/storage';
import { formatPhoneDisplay, openPhone, openShopInMaps } from '@/lib/linking/contact';
import { normalizePhoneE164 } from '@/lib/phone';

export default function BookShopScreen() {
  const { shopId } = useLocalSearchParams<{ shopId: string }>();
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const { t, locale, isRTL } = useI18n();
  const { customer } = useCustomerAuth();

  const shop = useMemo(() => (shopId ? getShopById(shopId) : undefined), [shopId]);

  const defaultPhone = customer?.phone.replace('+20', '0') ?? '';
  const [phone, setPhone] = useState(defaultPhone);
  const [carType, setCarType] = useState('');
  const [savedCarType, setSavedCarType] = useState('');
  const [editingSavedCar, setEditingSavedCar] = useState(false);
  const [carColor, setCarColor] = useState('');
  const [dateYmd, setDateYmd] = useState(defaultBookingDateYmd());
  const [timeSlot, setTimeSlot] = useState(TIME_SLOTS[1]);
  const [saving, setSaving] = useState(false);

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

  if (!shop) {
    return (
      <View style={[styles.center, { backgroundColor: palette.background }]}>
        <Text style={{ color: palette.text }}>{t('book_shop_not_found')}</Text>
      </View>
    );
  }

  async function onSubmit() {
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
      Alert.alert(t('book_success_title'), t('book_success_body'), [
        { text: t('welcome_ok'), onPress: () => router.replace('/bookings') },
      ]);
    } finally {
      setSaving(false);
    }
  }

  const shopName = locale === 'ar' ? shop.nameAr : shop.name;
  const shopAddress = locale === 'ar' ? shop.addressAr : shop.address;

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
            onPress={() => openPhone(shop.phone).catch(() => Alert.alert(t('settings_link_fail_title'), t('settings_link_fail_body')))}
            style={[styles.contactChip, { borderColor: palette.tint }]}>
            <Text style={[styles.contactChipText, { color: palette.tint }]}>
              {t('book_call_shop')} · {formatPhoneDisplay(shop.phone)}
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
});
