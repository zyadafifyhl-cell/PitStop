import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BOXED_OVERLAY } from '@/constants/Theme';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import type { Booking } from '@/lib/booking/types';
import { formatBookingDateTime } from '@/lib/booking/format';
import { formatEgp } from '@/lib/booking/reporting';
import { formatPhoneDisplay } from '@/lib/linking/contact';
import {
  fetchMerchantStoreOrderNotifications,
  type MerchantNotificationItem,
} from '@/lib/notifications/merchantStoreNotifications';
import type { StoreOrderWithItems } from '@/lib/store/orderRepository';
import type { Locale } from '@/lib/i18n/strings';
import { formatRelativeTimeAgo } from '@/lib/ui/relativeTime';

function fallbackCustomer(locale: Locale): string {
  return locale === 'ar' ? 'عميل' : 'Customer';
}

function bookingCustomerLabel(booking: Booking, locale: Locale): string {
  return booking.customerName?.trim() || formatPhoneDisplay(booking.customerPhone) || fallbackCustomer(locale);
}

function bookingMetaLine(booking: Booking, locale: Locale): string {
  const name = booking.customerName?.trim();
  const phone = formatPhoneDisplay(booking.customerPhone);
  return [name && phone && phone !== name ? phone : null, booking.carType, formatBookingDateTime(booking.scheduledAt, locale)]
    .filter(Boolean)
    .join(' · ');
}

function storeCustomerLabel(order: StoreOrderWithItems, locale: Locale): string {
  return (
    order.customerName?.trim() ||
    (order.customerPhone ? formatPhoneDisplay(order.customerPhone) : '') ||
    fallbackCustomer(locale)
  );
}

function storeMetaLine(order: StoreOrderWithItems, locale: Locale): string {
  const name = order.customerName?.trim();
  const phone = order.customerPhone ? formatPhoneDisplay(order.customerPhone) : '';
  const fulfillment = order.fulfillmentMethod === 'pickup' ? (locale === 'ar' ? 'استلام' : 'Pickup') : locale === 'ar' ? 'توصيل' : 'Delivery';
  return [name && phone && phone !== name ? phone : null, formatEgp(order.totalPrice, locale), fulfillment]
    .filter(Boolean)
    .join(' · ');
}

type Props = {
  visible: boolean;
  onClose: () => void;
  shopId?: string;
  /** Preloaded rows (optional); modal refetches when opened. */
  pendingStoreOrders?: StoreOrderWithItems[];
  pendingBookings?: Booking[];
  onSelectStoreOrder?: (order: StoreOrderWithItems) => void;
  onSelectBooking?: (booking: Booking) => void;
};

