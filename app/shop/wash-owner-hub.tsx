import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Platform,
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
import { WalkInBookingModal } from '@/components/owner/wash/WalkInBookingModal';
import { listArchivedBookingsForStaff } from '@/lib/booking/bookingHistoryRepository';
import { pushCustomerNotification } from '@/lib/booking/commerceEvents';
import {
  cancelBookingReminders,
  scheduleBookingReminders,
} from '@/lib/booking/bookingReminders';
import { bookingStatusLabel, formatBookingDateTime } from '@/lib/booking/format';
import { formatEgp } from '@/lib/booking/reporting';
import { listShopReviews, setReviewOwnerReply } from '@/lib/booking/reviewsStorage';
import {
  listBookingsForShop,
  updateBookingStatus,
} from '@/lib/booking/storage';
import type { Booking, BookingStatus, ShopReview } from '@/lib/booking/types';
import {
  filterPendingQueueBookingsForStaff,
  filterWashNotificationsForStaff,
} from '@/lib/booking/wash/bookingDispatch';
import { getActiveWashBranch } from '@/lib/booking/wash/washBranchStorage';
import type { WashBranch } from '@/lib/booking/wash/types';
import { openPhone } from '@/lib/linking/contact';
import type { ShopStaffUser } from '@/lib/shop/shopStaffUser';
import type { WashCenterNotification } from '@/lib/booking/wash/types';
import {
  listWashCenterNotifications,
  markWashNotificationRead,
} from '@/lib/booking/wash/washNotificationCenter';

type HubTab = 'queue' | 'reports' | 'reviews' | 'orders' | 'history';

type RejectTarget = { booking: Booking; notificationId?: string };

function UnreadPulseDot({ rtl }: { rtl?: boolean }) {
  const pulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View style={[styles.unreadDot, rtl ? styles.unreadDotRtl : null, { opacity: pulse }]}>
      <View style={styles.unreadDotCore} />
    </Animated.View>
  );
}

function filterBookingsForStaff(bookings: Booking[], staff: ShopStaffUser | null) {
  if (!staff || staff.role !== 'branch_manager' || !staff.branchId) return bookings;
  return bookings.filter((booking) => !booking.branchId || booking.branchId === staff.branchId);
}

function resolveHubTab(rawTab?: string, rawStream?: string): HubTab {
  if (rawTab === 'queue' || rawTab === 'reports' || rawTab === 'reviews' || rawTab === 'orders' || rawTab === 'history') {
    return rawTab;
  }
  if (rawTab === 'notifications') {
    if (rawStream === 'reports') return 'reports';
    if (rawStream === 'reviews') return 'reviews';
    return 'queue';
  }
  return 'queue';
}

