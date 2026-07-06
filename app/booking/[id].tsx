import { useLocalSearchParams } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AutomotiveBackground } from '@/components/ui/AutomotiveBackground';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { getShopById } from '@/lib/booking/catalogRepository';
import {
  canCustomerCancelBooking,
  computeCustomerOrderBreakdown,
  formatBookingIdLabel,
  formatOrderCardDateTime,
  formatServiceDuration,
  formatVehicleLine,
  orderLineItems,
  orderStatusLabel,
  resolveCustomerDisplayStatus,
  resolveShopAddress,
  resolveShopDisplayName,
  serviceIconName,
} from '@/lib/booking/customerOrderPresentation';
import { formatEgp } from '@/lib/booking/reporting';
import { addShopReview, getCustomerShopReview } from '@/lib/booking/reviewsStorage';
import { clearCustomerBookingHistory, getBookingForCustomer, updateBookingStatus } from '@/lib/booking/storage';
import type { Booking } from '@/lib/booking/types';
import { fetchBranchProfile } from '@/lib/booking/wash/branchRepository';
import { formatPhoneDisplay, openPhone, openSupportEmail } from '@/lib/linking/contact';

export default function OrderDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const bookingId = Array.isArray(id) ? id[0] : id;
  const { t, locale } = useI18n();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { customer, ready: authReady } = useCustomerAuth();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [branchAddress, setBranchAddress] = useState<string | undefined>();
  const [busy, setBusy] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [cancelVisible, setCancelVisible] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const loadBooking = useCallback(async () => {
    if (!bookingId || !customer?.phone) {
      setBooking(null);
      setBusy(false);
      return;
    }
    setBusy(true);
    try {
      const row = await getBookingForCustomer(bookingId, customer.phone);
      setBooking(row);
      if (row?.branchId && row.shopType === 'wash') {
        const branch = await fetchBranchProfile(row.shopId, row.branchId);
        setBranchAddress(branch?.profileAddress);
      } else {
        setBranchAddress(undefined);
      }
    } finally {
      setBusy(false);
    }
  }, [bookingId, customer?.phone]);

  useEffect(() => {
    if (!authReady) return;
    loadBooking();
  }, [authReady, loadBooking]);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const shop = useMemo(() => (booking ? getShopById(booking.shopId) : undefined), [booking]);
  const shopName = booking ? resolveShopDisplayName(shop, booking.shopId, locale) : '';
  const breakdown = booking ? computeCustomerOrderBreakdown(booking) : null;
  const lineItems = booking ? orderLineItems(booking, locale) : [];
  const displayStatus = booking ? resolveCustomerDisplayStatus(booking, nowMs) : null;
  const canCancel = booking ? canCustomerCancelBooking(booking, nowMs) : false;

  useEffect(() => {
    if (!canCancel) setCancelVisible(false);
  }, [canCancel]);

  async function onCancelBooking() {
    if (!booking || !canCustomerCancelBooking(booking, Date.now())) return;
    setCancelling(true);
    try {
      const updated = await updateBookingStatus(booking.id, 'cancelled', booking);
      if (!updated) return;
      setCancelVisible(false);
      setBooking(updated);
    } finally {
      setCancelling(false);
    }
  }

  async function onGetHelp() {
    try {
      await openSupportEmail(
        t('settings_email_subject'),
        `${t('settings_email_body')}${booking ? `\nBooking: ${booking.id}\nShop: ${shopName}` : ''}`,
      );
    } catch {
      Alert.alert(t('settings_link_fail_title'), t('settings_link_fail_body'));
    }
  }

  if (busy) {
    return (
      <View style={[styles.screen, { backgroundColor: theme.bg }]}>
        <AutomotiveBackground theme={theme} />
        <ActivityIndicator style={{ marginTop: 48 }} color={theme.accent} />
      </View>
    );
  }

  if (!booking) {
    return (
      <View style={[styles.screen, { backgroundColor: theme.bg }]}>
        <AutomotiveBackground theme={theme} />
        <Text style={[styles.empty, { color: theme.textMuted }]}>{t('order_not_found')}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <AutomotiveBackground theme={theme} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 110 }]}>
        <View style={[styles.summaryCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.summaryTopRow}>
            <Text style={[styles.summaryStatus, { color: theme.textMuted }]}>
              {displayStatus ? orderStatusLabel(displayStatus, locale) : ''}
            </Text>
            <Text style={[styles.summaryDate, { color: theme.textMuted }]}>
              {formatOrderCardDateTime(booking.scheduledAt, locale)}
            </Text>
          </View>
          <View style={styles.summaryContentRow}>
            <View style={[styles.summaryIcon, { backgroundColor: theme.accentSoft }]}>
              <FontAwesome name={serviceIconName(booking.shopType)} size={22} color={theme.warm} />
            </View>
            <View style={styles.summaryMeta}>
              <Text style={[styles.summaryShop, { color: theme.text }]}>{shopName}</Text>
              <Text style={[styles.summaryId, { color: theme.textMuted }]}>
                {formatBookingIdLabel(booking.id, locale)}
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.sectionHeader}>
            <FontAwesome name="map-marker" size={18} color={theme.accent} />
            <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('order_service_location')}</Text>
          </View>
          <Text style={[styles.sectionPrimary, { color: theme.text }]}>{shopName}</Text>
          <Text style={[styles.sectionBody, { color: theme.textMuted }]}>
            {resolveShopAddress(shop, locale, branchAddress)}
          </Text>
          <Text style={[styles.sectionBody, { color: theme.textMuted }]}>{formatVehicleLine(booking)}</Text>
          {shop?.phone ? (
            <Pressable onPress={() => openPhone(shop.phone).catch(() => undefined)} style={styles.inlineLinkWrap}>
              <Text style={[styles.sectionBody, { color: theme.textMuted }]}>
                {t('order_mobile')}:{' '}
                <Text style={[styles.inlineLink, { color: theme.accent }]}>
                  {formatPhoneDisplay(shop.phone)}
                </Text>
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('order_service_summary')}</Text>
          {lineItems.map((item) => (
            <View key={item.label} style={styles.lineItemRow}>
              <Text style={[styles.lineItemLabel, { color: theme.text }]}>
                {item.qty} x {item.label}
              </Text>
              <Text style={[styles.lineItemPrice, { color: theme.text }]}>{formatEgp(item.priceEgp, locale)}</Text>
            </View>
          ))}
        </View>

        {breakdown ? (
          <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.breakdownRow}>
              <Text style={[styles.breakdownLabel, { color: theme.textMuted }]}>{t('order_subtotal')}</Text>
              <Text style={[styles.breakdownValue, { color: theme.text }]}>
                {formatEgp(breakdown.subtotal, locale)}
              </Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={[styles.breakdownLabel, { color: theme.textMuted }]}>{t('order_service_fee')}</Text>
              <Text style={[styles.breakdownValue, { color: theme.text }]}>
                {formatEgp(breakdown.serviceFee, locale)}
              </Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={[styles.breakdownLabel, { color: theme.textMuted }]}>{t('order_vat')}</Text>
              <Text style={[styles.breakdownValue, { color: theme.text }]}>
                {formatEgp(breakdown.vat, locale)}
              </Text>
            </View>
            <View style={[styles.breakdownRow, styles.totalRow, { borderTopColor: theme.border }]}>
              <Text style={[styles.totalLabel, { color: theme.text }]}>{t('order_total')}</Text>
              <Text style={[styles.totalValue, { color: theme.warm }]}>{formatEgp(breakdown.total, locale)}</Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={[styles.breakdownLabel, { color: theme.textMuted }]}>{t('order_payment_method')}</Text>
              <Text style={[styles.breakdownValue, { color: theme.text }]}>{t('order_payment_at_workshop')}</Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={[styles.breakdownLabel, { color: theme.textMuted }]}>{t('order_service_duration')}</Text>
              <Text style={[styles.breakdownValue, { color: theme.text }]}>
                {formatServiceDuration(booking.serviceDurationMinutes, locale)}
              </Text>
            </View>
          </View>
        ) : null}

        {canCancel ? (
          <Pressable
            onPress={() => setCancelVisible(true)}
            style={[styles.cancelBtn, { borderColor: theme.danger }]}>
            <Text style={[styles.cancelBtnText, { color: theme.danger }]}>{t('book_cancel_btn')}</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: theme.bg,
            borderTopColor: theme.border,
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}>
        <Pressable
          onPress={onGetHelp}
          style={[styles.helpBtn, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <FontAwesome name="headphones" size={18} color={theme.text} />
          <Text style={[styles.helpBtnText, { color: theme.text }]}>{t('order_get_help')}</Text>
        </Pressable>
      </View>

      <Modal visible={cancelVisible} transparent animationType="fade" onRequestClose={() => setCancelVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{t('book_cancel_title')}</Text>
            <Text style={[styles.modalBody, { color: theme.textMuted }]}>{t('book_cancel_body')}</Text>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setCancelVisible(false)}
                style={[styles.modalBtnSecondary, { borderColor: theme.border }]}>
                <Text style={[styles.modalBtnSecondaryText, { color: theme.text }]}>{t('alert_cancel')}</Text>
              </Pressable>
              <Pressable
                onPress={onCancelBooking}
                disabled={cancelling}
                style={[
                  styles.modalBtnPrimary,
                  { backgroundColor: theme.danger, opacity: cancelling ? 0.65 : 1 },
                ]}>
                <Text style={styles.modalBtnPrimaryText}>
                  {cancelling ? t('book_saving') : t('book_cancel_btn')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 14 },
  empty: { textAlign: 'center', marginTop: 48, fontSize: 16, fontWeight: '700' },
  summaryCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    gap: 14,
  },
  summaryTopRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  summaryStatus: { fontSize: 15, fontWeight: '700' },
  summaryDate: { fontSize: 15, fontWeight: '600' },
  summaryContentRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  summaryIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryMeta: { flex: 1, gap: 4 },
  summaryShop: { fontSize: 20, fontWeight: '900', lineHeight: 26 },
  summaryId: { fontSize: 15, fontWeight: '600' },
  sectionCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    gap: 10,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  sectionTitle: { fontSize: 20, fontWeight: '900' },
  sectionPrimary: { fontSize: 17, fontWeight: '800', lineHeight: 24 },
  sectionBody: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  inlineLinkWrap: { alignSelf: 'flex-start' },
  inlineLink: { fontSize: 16, fontWeight: '800' },
  lineItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 6,
  },
  lineItemLabel: { flex: 1, fontSize: 16, fontWeight: '700', lineHeight: 24 },
  lineItemPrice: { fontSize: 16, fontWeight: '800' },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 4,
  },
  breakdownLabel: { fontSize: 16, fontWeight: '700' },
  breakdownValue: { fontSize: 16, fontWeight: '800' },
  totalRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
    paddingTop: 12,
    marginBottom: 4,
  },
  totalLabel: { fontSize: 20, fontWeight: '900' },
  totalValue: { fontSize: 22, fontWeight: '900' },
  cancelBtn: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelBtnText: { fontSize: 16, fontWeight: '900' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  helpBtn: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  helpBtnText: { fontSize: 17, fontWeight: '900' },
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
  modalBody: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  modalBtnSecondary: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalBtnSecondaryText: { fontSize: 15, fontWeight: '800' },
  modalBtnPrimary: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalBtnPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