export function MerchantNotificationsModal({
  visible,
  onClose,
  shopId,
  pendingStoreOrders = [],
  pendingBookings = [],
  onSelectStoreOrder,
  onSelectBooking,
}: Props) {
  const theme = useAppTheme();
  const { t, locale } = useI18n();
  const [loading, setLoading] = useState(false);
  const [storeNotifications, setStoreNotifications] = useState<MerchantNotificationItem[]>([]);

  const loadStoreNotifications = useCallback(async () => {
    if (!shopId) {
      setStoreNotifications([]);
      return;
    }
    setLoading(true);
    try {
      const rows = await fetchMerchantStoreOrderNotifications(shopId, locale);
      setStoreNotifications(rows);
    } finally {
      setLoading(false);
    }
  }, [shopId, locale]);

  useEffect(() => {
    if (!visible) return;
    void loadStoreNotifications();
  }, [visible, loadStoreNotifications, pendingStoreOrders.length]);

  const displayStoreRows: MerchantNotificationItem[] =
    storeNotifications.length > 0
      ? storeNotifications
      : pendingStoreOrders.map((order) => {
          const shortId = order.id.replace(/-/g, '').slice(0, 8).toUpperCase();
          return {
            id: order.id,
            title: locale === 'ar' ? `طلب جديد #${shortId}` : `New Order Received / طلب جديد #${shortId}`,
            message: storeMetaLine(order, locale),
            timestamp: order.createdAt,
            type: 'store_order' as const,
            order,
          };
        });

  const isEmpty = !loading && displayStoreRows.length === 0 && pendingBookings.length === 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>{t('shop_notifications_button')}</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <FontAwesome name="times" size={20} color={theme.textMuted} />
            </Pressable>
          </View>

          {loading ? (
            <ActivityIndicator color={theme.accent} style={{ marginVertical: 28 }} />
          ) : null}

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            {isEmpty ? (
              <Text style={[styles.empty, { color: theme.textMuted }]}>{t('shop_notifications_empty')}</Text>
            ) : null}

            {!loading
              ? displayStoreRows.map((item) => (
                  <Pressable
                    key={`store-${item.id}`}
                    onPress={() => {
                      onSelectStoreOrder?.(item.order);
                      onClose();
                    }}
                    style={[styles.row, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                    <View style={[styles.iconWrap, { backgroundColor: theme.accentSoft }]}>
                      <FontAwesome name="shopping-bag" size={16} color={theme.accent} />
                    </View>
                    <View style={styles.rowBody}>
                      <View style={styles.titleRow}>
                        <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={2}>
                          {item.title}
                        </Text>
                        <View style={[styles.pendingChip, { backgroundColor: theme.warningSoft }]}>
                          <Text style={[styles.pendingChipText, { color: theme.warning }]}>{t('store_order_status_pending')}</Text>
                        </View>
                      </View>
                      <Text style={[styles.rowUser, { color: theme.text }]} numberOfLines={1}>
                        {storeCustomerLabel(item.order, locale)}
                      </Text>
                      <Text style={[styles.rowBodyText, { color: theme.textMuted }]}>
                        {storeMetaLine(item.order, locale)}
                      </Text>
                      <Text style={[styles.rowTime, { color: theme.textDim }]}>
                        {formatRelativeTimeAgo(item.timestamp, locale)}
                      </Text>
                    </View>
                    <FontAwesome name="chevron-right" size={12} color={theme.textDim} />
                  </Pressable>
                ))
              : null}

            {!loading
              ? pendingBookings.map((booking) => (
                  <Pressable
                    key={`booking-${booking.id}`}
                    onPress={() => {
                      onSelectBooking?.(booking);
                      onClose();
                    }}
                    style={[styles.row, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                    <View style={[styles.iconWrap, { backgroundColor: theme.accentSoft }]}>
                      <FontAwesome name="calendar" size={16} color={theme.accent} />
                    </View>
                    <View style={styles.rowBody}>
                      <View style={styles.titleRow}>
                        <Text style={[styles.rowTitle, { color: theme.text }]}>
                          {t('merchant_notif_booking_title')}
                        </Text>
                        <View style={[styles.pendingChip, { backgroundColor: theme.warningSoft }]}>
                          <Text style={[styles.pendingChipText, { color: theme.warning }]}>{t('store_order_status_pending')}</Text>
                        </View>
                      </View>
                      <Text style={[styles.rowUser, { color: theme.text }]} numberOfLines={1}>
                        {bookingCustomerLabel(booking, locale)}
                      </Text>
                      <Text style={[styles.rowBodyText, { color: theme.textMuted }]}>{bookingMetaLine(booking, locale)}</Text>
                      <Text style={[styles.rowTime, { color: theme.textDim }]}>
                        {formatRelativeTimeAgo(booking.createdAt, locale)}
                      </Text>
                    </View>
                    <FontAwesome name="chevron-right" size={12} color={theme.textDim} />
                  </Pressable>
                ))
              : null}
          </ScrollView>

          <Pressable onPress={onClose} style={[styles.okBtn, { backgroundColor: theme.accent }]}>
            <Text style={[styles.okText, { color: theme.onAccent }]}>{t('welcome_ok')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: BOXED_OVERLAY.backdrop,
  card: BOXED_OVERLAY.card,
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: { fontSize: 18, fontWeight: '900' },
  scroll: { maxHeight: 420 },
  scrollContent: { gap: 10, paddingBottom: 8 },
  empty: { fontSize: 14, lineHeight: 20, textAlign: 'center', paddingVertical: 24 },
  row: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, minWidth: 0, gap: 4 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  rowTitle: { fontSize: 13, fontWeight: '900', flex: 1 },
  rowUser: { fontSize: 15, fontWeight: '800' },
  pendingChip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pendingChipText: { fontSize: 10, fontWeight: '700' },
  rowBodyText: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  rowTime: { fontSize: 11, fontWeight: '700' },
  okBtn: {
    marginTop: 12,
    borderRadius: 999,
    paddingVertical: 13,
    alignItems: 'center',
  },
  okText: { fontSize: 15, fontWeight: '800' },
});
