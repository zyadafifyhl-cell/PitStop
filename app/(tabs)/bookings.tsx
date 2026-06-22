import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AppTheme } from '@/constants/Theme';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useI18n } from '@/context/I18nContext';
import { getShopById } from '@/lib/booking/demoShops';
import { bookingStatusLabel, formatBookingDateTime, shopTypeLabel } from '@/lib/booking/format';
import { listBookingsForPhone } from '@/lib/booking/storage';
import type { Booking } from '@/lib/booking/types';

export default function MyBookingsScreen() {
  const { t, locale } = useI18n();
  const { customer } = useCustomerAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [busy, setBusy] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setBusy(true);
        if (!customer?.phone) {
          if (!cancelled) {
            setBookings([]);
            setBusy(false);
          }
          return;
        }
        const rows = await listBookingsForPhone(customer.phone);
        if (!cancelled) {
          setBookings(rows);
          setBusy(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [customer?.phone]),
  );

  return (
    <View style={styles.screen}>
      <Text style={styles.lead}>{t('bookings_lead_customer')}</Text>
      {customer ? (
        <Text style={styles.phoneLine}>
          {t('book_phone_label')}: {customer.phone.replace('+20', '0')}
        </Text>
      ) : null}

      {busy ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={AppTheme.accent} />
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(item) => item.id}
          style={{ marginTop: 16 }}
          contentContainerStyle={bookings.length === 0 ? styles.emptyWrap : undefined}
          ListEmptyComponent={
            <Text style={styles.empty}>{t('bookings_empty')}</Text>
          }
          renderItem={({ item }) => {
            const shop = getShopById(item.shopId);
            const shopName = shop
              ? locale === 'ar'
                ? shop.nameAr
                : shop.name
              : item.shopId;
            return (
              <View style={styles.card}>
                <Text style={styles.shopName}>{shopName}</Text>
                <Text style={styles.meta}>
                  {shopTypeLabel(item.shopType, locale)} · {bookingStatusLabel(item.status, locale)}
                </Text>
                <Text style={styles.meta}>{formatBookingDateTime(item.scheduledAt, locale)}</Text>
                <Text style={styles.meta}>
                  {item.carType}
                  {item.carColor ? ` · ${item.carColor}` : ''}
                </Text>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 20, backgroundColor: AppTheme.bg },
  lead: { fontSize: 15, lineHeight: 22, color: AppTheme.textMuted },
  phoneLine: { fontSize: 14, color: AppTheme.text, marginTop: 8, fontWeight: '600' },
  emptyWrap: { flexGrow: 1, justifyContent: 'center' },
  empty: { textAlign: 'center', color: AppTheme.textMuted },
  card: {
    borderWidth: 1,
    borderColor: AppTheme.border,
    backgroundColor: AppTheme.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  shopName: { fontSize: 16, fontWeight: '700', color: AppTheme.text, marginBottom: 4 },
  meta: { fontSize: 14, color: AppTheme.textMuted, marginTop: 2 },
});
