import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useI18n } from '@/context/I18nContext';
import { useShopAuth } from '@/context/ShopAuthContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { pushCustomerNotification } from '@/lib/booking/commerceEvents';
import {
  cancelBookingReminders,
  scheduleBookingReminders,
} from '@/lib/booking/bookingReminders';
import { bookingStatusLabel, formatBookingDateTime } from '@/lib/booking/format';
import { formatEgp } from '@/lib/booking/reporting';
import {
  clearShopBookingHistory,
  deleteBookingForShop,
  listBookingsForShop,
  updateBookingStatus,
} from '@/lib/booking/storage';
import type { Booking, BookingStatus } from '@/lib/booking/types';
import { openPhone } from '@/lib/linking/contact';
import type { WashCenterNotification } from '@/lib/booking/wash/types';
import {
  clearWashNotifications,
  deleteWashNotification,
  listWashCenterNotifications,
  markAllWashNotificationsRead,
  markWashNotificationRead,
} from '@/lib/booking/wash/washNotificationCenter';

type HubTab = 'notifications' | 'orders' | 'history';

type RejectTarget = { booking: Booking };

export default function WashOwnerHubScreen() {
  const theme = useAppTheme();
  const { t, locale } = useI18n();
  const { shop, ready } = useShopAuth();
  const params = useLocalSearchParams<{ tab?: string | string[] }>();
  const rawTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const initialTab: HubTab =
    rawTab === 'orders' || rawTab === 'history' ? rawTab : 'notifications';

  const [tab, setTab] = useState<HubTab>(initialTab);
  const [notifications, setNotifications] = useState<WashCenterNotification[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<RejectTarget | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  useEffect(() => {
    if (rawTab === 'orders' || rawTab === 'history' || rawTab === 'notifications') {
      setTab(rawTab);
    }
  }, [rawTab]);

  const refresh = useCallback(async () => {
    if (!shop) {
      setNotifications([]);
      setBookings([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [notifRows, bookingRows] = await Promise.all([
        listWashCenterNotifications(shop.id),
        listBookingsForShop(shop.id),
      ]);
      setNotifications(notifRows);
      setBookings(bookingRows);
    } finally {
      setLoading(false);
    }
  }, [shop]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const orderBookings = useMemo(
    () =>
      bookings
        .filter((b) => b.status === 'pending' || b.status === 'confirmed' || b.status === 'in_progress')
        .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)),
    [bookings],
  );

  const historyBookings = useMemo(
    () =>
      bookings
        .filter((b) => b.status === 'done' || b.status === 'cancelled' || b.status === 'no_show')
        .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt)),
    [bookings],
  );

  const unreadCount = notifications.filter((n) => !n.read).length;

  async function onBookingStatusChange(booking: Booking, status: BookingStatus, note?: string) {
    if (!shop) return;
    await updateBookingStatus(booking.id, status, booking, note ? { ownerRejectionNote: note } : undefined);
    if (status === 'confirmed') {
      await pushCustomerNotification({
        customerId: booking.customerId,
        customerPhone: booking.customerPhone,
        kind: 'booking_approved',
        shopId: shop.id,
        bookingId: booking.id,
        scheduledAt: booking.scheduledAt,
      });
      await scheduleBookingReminders({
        bookingId: booking.id,
        shopId: shop.id,
        customerId: booking.customerId,
        customerPhone: booking.customerPhone,
        scheduledAt: booking.scheduledAt,
      });
    }
    if (status === 'cancelled') {
      await pushCustomerNotification({
        customerId: booking.customerId,
        customerPhone: booking.customerPhone,
        kind: 'booking_declined',
        shopId: shop.id,
        bookingId: booking.id,
        scheduledAt: booking.scheduledAt,
        ownerNote: note,
      });
      await cancelBookingReminders(booking.id);
    }
    if (status === 'done' || status === 'no_show') {
      await cancelBookingReminders(booking.id);
    }
    await refresh();
  }

  async function onSubmitReject() {
    if (!rejectTarget) return;
    await onBookingStatusChange(rejectTarget.booking, 'cancelled', rejectNote.trim() || undefined);
    setRejectTarget(null);
    setRejectNote('');
  }

  async function onDeleteBooking(booking: Booking) {
    if (!shop || busy) return;
    Alert.alert(t('wash_history_erase_title'), t('wash_history_erase_body'), [
      { text: t('alert_cancel'), style: 'cancel' },
      {
        text: t('wash_history_erase_confirm'),
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await deleteBookingForShop(shop.id, booking.id);
            await refresh();
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  async function onClearHistory() {
    if (!shop || busy || historyBookings.length === 0) return;
    Alert.alert(t('wash_history_clear_title'), t('wash_history_clear_body'), [
      { text: t('alert_cancel'), style: 'cancel' },
      {
        text: t('wash_history_clear_confirm'),
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await clearShopBookingHistory(shop.id);
            await refresh();
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  function renderBookingCard(booking: Booking, mode: 'orders' | 'history') {
    const serviceName =
      locale === 'ar'
        ? booking.serviceNameAr || booking.serviceName || booking.carType
        : booking.serviceName || booking.carType;
    const price = booking.servicePriceEgp != null ? formatEgp(booking.servicePriceEgp, locale) : '—';

    return (
      <View key={booking.id} style={[styles.card, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
        <Text style={[styles.when, { color: theme.text }]}>{formatBookingDateTime(booking.scheduledAt, locale)}</Text>
        <Text style={[styles.meta, { color: theme.textMuted }]}>
          {t('wash_booking_customer')}: {booking.customerName || booking.customerPhone}
        </Text>
        <Text style={[styles.meta, { color: theme.textMuted }]}>
          {t('wash_booking_vehicle')}: {booking.carType}
          {booking.carColor ? ` · ${booking.carColor}` : ''}
        </Text>
        <Text style={[styles.meta, { color: theme.textMuted }]}>
          {t('wash_booking_service')}: {serviceName} · {price}
        </Text>
        {booking.customerNotes ? (
          <Text style={[styles.meta, { color: theme.textMuted }]}>
            {t('wash_booking_notes')}: {booking.customerNotes}
          </Text>
        ) : null}
        <Text style={[styles.status, { color: theme.accent }]}>{bookingStatusLabel(booking.status, locale)}</Text>

        {mode === 'orders' ? (
          <View style={styles.actions}>
            {booking.status === 'pending' ? (
              <>
                <Pressable
                  onPress={() => onBookingStatusChange(booking, 'confirmed')}
                  style={[styles.chipBtn, { backgroundColor: theme.accent, borderColor: theme.accent }]}>
                  <Text style={[styles.chipText, { color: theme.onAccent }]}>{t('shop_action_approve')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setRejectTarget({ booking });
                    setRejectNote('');
                  }}
                  style={[styles.chipBtn, { backgroundColor: theme.danger, borderColor: theme.danger }]}>
                  <Text style={styles.chipText}>{t('shop_action_decline')}</Text>
                </Pressable>
              </>
            ) : null}
            {booking.status === 'confirmed' ? (
              <>
                <Pressable
                  onPress={() => onBookingStatusChange(booking, 'in_progress')}
                  style={[styles.chipBtn, { backgroundColor: theme.accent, borderColor: theme.accent }]}>
                  <Text style={[styles.chipText, { color: theme.onAccent }]}>{t('wash_booking_in_progress')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => onBookingStatusChange(booking, 'no_show')}
                  style={[styles.chipBtn, { borderColor: theme.border }]}>
                  <Text style={[styles.chipText, { color: theme.text }]}>{t('wash_booking_no_show')}</Text>
                </Pressable>
              </>
            ) : null}
            {booking.status === 'in_progress' ? (
              <Pressable
                onPress={() => onBookingStatusChange(booking, 'done')}
                style={[styles.chipBtn, { backgroundColor: theme.accent, borderColor: theme.accent }]}>
                <Text style={[styles.chipText, { color: theme.onAccent }]}>{t('wash_booking_complete')}</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => openPhone(booking.customerPhone).catch(() => undefined)}
              style={[styles.chipBtn, { borderColor: theme.border }]}>
              <Text style={[styles.chipText, { color: theme.text }]}>{t('wash_booking_contact')}</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={() => onDeleteBooking(booking)}
            style={[styles.chipBtn, { backgroundColor: theme.danger, borderColor: theme.danger, marginTop: 10 }]}>
            <Text style={styles.chipText}>{t('wash_history_erase_one')}</Text>
          </Pressable>
        )}
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  if (!shop) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <Text style={[styles.empty, { color: theme.textMuted }]}>{t('wash_notif_login_required')}</Text>
        <Pressable onPress={() => router.replace('/shop')} style={[styles.primaryBtn, { backgroundColor: theme.accent }]}>
          <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>{t('shop_login_btn')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <View style={[styles.header, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={[styles.backText, { color: theme.accent }]}>{t('wash_notif_back')}</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
          {t('wash_hub_title')}
        </Text>
        <View style={styles.backBtn} />
      </View>

      <View style={[styles.tabRow, { borderColor: theme.border }]}>
        {(
          [
            { id: 'notifications' as const, label: t('wash_hub_tab_notifications'), badge: unreadCount },
            { id: 'orders' as const, label: t('wash_hub_tab_orders'), badge: orderBookings.length },
            { id: 'history' as const, label: t('wash_hub_tab_history'), badge: historyBookings.length },
          ] as const
        ).map((item) => (
          <Pressable
            key={item.id}
            onPress={() => setTab(item.id)}
            style={[
              styles.tabBtn,
              {
                backgroundColor: tab === item.id ? theme.accent : theme.bgElevated,
                borderColor: tab === item.id ? theme.accent : theme.border,
              },
            ]}>
            <Text style={[styles.tabText, { color: tab === item.id ? theme.onAccent : theme.text }]}>
              {item.label}
              {item.badge > 0 ? ` (${item.badge})` : ''}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator color={theme.accent} style={{ marginTop: 24 }} />
        ) : tab === 'notifications' ? (
          <>
            <View style={styles.toolbar}>
              <Pressable
                onPress={async () => {
                  setBusy(true);
                  try {
                    await markAllWashNotificationsRead(shop.id);
                    await refresh();
                  } finally {
                    setBusy(false);
                  }
                }}
                disabled={busy || unreadCount === 0}
                style={[styles.chipBtn, { borderColor: theme.border, opacity: unreadCount === 0 ? 0.5 : 1 }]}>
                <Text style={[styles.chipText, { color: theme.text }]}>{t('wash_notif_mark_all_read')}</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  Alert.alert(t('wash_notif_clear_title'), t('wash_notif_clear_body'), [
                    { text: t('alert_cancel'), style: 'cancel' },
                    {
                      text: t('wash_notif_clear_confirm'),
                      style: 'destructive',
                      onPress: async () => {
                        setBusy(true);
                        try {
                          await clearWashNotifications(shop.id);
                          await refresh();
                        } finally {
                          setBusy(false);
                        }
                      },
                    },
                  ]);
                }}
                disabled={busy || notifications.length === 0}
                style={[styles.chipBtn, { borderColor: theme.danger, opacity: notifications.length === 0 ? 0.5 : 1 }]}>
                <Text style={[styles.chipText, { color: theme.danger }]}>{t('wash_notif_clear_all')}</Text>
              </Pressable>
            </View>
            {notifications.length === 0 ? (
              <Text style={[styles.empty, { color: theme.textMuted }]}>{t('wash_notif_empty')}</Text>
            ) : (
              notifications.map((row) => (
                <View
                  key={row.id}
                  style={[
                    styles.card,
                    {
                      borderColor: row.read ? theme.border : theme.accent,
                      backgroundColor: row.read ? theme.bgElevated : theme.card,
                    },
                  ]}>
                  <Text style={[styles.cardTitle, { color: theme.text }]}>{row.title}</Text>
                  <Text style={[styles.meta, { color: theme.textMuted }]}>{row.body}</Text>
                  <Text style={[styles.meta, { color: theme.textDim }]}>
                    {new Date(row.createdAt).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-EG')}
                  </Text>
                  <View style={styles.actions}>
                    {!row.read ? (
                      <Pressable
                        onPress={async () => {
                          setBusy(true);
                          try {
                            await markWashNotificationRead(shop.id, row.id);
                            await refresh();
                          } finally {
                            setBusy(false);
                          }
                        }}
                        style={[styles.chipBtn, { backgroundColor: theme.accent, borderColor: theme.accent }]}>
                        <Text style={[styles.chipText, { color: theme.onAccent }]}>{t('wash_notif_mark_read')}</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      onPress={async () => {
                        setBusy(true);
                        try {
                          await deleteWashNotification(shop.id, row.id);
                          await refresh();
                        } finally {
                          setBusy(false);
                        }
                      }}
                      style={[styles.chipBtn, { backgroundColor: theme.danger, borderColor: theme.danger }]}>
                      <Text style={styles.chipText}>{t('wash_notif_delete')}</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </>
        ) : tab === 'orders' ? (
          orderBookings.length === 0 ? (
            <Text style={[styles.empty, { color: theme.textMuted }]}>{t('wash_active_requests_empty')}</Text>
          ) : (
            orderBookings.map((b) => renderBookingCard(b, 'orders'))
          )
        ) : historyBookings.length === 0 ? (
          <Text style={[styles.empty, { color: theme.textMuted }]}>{t('wash_booking_history_empty')}</Text>
        ) : (
          <>
            <Pressable
              onPress={onClearHistory}
              style={[styles.primaryBtn, { backgroundColor: theme.danger, marginBottom: 12 }]}>
              <Text style={[styles.primaryBtnText, { color: '#fff' }]}>{t('wash_history_clear_all')}</Text>
            </Pressable>
            {historyBookings.map((b) => renderBookingCard(b, 'history'))}
          </>
        )}
      </ScrollView>

      <Modal visible={!!rejectTarget} transparent animationType="fade" onRequestClose={() => setRejectTarget(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>{t('shop_booking_decision_decline_title')}</Text>
            <TextInput
              value={rejectNote}
              onChangeText={setRejectNote}
              placeholder={t('shop_owner_note_placeholder')}
              placeholderTextColor={theme.textDim}
              multiline
              style={[styles.noteInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bgElevated }]}
            />
            <View style={styles.actions}>
              <Pressable onPress={() => setRejectTarget(null)} style={[styles.chipBtn, { borderColor: theme.border }]}>
                <Text style={[styles.chipText, { color: theme.text }]}>{t('alert_cancel')}</Text>
              </Pressable>
              <Pressable onPress={onSubmitReject} style={[styles.chipBtn, { backgroundColor: theme.danger, borderColor: theme.danger }]}>
                <Text style={styles.chipText}>{t('shop_booking_decision_submit')}</Text>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: { minWidth: 72, paddingVertical: 6 },
  backText: { fontSize: 15, fontWeight: '700' },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '900', textAlign: 'center' },
  tabRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  tabBtn: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tabText: { fontSize: 12, fontWeight: '800' },
  content: { padding: 16, paddingBottom: 40 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  empty: { textAlign: 'center', fontSize: 14, lineHeight: 20, marginTop: 24 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
  cardTitle: { fontSize: 16, fontWeight: '800', marginBottom: 6 },
  when: { fontSize: 16, fontWeight: '800', marginBottom: 6 },
  meta: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  status: { fontSize: 14, fontWeight: '800', marginTop: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chipBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  chipText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  primaryBtn: { borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  primaryBtnText: { fontWeight: '800', fontSize: 15 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: { width: '100%', maxWidth: 420, borderWidth: 1, borderRadius: 16, padding: 16 },
  noteInput: { borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 80, marginTop: 10, textAlignVertical: 'top' },
});
