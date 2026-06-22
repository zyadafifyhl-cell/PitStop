import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import Colors from '@/constants/Colors';
import { BookingDatePicker } from '@/components/ui/BookingDatePicker';
import { useColorScheme } from '@/components/useColorScheme';
import { useI18n } from '@/context/I18nContext';
import {
  buildOwnerReportHtml,
  filterBookingsByRange,
  formatEgp,
  formatRangeLabel,
  normalizeBookingMoney,
  resolveCustomRange,
  resolvePresetRange,
  toYmdLocal,
  type ReportPreset,
} from '@/lib/booking/reporting';
import { useShopAuth } from '@/context/ShopAuthContext';
import { bookingStatusLabel, formatBookingDateTime } from '@/lib/booking/format';
import {
  addInventoryItem,
  listInventoryForShop,
  listPartsOrdersForShop,
  updateInventoryStock,
  updatePartsOrderStatus,
} from '@/lib/booking/partsStorage';
import { listBookingsForShop, updateBookingStatus } from '@/lib/booking/storage';
import type { Booking, BookingStatus, PartsOrder, SparePartItem } from '@/lib/booking/types';

const PRESETS: ReportPreset[] = ['2d', '3d', '7d', '30d', 'custom'];

export default function ShopScreen() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const { t, locale } = useI18n();
  const { ready, shop, busy, login, logout } = useShopAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [reportPreset, setReportPreset] = useState<ReportPreset>('30d');
  const [customStartYmd, setCustomStartYmd] = useState(() => {
    const preset = resolvePresetRange('30d');
    return toYmdLocal(preset.start);
  });
  const [customEndYmd, setCustomEndYmd] = useState(() => toYmdLocal(new Date()));
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [inventory, setInventory] = useState<SparePartItem[]>([]);
  const [partsOrders, setPartsOrders] = useState<PartsOrder[]>([]);
  const [loadingParts, setLoadingParts] = useState(false);
  const [newPartName, setNewPartName] = useState('');
  const [newPartPrice, setNewPartPrice] = useState('');
  const [newPartStock, setNewPartStock] = useState('1');
  const [newPartImage, setNewPartImage] = useState('');

  const refreshBookings = useCallback(async () => {
    if (!shop) return;
    setLoadingBookings(true);
    const rows = await listBookingsForShop(shop.id);
    setBookings(rows);
    setLoadingBookings(false);
  }, [shop]);

  const refreshPartsData = useCallback(async () => {
    if (!shop || shop.type !== 'parts') return;
    setLoadingParts(true);
    try {
      const [invRows, orderRows] = await Promise.all([
        listInventoryForShop(shop.id),
        listPartsOrdersForShop(shop.id),
      ]);
      setInventory(invRows);
      setPartsOrders(orderRows);
    } finally {
      setLoadingParts(false);
    }
  }, [shop]);

  useFocusEffect(
    useCallback(() => {
      if (!shop) return;
      if (shop.type === 'parts') refreshPartsData();
      else refreshBookings();
    }, [shop, refreshBookings, refreshPartsData]),
  );

  const reportRange = useMemo(() => {
    if (reportPreset === 'custom') return resolveCustomRange(customStartYmd, customEndYmd);
    return resolvePresetRange(reportPreset);
  }, [reportPreset, customStartYmd, customEndYmd]);

  const reportBookings = useMemo(() => {
    if (!reportRange) return [];
    return filterBookingsByRange(bookings, reportRange);
  }, [bookings, reportRange]);

  const financialTotals = useMemo(() => {
    return reportBookings.reduce(
      (acc, booking) => {
        const money = normalizeBookingMoney(booking);
        acc.gross += money.servicePriceEgp;
        acc.fee += money.platformFeeEgp;
        acc.net += money.ownerNetEgp;
        return acc;
      },
      { gross: 0, fee: 0, net: 0 },
    );
  }, [reportBookings]);

  async function onLogin() {
    const ok = await login(email, password);
    if (!ok) {
      Alert.alert(t('shop_login_fail_title'), t('shop_login_fail_body'));
    }
  }

  async function onLogout() {
    await logout();
    router.replace('/welcome');
  }

  async function onStatusChange(bookingId: string, status: BookingStatus) {
    await updateBookingStatus(bookingId, status);
    await refreshBookings();
  }

  async function onAddPart() {
    if (!shop || shop.type !== 'parts') return;
    const price = Number(newPartPrice);
    const stock = Number(newPartStock);
    if (!newPartName.trim() || Number.isNaN(price) || price < 0 || Number.isNaN(stock) || stock < 0) {
      Alert.alert(t('parts_owner_invalid_part_title'), t('parts_owner_invalid_part_body'));
      return;
    }
    await addInventoryItem(shop.id, {
      name: newPartName,
      priceEgp: price,
      stockQty: stock,
      imageUrl: newPartImage,
    });
    setNewPartName('');
    setNewPartPrice('');
    setNewPartStock('1');
    setNewPartImage('');
    await refreshPartsData();
  }

  async function onAdjustStock(partId: string, delta: number) {
    if (!shop || shop.type !== 'parts') return;
    await updateInventoryStock(shop.id, partId, delta);
    await refreshPartsData();
  }

  async function onPartsOrderStatusChange(orderId: string, status: PartsOrder['status']) {
    if (!shop || shop.type !== 'parts') return;
    await updatePartsOrderStatus(shop.id, orderId, status);
    await refreshPartsData();
  }

  async function onGeneratePdf() {
    if (!shop) return;
    if (!reportRange) {
      Alert.alert(t('shop_report_invalid_range_title'), t('shop_report_invalid_range_body'));
      return;
    }

    const rangeLabel = formatRangeLabel(reportRange, locale);
    const html = buildOwnerReportHtml({
      shop,
      bookings: reportBookings,
      range: reportRange,
      rangeLabel,
      generatedAt: new Date(),
      locale,
    });

    setGeneratingPdf(true);
    try {
      if (Platform.OS === 'web') {
        await Print.printAsync({ html });
        return;
      }
      const file = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/pdf',
          dialogTitle: t('shop_report_share_pdf'),
        });
      } else {
        Alert.alert(t('shop_report_pdf_ready_title'), file.uri);
      }
    } catch {
      Alert.alert(t('shop_report_pdf_fail_title'), t('shop_report_pdf_fail_body'));
    } finally {
      setGeneratingPdf(false);
    }
  }

  function confirmAction(bookingId: string, status: BookingStatus, title: string, body: string) {
    Alert.alert(title, body, [
      { text: t('alert_cancel'), style: 'cancel' },
      { text: t('shop_confirm_action'), onPress: () => onStatusChange(bookingId, status) },
    ]);
  }

  function partsStatusLabel(status: PartsOrder['status']) {
    if (status === 'pending') return t('parts_status_pending');
    if (status === 'confirmed') return t('parts_status_confirmed');
    if (status === 'cancelled') return t('parts_status_cancelled');
    return t('parts_status_shipped');
  }

  if (!ready) {
    return (
      <View style={[styles.center, { backgroundColor: palette.background }]}>
        <ActivityIndicator color={palette.tint} />
      </View>
    );
  }

  if (!shop) {
    return (
      <ScrollView
        style={[styles.screen, { backgroundColor: palette.background }]}
        contentContainerStyle={styles.loginContent}>
        <Text style={[styles.title, { color: palette.text }]}>{t('shop_login_title')}</Text>
        <Text style={[styles.lead, { color: palette.text }]}>{t('shop_login_lead')}</Text>
        <Text style={[styles.label, { color: palette.text }]}>{t('shop_email_label')}</Text>
        <TextInput
          placeholder="wash@demo.com"
          placeholderTextColor={palette.tabIconDefault}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          style={[
            styles.input,
            {
              color: palette.text,
              borderColor: colorScheme === 'dark' ? '#444' : '#ccc',
              backgroundColor: colorScheme === 'dark' ? '#1c1c1e' : '#fff',
            },
          ]}
        />
        <Text style={[styles.label, { color: palette.text }]}>{t('customer_password_placeholder')}</Text>
        <TextInput
          placeholder="demo123"
          placeholderTextColor={palette.tabIconDefault}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          style={[
            styles.input,
            {
              color: palette.text,
              borderColor: colorScheme === 'dark' ? '#444' : '#ccc',
              backgroundColor: colorScheme === 'dark' ? '#1c1c1e' : '#fff',
            },
          ]}
        />
        <Pressable
          onPress={onLogin}
          disabled={busy}
          style={[
            styles.primaryBtn,
            { backgroundColor: palette.tint, opacity: busy ? 0.65 : 1 },
          ]}>
          <Text style={styles.primaryBtnText}>{t('shop_login_btn')}</Text>
        </Pressable>
        <Text style={[styles.demoHint, { color: palette.tabIconDefault }]}>{t('shop_demo_accounts')}</Text>
      </ScrollView>
    );
  }

  const shopName = locale === 'ar' ? shop.nameAr : shop.name;

  if (shop.type === 'parts') {
    return (
      <ScrollView style={[styles.screen, { backgroundColor: palette.background }]} contentContainerStyle={styles.list}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: palette.text }]}>{shopName}</Text>
            <Text style={[styles.lead, { color: palette.text }]}>{t('parts_owner_dashboard_lead')}</Text>
          </View>
          <Pressable onPress={onLogout} style={styles.logoutBtn}>
            <Text style={{ color: palette.tint, fontWeight: '700' }}>{t('shop_logout')}</Text>
          </Pressable>
        </View>

        <View
          style={[
            styles.reportCard,
            {
              borderColor: colorScheme === 'dark' ? '#333' : '#e5e7eb',
              backgroundColor: colorScheme === 'dark' ? '#111' : '#fff',
            },
          ]}>
          <Text style={[styles.reportTitle, { color: palette.text }]}>{t('parts_owner_inventory_title')}</Text>
          <TextInput
            placeholder={t('parts_owner_part_name_placeholder')}
            placeholderTextColor={palette.tabIconDefault}
            value={newPartName}
            onChangeText={setNewPartName}
            style={[
              styles.input,
              {
                color: palette.text,
                borderColor: colorScheme === 'dark' ? '#444' : '#ccc',
                backgroundColor: colorScheme === 'dark' ? '#1c1c1e' : '#fff',
              },
            ]}
          />
          <TextInput
            placeholder={t('parts_owner_part_price_placeholder')}
            placeholderTextColor={palette.tabIconDefault}
            keyboardType="numeric"
            value={newPartPrice}
            onChangeText={setNewPartPrice}
            style={[
              styles.input,
              {
                color: palette.text,
                borderColor: colorScheme === 'dark' ? '#444' : '#ccc',
                backgroundColor: colorScheme === 'dark' ? '#1c1c1e' : '#fff',
              },
            ]}
          />
          <TextInput
            placeholder={t('parts_owner_part_stock_placeholder')}
            placeholderTextColor={palette.tabIconDefault}
            keyboardType="numeric"
            value={newPartStock}
            onChangeText={setNewPartStock}
            style={[
              styles.input,
              {
                color: palette.text,
                borderColor: colorScheme === 'dark' ? '#444' : '#ccc',
                backgroundColor: colorScheme === 'dark' ? '#1c1c1e' : '#fff',
              },
            ]}
          />
          <TextInput
            placeholder={t('parts_owner_part_image_placeholder')}
            placeholderTextColor={palette.tabIconDefault}
            value={newPartImage}
            onChangeText={setNewPartImage}
            style={[
              styles.input,
              {
                color: palette.text,
                borderColor: colorScheme === 'dark' ? '#444' : '#ccc',
                backgroundColor: colorScheme === 'dark' ? '#1c1c1e' : '#fff',
              },
            ]}
          />
          <Pressable onPress={onAddPart} style={[styles.primaryBtn, { backgroundColor: palette.tint }]}>
            <Text style={styles.primaryBtnText}>{t('parts_owner_add_part_btn')}</Text>
          </Pressable>

          {loadingParts ? (
            <ActivityIndicator style={{ marginTop: 12 }} color={palette.tint} />
          ) : (
            inventory.map((part) => (
              <View key={part.id} style={styles.partOwnerRow}>
                {part.imageUrl ? <Image source={{ uri: part.imageUrl }} style={styles.partOwnerImage} /> : null}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.metaStrong, { color: palette.text }]}>{part.name}</Text>
                  <Text style={[styles.meta, { color: palette.text }]}>
                    {formatEgp(part.priceEgp, locale)} · {t('parts_stock')}: {part.stockQty}
                  </Text>
                </View>
                <View style={styles.actions}>
                  <Pressable
                    onPress={() => onAdjustStock(part.id, -1)}
                    style={[styles.actionBtn, { backgroundColor: '#ef4444' }]}>
                    <Text style={styles.actionText}>-1</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => onAdjustStock(part.id, 1)}
                    style={[styles.actionBtn, { backgroundColor: '#16a34a' }]}>
                    <Text style={styles.actionText}>+1</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>

        <View
          style={[
            styles.reportCard,
            {
              borderColor: colorScheme === 'dark' ? '#333' : '#e5e7eb',
              backgroundColor: colorScheme === 'dark' ? '#111' : '#fff',
            },
          ]}>
          <Text style={[styles.reportTitle, { color: palette.text }]}>{t('parts_owner_orders_title')}</Text>
          {partsOrders.length === 0 ? (
            <Text style={[styles.empty, { color: palette.text }]}>{t('parts_owner_no_orders')}</Text>
          ) : (
            partsOrders.map((order) => (
              <View key={order.id} style={styles.card}>
                <Text style={[styles.when, { color: palette.text }]}>
                  {new Date(order.createdAt).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-EG')}
                </Text>
                <Text style={[styles.meta, { color: palette.text }]}>
                  {t('book_phone_label')}: {order.customerPhone}
                </Text>
                <Text style={[styles.meta, { color: palette.text }]}>
                  {t('parts_shipping_address_label')}: {order.shippingAddress}
                </Text>
                <Text style={[styles.meta, { color: palette.text }]}>
                  {t('parts_order_money_line')
                    .replace('{subtotal}', formatEgp(order.subtotalEgp, locale))
                    .replace('{fee}', formatEgp(order.platformFeeEgp, locale))
                    .replace('{total}', formatEgp(order.totalEgp, locale))}
                </Text>
                <Text style={[styles.status, { color: palette.tint }]}>
                  {partsStatusLabel(order.status)}
                </Text>
                <View style={styles.actions}>
                  {order.status === 'pending' ? (
                    <Pressable
                      onPress={() => onPartsOrderStatusChange(order.id, 'confirmed')}
                      style={[styles.actionBtn, { backgroundColor: '#16a34a' }]}>
                      <Text style={styles.actionText}>{t('shop_action_confirm')}</Text>
                    </Pressable>
                  ) : null}
                  {order.status !== 'cancelled' ? (
                    <Pressable
                      onPress={() => onPartsOrderStatusChange(order.id, 'cancelled')}
                      style={[styles.actionBtn, { backgroundColor: '#dc2626' }]}>
                      <Text style={styles.actionText}>{t('shop_action_cancel')}</Text>
                    </Pressable>
                  ) : null}
                  {order.status === 'confirmed' ? (
                    <Pressable
                      onPress={() => onPartsOrderStatusChange(order.id, 'shipped')}
                      style={[styles.actionBtn, { backgroundColor: palette.tint }]}>
                      <Text style={styles.actionText}>{t('parts_mark_shipped')}</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: palette.background }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: palette.text }]}>{shopName}</Text>
          <Text style={[styles.lead, { color: palette.text }]}>{t('shop_dashboard_lead')}</Text>
        </View>
        <Pressable onPress={onLogout} style={styles.logoutBtn}>
          <Text style={{ color: palette.tint, fontWeight: '700' }}>{t('shop_logout')}</Text>
        </Pressable>
      </View>

      <View
        style={[
          styles.reportCard,
          {
            borderColor: colorScheme === 'dark' ? '#333' : '#e5e7eb',
            backgroundColor: colorScheme === 'dark' ? '#111' : '#fff',
          },
        ]}>
        <Text style={[styles.reportTitle, { color: palette.text }]}>{t('shop_report_title')}</Text>
        <Text style={[styles.reportLead, { color: palette.text }]}>{t('shop_report_lead')}</Text>

        <View style={styles.presetRow}>
          {PRESETS.map((preset) => {
            const active = preset === reportPreset;
            return (
              <Pressable
                key={preset}
                onPress={() => setReportPreset(preset)}
                style={[
                  styles.presetChip,
                  {
                    backgroundColor: active ? palette.tint : 'transparent',
                    borderColor: active ? palette.tint : colorScheme === 'dark' ? '#444' : '#ccc',
                  },
                ]}>
                <Text style={{ color: active ? '#fff' : palette.text, fontWeight: '700', fontSize: 12 }}>
                  {preset === '2d'
                    ? t('shop_report_last_2_days')
                    : preset === '3d'
                      ? t('shop_report_last_3_days')
                      : preset === '7d'
                        ? t('shop_report_last_week')
                        : preset === '30d'
                          ? t('shop_report_last_month')
                          : t('shop_report_custom')}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {reportPreset === 'custom' ? (
          <View style={styles.customRangeWrap}>
            <BookingDatePicker
              valueYmd={customStartYmd}
              onChangeYmd={setCustomStartYmd}
              locale={locale}
              label={t('shop_report_start_date')}
              pickHint={t('book_date_pick_hint')}
              minimumDate={new Date('2020-01-01T00:00:00')}
              borderColor={colorScheme === 'dark' ? '#444' : '#ccc'}
              backgroundColor={colorScheme === 'dark' ? '#1c1c1e' : '#fff'}
              textColor={palette.text}
            />
            <BookingDatePicker
              valueYmd={customEndYmd}
              onChangeYmd={setCustomEndYmd}
              locale={locale}
              label={t('shop_report_end_date')}
              pickHint={t('book_date_pick_hint')}
              minimumDate={new Date('2020-01-01T00:00:00')}
              borderColor={colorScheme === 'dark' ? '#444' : '#ccc'}
              backgroundColor={colorScheme === 'dark' ? '#1c1c1e' : '#fff'}
              textColor={palette.text}
            />
          </View>
        ) : null}

        <Text style={[styles.reportSummary, { color: palette.text }]}>
          {reportRange
            ? t('shop_report_count')
                .replace('{count}', String(reportBookings.length))
                .replace('{range}', formatRangeLabel(reportRange, locale))
            : t('shop_report_invalid_range_body')}
        </Text>
        {reportRange ? (
          <Text style={[styles.reportMoney, { color: palette.text }]}>
            {t('shop_report_money_line')
              .replace('{gross}', formatEgp(financialTotals.gross, locale))
              .replace('{fee}', formatEgp(financialTotals.fee, locale))
              .replace('{net}', formatEgp(financialTotals.net, locale))}
          </Text>
        ) : null}

        <Pressable
          onPress={onGeneratePdf}
          disabled={generatingPdf || !reportRange}
          style={[
            styles.primaryBtn,
            { backgroundColor: palette.tint, opacity: generatingPdf || !reportRange ? 0.65 : 1 },
          ]}>
          <Text style={styles.primaryBtnText}>
            {generatingPdf ? t('shop_report_generating') : t('shop_report_generate_pdf')}
          </Text>
        </Pressable>
      </View>

      {loadingBookings ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={palette.tint} />
      ) : (
        <FlatList
          data={reportBookings}
          keyExtractor={(item) => item.id}
          contentContainerStyle={reportBookings.length === 0 ? styles.emptyWrap : styles.list}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: palette.text }]}>{t('shop_report_no_bookings')}</Text>
          }
          renderItem={({ item }) => (
            <View
              style={[
                styles.card,
                {
                  borderColor: colorScheme === 'dark' ? '#333' : '#e5e7eb',
                  backgroundColor: colorScheme === 'dark' ? '#111' : '#fff',
                },
              ]}>
              <Text style={[styles.when, { color: palette.text }]}>
                {formatBookingDateTime(item.scheduledAt, locale)}
              </Text>
              <Text style={[styles.meta, { color: palette.text }]}>
                {t('book_phone_label')}: {item.customerPhone}
              </Text>
              <Text style={[styles.meta, { color: palette.text }]}>
                {t('book_car_type_label')}: {item.carType}
              </Text>
              {item.carColor ? (
                <Text style={[styles.meta, { color: palette.text }]}>
                  {t('book_car_color_label')}: {item.carColor}
                </Text>
              ) : null}
              <Text style={[styles.status, { color: palette.tint }]}>
                {bookingStatusLabel(item.status, locale)}
              </Text>

              {item.status !== 'cancelled' && item.status !== 'done' ? (
                <View style={styles.actions}>
                  {item.status === 'pending' ? (
                    <Pressable
                      onPress={() =>
                        confirmAction(
                          item.id,
                          'confirmed',
                          t('shop_confirm_booking_title'),
                          t('shop_confirm_booking_body'),
                        )
                      }
                      style={[styles.actionBtn, { backgroundColor: '#16a34a' }]}>
                      <Text style={styles.actionText}>{t('shop_action_confirm')}</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={() =>
                      confirmAction(
                        item.id,
                        'cancelled',
                        t('shop_cancel_booking_title'),
                        t('shop_cancel_booking_body'),
                      )
                    }
                    style={[styles.actionBtn, { backgroundColor: '#dc2626' }]}>
                    <Text style={styles.actionText}>{t('shop_action_cancel')}</Text>
                  </Pressable>
                  {item.status === 'confirmed' ? (
                    <Pressable
                      onPress={() => onStatusChange(item.id, 'done')}
                      style={[styles.actionBtn, { backgroundColor: palette.tint }]}>
                      <Text style={styles.actionText}>{t('shop_action_done')}</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loginContent: { padding: 20, paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 12,
  },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 6 },
  lead: { fontSize: 14, lineHeight: 20, opacity: 0.85 },
  reportCard: {
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  reportTitle: { fontSize: 17, fontWeight: '800', marginBottom: 4 },
  reportLead: { fontSize: 13, lineHeight: 19, opacity: 0.85 },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  presetChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  customRangeWrap: { marginTop: 6 },
  reportSummary: { marginTop: 12, fontSize: 13, lineHeight: 19, opacity: 0.9 },
  reportMoney: { marginTop: 6, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 17,
  },
  primaryBtn: {
    marginTop: 18,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  demoHint: { fontSize: 12, lineHeight: 18, marginTop: 16 },
  logoutBtn: { padding: 8 },
  list: { padding: 20, paddingTop: 8 },
  emptyWrap: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  empty: { textAlign: 'center', opacity: 0.7 },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  when: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  metaStrong: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  meta: { fontSize: 14, opacity: 0.85, marginTop: 2 },
  status: { fontSize: 14, fontWeight: '700', marginTop: 10 },
  partOwnerRow: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  partOwnerImage: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#1f2937' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  actionBtn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  actionText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
