import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
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
import { useMerchantOrderNotifier } from '@/components/merchant/OrderNotifier';
import { WalkInBookingModal } from '@/components/owner/wash/WalkInBookingModal';
import { pushCustomerNotification } from '@/lib/booking/commerceEvents';
import {
  cancelBookingReminders,
  scheduleBookingReminders,
} from '@/lib/booking/bookingReminders';
import { bookingStatusLabel, formatBookingDateTime } from '@/lib/booking/format';
import { formatEgp } from '@/lib/booking/reporting';
import { listShopReviews, setReviewOwnerReply } from '@/lib/booking/reviewsStorage';
import { updateBookingStatus } from '@/lib/booking/storage';
import type { Booking, BookingStatus, ShopReview } from '@/lib/booking/types';
import { filterWashNotificationsForStaff } from '@/lib/booking/wash/bookingDispatch';
import { getActiveWashBranch } from '@/lib/booking/wash/washBranchStorage';
import type { WashBranch } from '@/lib/booking/wash/types';
import { openPhone } from '@/lib/linking/contact';
import type { WashCenterNotification } from '@/lib/booking/wash/types';
import {
  listWashCenterNotifications,
  markWashNotificationRead,
} from '@/lib/booking/wash/washNotificationCenter';

type HubTab = 'reviews' | 'orders';

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

function resolveHubTab(rawTab?: string, rawStream?: string): HubTab {
  if (rawTab === 'reviews' || rawTab === 'orders') {
    return rawTab;
  }
  if (rawTab === 'queue' || rawTab === 'reports' || rawTab === 'history') return 'orders';
  if (rawTab === 'notifications') {
    if (rawStream === 'reviews') return 'reviews';
    return 'orders';
  }
  return 'orders';
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
  const [reviews, setReviews] = useState<ShopReview[]>([]);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<RejectTarget | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInBranch, setWalkInBranch] = useState<WashBranch | null>(null);

  const branchId = shopStaff?.role === 'branch_manager' ? shopStaff.branchId ?? undefined : undefined;

  const orderNotifier = useMerchantOrderNotifier({
    shopId: shop?.id,
    staff: shopStaff,
    activeBranchId: branchId,
    locale,
    enabled: !!shop,
  });

  useEffect(() => {
    setTab(resolveHubTab(rawTab, rawStream));
  }, [rawTab, rawStream]);

  const refresh = useCallback(async () => {
    if (!shop) {
      setNotifications([]);
      setReviews([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [notifRows, reviewRows] = await Promise.all([
        listWashCenterNotifications(shop.id),
        listShopReviews(shop.id),
      ]);
      const filteredNotifs = await filterWashNotificationsForStaff(shopStaff, notifRows);
      setNotifications(filteredNotifs);
      setReviews(reviewRows);
      await orderNotifier.refresh();
    } finally {
      setLoading(false);
    }
  }, [shop, shopStaff, orderNotifier.refresh]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const orderBookings = orderNotifier.pendingBookings;

  const reviewNotifications = useMemo(
    () => notifications.filter((row) => row.kind === 'new_review'),
    [notifications],
  );

  const unreadReviewCount = reviewNotifications.filter((n) => !n.read).length;

  function reviewForNotification(row: WashCenterNotification): ShopReview | undefined {
    if (!row.reviewId) return undefined;
    return reviews.find((review) => review.id === row.reviewId);
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
    orderNotifier.patchBookingLocally(booking.id, status);
    orderNotifier.removePendingLocally(booking.id);
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
          {orderBookings.length === 0 ? (
            <Text style={[styles.empty, { color: theme.textMuted }]}>{t('wash_active_requests_empty')}</Text>
          ) : (
            orderBookings.map((b) => renderBookingCard(b))
          )}
        </>
      );
    }

    return (
      <>
        {orderBookings.length === 0 ? (
          <Text style={[styles.empty, { color: theme.textMuted }]}>{t('wash_active_requests_empty')}</Text>
        ) : (
          orderBookings.map((b) => renderBookingCard(b))
        )}
      </>
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
          {booking.status === 'confirmed' || booking.status === 'in_progress' ? (
            <>
              <Pressable
                onPress={() => onBookingStatusChange(booking, 'done')}
                style={[styles.chipBtn, { backgroundColor: theme.accent, borderColor: theme.accent }]}>
                <Text style={[styles.chipText, { color: theme.onAccent }]}>{t('wash_booking_complete')}</Text>
              </Pressable>
              <Pressable
                onPress={() => onBookingStatusChange(booking, 'no_show')}
                style={[styles.chipBtn, { borderColor: theme.border }]}>
                <Text style={[styles.chipText, { color: theme.text }]}>{t('wash_booking_no_show')}</Text>
              </Pressable>
            </>
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
            { id: 'reviews' as const, label: t('wash_hub_subtab_reviews'), badge: unreadReviewCount },
            { id: 'orders' as const, label: t('wash_hub_tab_orders'), badge: orderNotifier.pendingCount },
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
