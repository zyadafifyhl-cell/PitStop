import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { getShopById } from '@/lib/booking/catalogRepository';
import { bookingStatusLabel, formatBookingDateTime, shopTypeLabel } from '@/lib/booking/format';
import { formatEgp } from '@/lib/booking/reporting';
import { clearCustomerBookingHistory, listBookingsForPhone, updateBookingStatus } from '@/lib/booking/storage';
import type { Booking, BookingStatus } from '@/lib/booking/types';

const STATUS_BADGE_COLORS: Record<BookingStatus, string> = {
  pending: '#F97316',
  confirmed: '#3B82F6',
  in_progress: '#A855F7',
  done: '#22C55E',
  cancelled: '#EF4444',
  no_show: '#6B7280',
};

function serviceLabel(booking: Booking, locale: 'en' | 'ar'): string {
  if (locale === 'ar' && booking.serviceNameAr) return booking.serviceNameAr;
  if (booking.serviceName) return booking.serviceName;
  return shopTypeLabel(booking.shopType, locale);
}

function formatDisplayPhone(phone: string): string {
  return phone.startsWith('+20') ? `0${phone.slice(3)}` : phone;
}

export default function MyBookingsScreen() {
  const { t, locale } = useI18n();
  const theme = useAppTheme();
  const { customer, ready: authReady } = useCustomerAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [busy, setBusy] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);
  const [cancelSuccessVisible, setCancelSuccessVisible] = useState(false);
  const [eraseConfirmVisible, setEraseConfirmVisible] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [eraseSuccessVisible, setEraseSuccessVisible] = useState(false);

  const rebookLabel = locale === 'ar' ? 'إعادة الحجز' : 'Rebook';
  const reviewLabel = locale === 'ar' ? 'اترك تقييم' : 'Leave a Review';
  const serviceFieldLabel = locale === 'ar' ? 'الخدمة' : 'Service';
  const dateFieldLabel = locale === 'ar' ? 'الموعد' : 'Date & time';
  const carFieldLabel = locale === 'ar' ? 'السيارة' : 'Car';
  const priceFieldLabel = locale === 'ar' ? 'السعر' : 'Price';

  const refreshBookings = useCallback(async () => {
    if (!customer?.phone) {
      setBookings([]);
      setBusy(false);
      return;
    }
    const rows = await listBookingsForPhone(customer.phone);
    setBookings(rows);
    setBusy(false);
  }, [customer?.phone]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        if (!authReady) {
          setBusy(true);
          return;
        }
        setBusy(true);
        try {
          if (!customer?.phone) {
            if (!cancelled) setBookings([]);
            return;
          }
          const rows = await listBookingsForPhone(customer.phone);
          if (!cancelled) setBookings(rows);
        } catch {
          if (!cancelled) setBookings([]);
        } finally {
          if (!cancelled) setBusy(false);
        }
      })();
      return () => {
        cancelled = true;
        setBusy(false);
      };
    }, [authReady, customer?.phone]),
  );

  function onCancelBooking(booking: Booking) {
    setCancelTarget(booking);
  }

  function onRebook(booking: Booking) {
    router.push(`/book/${booking.shopId}`);
  }

  function onLeaveReview(booking: Booking) {
    router.push(`/shop-profile/${booking.shopId}`);
  }

  async function confirmCancelBooking() {
    if (!cancelTarget) return;
    setCancellingId(cancelTarget.id);
    try {
      const updated = await updateBookingStatus(cancelTarget.id, 'cancelled', cancelTarget);
      if (!updated) return;
      setCancelTarget(null);
      await refreshBookings();
      setCancelSuccessVisible(true);
    } finally {
      setCancellingId(null);
    }
  }

  async function confirmEraseHistory() {
    if (!customer?.phone) return;
    setErasing(true);
    try {
      await clearCustomerBookingHistory({ phone: customer.phone, customerId: customer.id });
      setEraseConfirmVisible(false);
      await refreshBookings();
      setEraseSuccessVisible(true);
    } finally {
      setErasing(false);
    }
  }

  function renderActions(booking: Booking) {
    if (booking.status === 'in_progress') return null;

    const showCancel = booking.status === 'pending' || booking.status === 'confirmed';
    const showRebook =
      booking.status === 'done' || booking.status === 'cancelled' || booking.status === 'no_show';
    const showReview = booking.status === 'done';

    if (!showCancel && !showRebook && !showReview) return null;

    return (
      <View style={styles.actionsRow}>
        {showCancel ? (
          <Pressable
            onPress={() => onCancelBooking(booking)}
            disabled={cancellingId === booking.id}
            style={[
              styles.actionBtn,
              styles.actionBtnOutline,
              { borderColor: theme.danger, opacity: cancellingId === booking.id ? 0.6 : 1 },
            ]}>
            <Text style={[styles.actionBtnText, { color: theme.danger }]}>
              {cancellingId === booking.id ? t('book_saving') : t('book_cancel_btn')}
            </Text>
          </Pressable>
        ) : null}
        {showRebook ? (
          <Pressable
            onPress={() => onRebook(booking)}
            style={[styles.actionBtn, { backgroundColor: theme.accent }]}>
            <Text style={[styles.actionBtnText, { color: theme.onAccent }]}>{rebookLabel}</Text>
          </Pressable>
        ) : null}
        {showReview ? (
          <Pressable
            onPress={() => onLeaveReview(booking)}
            style={[styles.actionBtn, styles.actionBtnOutline, { borderColor: theme.accent }]}>
            <Text style={[styles.actionBtnText, { color: theme.accent }]}>{reviewLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <ScrollView style={[styles.screen, { backgroundColor: theme.bg }]} contentContainerStyle={styles.content}>
      {customer ? (
        <View style={[styles.pageHeader, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.profileName, { color: theme.text }]}>{customer.name}</Text>
          {customer.phone ? (
            <Text style={[styles.profilePhone, { color: theme.textMuted }]}>
              {formatDisplayPhone(customer.phone)}
            </Text>
          ) : null}
        </View>
      ) : null}

      {busy ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={theme.accent} />
      ) : bookings.length === 0 ? (
        <Text style={[styles.empty, { color: theme.textMuted, marginTop: 24 }]}>{t('bookings_empty')}</Text>
      ) : (
        bookings.map((item) => {
          const shop = getShopById(item.shopId);
          const shopName = shop ? (locale === 'ar' ? shop.nameAr : shop.name) : item.shopId;
          const badgeColor = STATUS_BADGE_COLORS[item.status];
          const price =
            item.servicePriceEgp != null ? formatEgp(item.servicePriceEgp, locale) : formatEgp(0, locale);

          return (
            <View
              key={item.id}
              style={[styles.card, { borderColor: theme.border, backgroundColor: theme.card, marginTop: 12 }]}>
              <View style={styles.cardHeader}>
                <Text style={[styles.shopName, { color: theme.text }]} numberOfLines={2}>
                  {shopName}
                </Text>
                <View style={[styles.statusBadge, { backgroundColor: badgeColor }]}>
                  <Text style={styles.statusBadgeText}>{bookingStatusLabel(item.status, locale)}</Text>
                </View>
              </View>

              <View style={styles.fieldRow}>
                <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>{serviceFieldLabel}</Text>
                <Text style={[styles.fieldValue, { color: theme.text }]}>{serviceLabel(item, locale)}</Text>
              </View>
              <View style={styles.fieldRow}>
                <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>{dateFieldLabel}</Text>
                <Text style={[styles.fieldValue, { color: theme.text }]}>
                  {formatBookingDateTime(item.scheduledAt, locale)}
                </Text>
              </View>
              <View style={styles.fieldRow}>
                <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>{carFieldLabel}</Text>
                <Text style={[styles.fieldValue, { color: theme.text }]}>
                  {item.carType}
                  {item.carColor ? ` · ${item.carColor}` : ''}
                </Text>
              </View>
              <View style={styles.fieldRow}>
                <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>{priceFieldLabel}</Text>
                <Text style={[styles.priceValue, { color: theme.text }]}>{price}</Text>
              </View>

              {renderActions(item)}
            </View>
          );
        })
      )}

      {customer?.phone && bookings.length > 0 && !busy ? (
        <Pressable
          onPress={() => setEraseConfirmVisible(true)}
          style={[styles.eraseBtn, { borderColor: theme.danger, opacity: erasing ? 0.6 : 1 }]}>
          <Text style={[styles.eraseBtnText, { color: theme.danger }]}>
            {erasing ? t('book_saving') : t('bookings_erase_history')}
          </Text>
        </Pressable>
      ) : null}

      <Modal
        visible={eraseConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !erasing && setEraseConfirmVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{t('bookings_erase_history_title')}</Text>
            <Text style={[styles.modalBody, { color: theme.textMuted }]}>{t('bookings_erase_history_body')}</Text>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setEraseConfirmVisible(false)}
                disabled={erasing}
                style={[styles.modalBtnSecondary, { borderColor: theme.border }]}>
                <Text style={[styles.modalBtnSecondaryText, { color: theme.text }]}>{t('alert_cancel')}</Text>
              </Pressable>
              <Pressable
                onPress={confirmEraseHistory}
                disabled={erasing}
                style={[
                  styles.modalBtnPrimary,
                  { backgroundColor: theme.danger, opacity: erasing ? 0.65 : 1 },
                ]}>
                <Text style={styles.modalBtnPrimaryText}>
                  {erasing ? t('book_saving') : t('bookings_erase_history_confirm')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={eraseSuccessVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEraseSuccessVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{t('bookings_erase_history_success')}</Text>
            <Pressable
              onPress={() => setEraseSuccessVisible(false)}
              style={[styles.modalBtnPrimary, { backgroundColor: theme.accent, marginTop: 16 }]}>
              <Text style={[styles.modalBtnPrimaryText, { color: theme.onAccent }]}>{t('welcome_ok')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!cancelTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setCancelTarget(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{t('book_cancel_title')}</Text>
            <Text style={[styles.modalBody, { color: theme.textMuted }]}>{t('book_cancel_body')}</Text>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setCancelTarget(null)}
                style={[styles.modalBtnSecondary, { borderColor: theme.border }]}>
                <Text style={[styles.modalBtnSecondaryText, { color: theme.text }]}>{t('alert_cancel')}</Text>
              </Pressable>
              <Pressable
                onPress={confirmCancelBooking}
                disabled={!!cancellingId}
                style={[
                  styles.modalBtnPrimary,
                  { backgroundColor: theme.danger, opacity: cancellingId ? 0.65 : 1 },
                ]}>
                <Text style={styles.modalBtnPrimaryText}>
                  {cancellingId ? t('book_saving') : t('book_cancel_btn')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={cancelSuccessVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCancelSuccessVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{t('book_cancel_success')}</Text>
            <Pressable
              onPress={() => setCancelSuccessVisible(false)}
              style={[styles.modalBtnPrimary, { backgroundColor: theme.accent, marginTop: 16 }]}>
              <Text style={[styles.modalBtnPrimaryText, { color: theme.onAccent }]}>{t('welcome_ok')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  pageHeader: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 4,
  },
  profileName: { fontSize: 18, fontWeight: '800' },
  profilePhone: { fontSize: 15, fontWeight: '600', marginTop: 4 },
  empty: { textAlign: 'center' },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10,
  },
  shopName: { flex: 1, fontSize: 16, fontWeight: '800' },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  fieldRow: { marginTop: 8 },
  fieldLabel: { fontSize: 12, fontWeight: '600', marginBottom: 2 },
  fieldValue: { fontSize: 14, lineHeight: 20 },
  priceValue: { fontSize: 15, fontWeight: '800' },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  actionBtn: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  actionBtnOutline: {
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  actionBtnText: { fontSize: 13, fontWeight: '800' },
  eraseBtn: {
    marginTop: 24,
    alignSelf: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  eraseBtnText: { fontSize: 14, fontWeight: '800' },
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
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  modalBtnSecondary: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalBtnSecondaryText: { fontSize: 15, fontWeight: '700' },
  modalBtnPrimary: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalBtnPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
