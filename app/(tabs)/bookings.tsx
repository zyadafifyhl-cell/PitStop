import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { listCustomerInvoices } from '@/lib/booking/commerceEvents';
import { getShopById } from '@/lib/booking/demoShops';
import { bookingStatusLabel, formatBookingDateTime, shopTypeLabel } from '@/lib/booking/format';
import { formatEgp } from '@/lib/booking/reporting';
import { listBookingsForPhone } from '@/lib/booking/storage';
import type { Booking, CustomerInvoice } from '@/lib/booking/types';

export default function MyBookingsScreen() {
  const { t, locale } = useI18n();
  const theme = useAppTheme();
  const { customer } = useCustomerAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
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
        const invoiceRows = await listCustomerInvoices({
          customerId: customer.id,
          customerPhone: customer.phone,
        });
        if (!cancelled) {
          setBookings(rows);
          setInvoices(invoiceRows);
          setBusy(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [customer?.phone]),
  );

  function partsStatusLabel(status: CustomerInvoice['status']): string {
    if (status === 'pending') return t('parts_status_pending');
    if (status === 'confirmed') return t('parts_status_confirmed');
    if (status === 'cancelled') return t('parts_status_cancelled');
    return t('parts_status_shipped');
  }

  return (
    <ScrollView style={[styles.screen, { backgroundColor: theme.bg }]} contentContainerStyle={styles.content}>
      <Text style={[styles.lead, { color: theme.textMuted }]}>{t('bookings_lead_customer')}</Text>
      {customer ? (
        <Text style={[styles.phoneLine, { color: theme.text }]}>
          {t('book_phone_label')}: {customer.phone.replace('+20', '0')}
        </Text>
      ) : null}

      {busy ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={theme.accent} />
      ) : (
        <>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('bookings_services_section')}</Text>
          <FlatList
            data={bookings}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            style={{ marginTop: 12 }}
            contentContainerStyle={bookings.length === 0 ? styles.emptyWrap : undefined}
            ListEmptyComponent={<Text style={[styles.empty, { color: theme.textMuted }]}>{t('bookings_empty')}</Text>}
            renderItem={({ item }) => {
              const shop = getShopById(item.shopId);
              const shopName = shop
                ? locale === 'ar'
                  ? shop.nameAr
                  : shop.name
                : item.shopId;
              return (
                <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.card }]}>
                  <Text style={[styles.shopName, { color: theme.text }]}>{shopName}</Text>
                  <Text style={[styles.meta, { color: theme.textMuted }]}>
                    {shopTypeLabel(item.shopType, locale)} · {bookingStatusLabel(item.status, locale)}
                  </Text>
                  <Text style={[styles.meta, { color: theme.textMuted }]}>{formatBookingDateTime(item.scheduledAt, locale)}</Text>
                  <Text style={[styles.meta, { color: theme.textMuted }]}>
                    {item.carType}
                    {item.carColor ? ` · ${item.carColor}` : ''}
                  </Text>
                </View>
              );
            }}
          />

          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('bookings_parts_invoices_section')}</Text>
          {invoices.length === 0 ? (
            <Text style={[styles.empty, { color: theme.textMuted }]}>{t('bookings_parts_invoices_empty')}</Text>
          ) : (
            invoices.map((invoice) => {
              const shop = getShopById(invoice.shopId);
              const shopName = shop ? (locale === 'ar' ? shop.nameAr : shop.name) : invoice.shopId;
              return (
                <View key={invoice.id} style={[styles.card, { borderColor: theme.border, backgroundColor: theme.card }]}>
                  <Text style={[styles.shopName, { color: theme.text }]}>{shopName}</Text>
                  <Text style={[styles.meta, { color: theme.textMuted }]}>
                    {t('parts_order_money_line')
                      .replace('{subtotal}', formatEgp(invoice.subtotalEgp, locale))
                      .replace('{fee}', formatEgp(invoice.platformFeeEgp, locale))
                      .replace('{total}', formatEgp(invoice.totalEgp, locale))}
                  </Text>
                  <Text style={[styles.meta, { color: theme.textMuted }]}>
                    {t('parts_shipping_address_label')}: {invoice.shippingAddress}
                  </Text>
                  <Text style={[styles.meta, { color: theme.textMuted }]}>
                    {t('bookings_parts_status_prefix')}: {partsStatusLabel(invoice.status)}
                  </Text>
                  <Text style={[styles.meta, { color: theme.textMuted }]}>
                    {new Date(invoice.createdAt).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-EG')}
                  </Text>
                  <Text style={[styles.meta, { color: theme.textMuted }]}>
                    {invoice.emailedAt
                      ? t('bookings_invoice_emailed')
                      : t('bookings_invoice_not_emailed')}
                  </Text>
                </View>
              );
            })
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  lead: { fontSize: 15, lineHeight: 22 },
  phoneLine: { fontSize: 14, marginTop: 8, fontWeight: '600' },
  sectionTitle: { fontSize: 15, fontWeight: '800', marginTop: 16, marginBottom: 4 },
  emptyWrap: { flexGrow: 1, justifyContent: 'center' },
  empty: { textAlign: 'center' },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  shopName: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  meta: { fontSize: 14, marginTop: 2 },
});