export default function WashOwnerHubScreen() {
  const theme = useAppTheme();
  const { t, locale, isRTL } = useI18n();
  const { shop, shopStaff, ready } = useShopAuth();
  const params = useLocalSearchParams<{ tab?: string | string[]; stream?: string | string[] }>();
  const rawTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const rawStream = Array.isArray(params.stream) ? params.stream[0] : params.stream;
  const initialTab = resolveHubTab(rawTab, rawStream);

  const [tab, setTab] = useState<HubTab>(initialTab);
  const [notifications, setNotifications] = useState<WashCenterNotification[]>([]);
  const [queueBookings, setQueueBookings] = useState<Booking[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [historyBookings, setHistoryBookings] = useState<Booking[]>([]);
  const [reviews, setReviews] = useState<ShopReview[]>([]);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [reportPreviewHtml, setReportPreviewHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<RejectTarget | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInBranch, setWalkInBranch] = useState<WashBranch | null>(null);

  useEffect(() => {
    setTab(resolveHubTab(rawTab, rawStream));
  }, [rawTab, rawStream]);

  const branchId = shopStaff?.role === 'branch_manager' ? shopStaff.branchId : undefined;

  const refresh = useCallback(async () => {
    if (!shop) {
      setNotifications([]);
      setBookings([]);
      setQueueBookings([]);
      setHistoryBookings([]);
      setReviews([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [notifRows, bookingRows, reviewRows, archivedRows] = await Promise.all([
        listWashCenterNotifications(shop.id),
        listBookingsForShop(shop.id),
        listShopReviews(shop.id),
        listArchivedBookingsForStaff(shop.id, branchId),
      ]);
      const scopedBookings = filterBookingsForStaff(bookingRows, shopStaff);
      const filteredNotifs = await filterWashNotificationsForStaff(shopStaff, notifRows);
      const pendingQueue = await filterPendingQueueBookingsForStaff(shopStaff, scopedBookings);
      setNotifications(filteredNotifs);
      setBookings(scopedBookings);
      setQueueBookings(
        pendingQueue.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)),
      );
      setHistoryBookings(archivedRows);
      setReviews(reviewRows);
    } finally {
      setLoading(false);
    }
  }, [shop, shopStaff, branchId]);

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

  const reportNotifications = useMemo(
    () => notifications.filter((row) => row.kind === 'weekly_revenue' || row.kind === 'system_alert'),
    [notifications],
  );

  const reviewNotifications = useMemo(
    () => notifications.filter((row) => row.kind === 'new_review'),
    [notifications],
  );

  const unreadReportCount = reportNotifications.filter((n) => !n.read).length;
  const unreadReviewCount = reviewNotifications.filter((n) => !n.read).length;

  function reviewForNotification(row: WashCenterNotification): ShopReview | undefined {
    if (!row.reviewId) return undefined;
    return reviews.find((review) => review.id === row.reviewId);
  }

  async function onOpenReportNotification(row: WashCenterNotification) {
    if (!shop || !row.reportHtml) return;
    await markWashNotificationRead(shop.id, row.id);
    setReportPreviewHtml(row.reportHtml);
    await refresh();
  }

  function printReportPreview() {
    if (Platform.OS !== 'web') return;
    const iframe = document.getElementById('wash-hub-report-iframe') as HTMLIFrameElement | null;
    iframe?.contentWindow?.print();
  }

  async function onSubmitReviewReply(reviewId: string, notificationId?: string) {
    if (!shop) return;
    const reply = replyDrafts[reviewId]?.trim();
    if (!reply) return;
    setBusy(true);
    try {
      await setReviewOwnerReply(shop.id, reviewId, reply);
      if (notificationId) {
        await markWashNotificationRead(shop.id, notificationId);
      }
      setReplyDrafts((prev) => ({ ...prev, [reviewId]: '' }));
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function openWalkInModal() {
    if (!shop || !shopStaff || (shopStaff.role !== 'owner' && shopStaff.role !== 'branch_manager')) return;
    const branch = await getActiveWashBranch(shop, { staff: shopStaff });
    setWalkInBranch(branch);
    setWalkInOpen(true);
  }

  function branchLabel(branch: WashBranch): string {
    return locale === 'ar' ? branch.nameAr || branch.name : branch.name;
  }

  async function onBookingStatusChange(booking: Booking, status: BookingStatus, note?: string) {
    if (!shop) return;
    await updateBookingStatus(booking.id, status, booking, note ? { ownerRejectionNote: note } : undefined);
    if (status === 'confirmed') {
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
    if (!rejectTarget || !shop) return;
    setBusy(true);
    try {
      await onBookingStatusChange(rejectTarget.booking, 'cancelled', rejectNote.trim() || undefined);
      if (rejectTarget.notificationId) {
        await markWashNotificationRead(shop.id, rejectTarget.notificationId);
      }
      setRejectTarget(null);
      setRejectNote('');
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  function renderQueueBookingCard(booking: Booking) {
    const serviceName =
      locale === 'ar'
        ? booking.serviceNameAr || booking.serviceName || booking.carType
        : booking.serviceName || booking.carType;

    return (
      <View key={booking.id} style={[styles.card, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>{t('wash_active_requests_title')}</Text>
        <Text style={[styles.when, { color: theme.text }]}>{formatBookingDateTime(booking.scheduledAt, locale)}</Text>
        <Text style={[styles.meta, { color: theme.textMuted }]}>
          {booking.customerName || booking.customerPhone} · {booking.carType}
        </Text>
        <Text style={[styles.meta, { color: theme.textMuted }]}>
          {t('wash_booking_service')}: {serviceName}
        </Text>
        <View style={styles.notifActions}>
          <Pressable
            onPress={() => onBookingStatusChange(booking, 'confirmed')}
            disabled={busy}
            style={[
              styles.actionBtn,
              styles.actionBtnPrimary,
              { backgroundColor: theme.success, borderColor: theme.success, opacity: busy ? 0.6 : 1 },
            ]}>
            <Text style={[styles.actionBtnText, { color: '#fff' }]}>{t('wash_notif_accept')}</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setRejectTarget({ booking });
              setRejectNote('');
            }}
            disabled={busy}
            style={[
              styles.actionBtn,
              styles.actionBtnDangerSoft,
              { backgroundColor: theme.dangerSoft, borderColor: theme.danger, opacity: busy ? 0.6 : 1 },
            ]}>
            <Text style={[styles.actionBtnText, { color: theme.danger }]}>{t('wash_notif_decline')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  function renderReportNotificationCard(row: WashCenterNotification) {
    const unread = !row.read;
    return (
      <Pressable
        key={row.id}
        onPress={() => void onOpenReportNotification(row)}
        disabled={!row.reportHtml}
        style={({ pressed }) => [
          styles.card,
          styles.notifCard,
          {
            borderColor: unread ? '#3B82F6' : theme.border,
            backgroundColor: unread ? theme.bgElevated : theme.card,
            opacity: pressed ? 0.92 : row.reportHtml ? 1 : 0.65,
          },
        ]}>
        {unread ? <UnreadPulseDot rtl={isRTL} /> : null}
        <Text style={[styles.cardTitle, { color: theme.text }]}>{row.title}</Text>
        <Text style={[styles.meta, { color: theme.textMuted }]}>{row.body}</Text>
        <Text style={[styles.meta, { color: theme.textDim }]}>
          {new Date(row.createdAt).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-EG')}
        </Text>
      </Pressable>
    );
  }

  function renderReviewNotificationCard(row: WashCenterNotification) {
    const unread = !row.read;
    const review = reviewForNotification(row);
    const stars = review ? '★'.repeat(review.rating) : row.body.match(/★+/)?.[0] ?? '';

    return (
      <View
        key={row.id}
        style={[
          styles.card,
          styles.notifCard,
          {
            borderColor: unread ? '#3B82F6' : theme.border,
            backgroundColor: unread ? theme.bgElevated : theme.card,
          },
        ]}>
        {unread ? <UnreadPulseDot rtl={isRTL} /> : null}
        <Text style={[styles.cardTitle, { color: theme.text }]}>
          {review?.customerName ?? row.title}
        </Text>
        <Text style={[styles.meta, { color: theme.accent }]}>{stars}</Text>
        <Text style={[styles.meta, { color: theme.textMuted }]}>{review?.body ?? row.body}</Text>
        {review?.ownerReply ? (
          <Text style={[styles.meta, { color: theme.textDim }]}>
            {t('wash_review_owner_reply')}: {review.ownerReply}
          </Text>
        ) : null}
        <TextInput
          value={replyDrafts[review?.id ?? row.id] ?? ''}
          onChangeText={(value) =>
            setReplyDrafts((prev) => ({ ...prev, [review?.id ?? row.id]: value }))
          }
          placeholder={t('wash_hub_reply_placeholder')}
          placeholderTextColor={theme.textDim}
          multiline
          style={[styles.noteInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bgElevated }]}
        />
        <Pressable
          onPress={() => review && void onSubmitReviewReply(review.id, row.id)}
          disabled={busy || !review}
          style={[styles.actionBtn, styles.actionBtnPrimary, { backgroundColor: theme.accent, borderColor: theme.accent, marginTop: 8, opacity: busy || !review ? 0.6 : 1 }]}>
          <Text style={[styles.actionBtnText, { color: theme.onAccent }]}>{t('wash_hub_reply_submit')}</Text>
        </Pressable>
      </View>
    );
  }

  function renderTabContent() {
    if (tab === 'queue') {
      return queueBookings.length === 0 ? (
        <Text style={[styles.empty, { color: theme.textMuted }]}>{t('wash_hub_queue_empty')}</Text>
      ) : (
        queueBookings.map((booking) => renderQueueBookingCard(booking))
      );
    }

    if (tab === 'reports') {
      return reportNotifications.length === 0 ? (
        <Text style={[styles.empty, { color: theme.textMuted }]}>{t('wash_hub_reports_empty')}</Text>
      ) : (
        reportNotifications.map((row) => renderReportNotificationCard(row))
      );
    }

    if (tab === 'reviews') {
      return reviewNotifications.length === 0 ? (
        <Text style={[styles.empty, { color: theme.textMuted }]}>{t('wash_hub_reviews_empty')}</Text>
      ) : (
        reviewNotifications.map((row) => renderReviewNotificationCard(row))
      );
    }

    if (tab === 'orders') {
      return (
        <>
          <Pressable
            onPress={openWalkInModal}
            style={[styles.primaryBtn, { backgroundColor: theme.accent, marginBottom: 12 }]}>
            <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>{t('walk_in_quick_button')}</Text>
          </Pressable>
          {orderBookings.length === 0 ? (
            <Text style={[styles.empty, { color: theme.textMuted }]}>{t('wash_active_requests_empty')}</Text>
          ) : (
            orderBookings.map((b) => renderBookingCard(b))
          )}
        </>
      );
    }

    return historyBookings.length === 0 ? (
      <Text style={[styles.empty, { color: theme.textMuted }]}>{t('wash_booking_history_empty')}</Text>
    ) : (
      historyBookings.map((b) => renderHistoryCard(b))
    );
  }

  function renderHistoryCard(booking: Booking) {
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
      </View>
    );
  }

  function renderBookingCard(booking: Booking) {
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
            { id: 'queue' as const, label: t('wash_hub_subtab_queue'), badge: queueBookings.length },
            { id: 'reports' as const, label: t('wash_hub_subtab_reports'), badge: unreadReportCount },
            { id: 'reviews' as const, label: t('wash_hub_subtab_reviews'), badge: unreadReviewCount },
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
        ) : (
          renderTabContent()
        )}
      </ScrollView>

      <Modal visible={!!reportPreviewHtml} transparent animationType="fade" onRequestClose={() => setReportPreviewHtml(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>{t('wash_report_title')}</Text>
            {Platform.OS === 'web' && reportPreviewHtml ? (
              <iframe
                id="wash-hub-report-iframe"
                title="wash-hub-report"
                srcDoc={reportPreviewHtml}
                style={{ width: '100%', height: 420, border: 'none', borderRadius: 8 }}
              />
            ) : null}
            <View style={styles.actions}>
              {Platform.OS === 'web' ? (
                <Pressable onPress={printReportPreview} style={[styles.primaryBtn, { backgroundColor: theme.accent, flex: 1 }]}>
                  <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>{t('wash_report_save_pdf')}</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={() => setReportPreviewHtml(null)} style={[styles.chipBtn, { borderColor: theme.border, flex: 1 }]}>
                <Text style={[styles.chipText, { color: theme.text }]}>{t('wash_report_close')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

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

      {shop && walkInBranch ? (
        <WalkInBookingModal
          visible={walkInOpen}
          onClose={() => setWalkInOpen(false)}
          shop={shop}
          branchId={walkInBranch.id}
          branchLabel={branchLabel(walkInBranch)}
          services={walkInBranch.services ?? []}
          onCreated={() => {
            void refresh();
          }}
        />
      ) : null}
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
  notifCard: { position: 'relative', overflow: 'visible' },
  unreadDot: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(59, 130, 246, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadDotCore: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#3B82F6',
  },
  unreadDotRtl: { right: undefined, left: 12 },
  notifHint: { fontSize: 11, fontWeight: '600', marginTop: 8 },
  notifActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  actionBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnPrimary: {},
  actionBtnDangerSoft: {},
  actionBtnText: { fontSize: 14, fontWeight: '800' },
  cardTitle: { fontSize: 16, fontWeight: '800', marginBottom: 6, paddingRight: 18 },
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
