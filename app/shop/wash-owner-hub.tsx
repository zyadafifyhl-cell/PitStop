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

import { BOXED_OVERLAY } from '@/constants/Theme';
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
import { promptMerchantNoShowOverride } from '@/lib/booking/merchantBookingOverride';
import { formatEgp } from '@/lib/booking/reporting';
import { listShopReviews, setReviewOwnerReply, computeShopRatingSummary, formatReviewStarRow } from '@/lib/booking/reviewsStorage';
import { listBookingsForShop, markBookingNoShow, updateBookingStatus } from '@/lib/booking/storage';
import type { Booking, BookingStatus, ShopReview } from '@/lib/booking/types';
import { filterWashNotificationsForStaff } from '@/lib/booking/wash/bookingDispatch';
import {
  countActiveShopBranches,
  fetchShopBranchLabels,
  type ShopBranchLabel,
} from '@/lib/booking/wash/branchRepository';
import { formatBranchBadgeLabel, resolveBranchIdForReview } from '@/lib/booking/wash/merchantBranchLabels';
import { getActiveWashBranch } from '@/lib/booking/wash/washBranchStorage';
import type { WashBranch } from '@/lib/booking/wash/types';
import { openPhone } from '@/lib/linking/contact';
import type { WashCenterNotification } from '@/lib/booking/wash/types';
import {
  listWashCenterNotifications,
  markWashNotificationRead,
} from '@/lib/booking/wash/washNotificationCenter';
import { loadAuditPendingBookingsForStaff, subscribeMerchantBookingRealtime, handleMerchantBookingCancelledRealtime } from '@/lib/notifications/notificationService';

type HubTab = 'reviews' | 'orders';

type RejectTarget = { booking: Booking; notificationId?: string };

function UnreadPulseDot({ rtl }: { rtl?: boolean }) {
  const theme = useAppTheme();
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
    <Animated.View
      style={[
        styles.unreadDot,
        rtl ? styles.unreadDotRtl : null,
        { opacity: pulse, backgroundColor: theme.accentSoft },
      ]}>
      <View style={[styles.unreadDotCore, { backgroundColor: theme.accent }]} />
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
  const [auditOrderBookings, setAuditOrderBookings] = useState<Booking[]>([]);
  const [shopBookings, setShopBookings] = useState<Booking[]>([]);
  const [branchLabels, setBranchLabels] = useState<ShopBranchLabel[]>([]);
  const [branchCount, setBranchCount] = useState(0);
  const [reviewBranchById, setReviewBranchById] = useState<Record<string, string | undefined>>({});

  const branchId = shopStaff?.role === 'branch_manager' ? shopStaff.branchId ?? undefined : undefined;
  const showBranchBadges = shopStaff?.role === 'owner' && branchCount > 1;

  const orderNotifier = useMerchantOrderNotifier({
    shopId: shop?.id,
    staff: shopStaff,
    activeBranchId: branchId,
    locale,
    enabled: !!shop && shopStaff?.role !== 'owner',
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
      const [notifRows, reviewRows, bookingRows, labels, totalBranches] = await Promise.all([
        listWashCenterNotifications(shop.id),
        listShopReviews(shop.id),
        listBookingsForShop(shop.id),
        fetchShopBranchLabels(shop.id),
        countActiveShopBranches(shop.id),
      ]);
      const filteredNotifs = await filterWashNotificationsForStaff(shopStaff, notifRows);
      const auditOrders = await loadAuditPendingBookingsForStaff(shop.id, shopStaff, branchId);
      const reviewBranches = Object.fromEntries(
        reviewRows.map((review) => [
          review.id,
          resolveBranchIdForReview(review, bookingRows),
        ]),
      );
      setNotifications(filteredNotifs);
      setReviews(reviewRows);
      setShopBookings(bookingRows);
      setAuditOrderBookings(auditOrders);
      setBranchLabels(labels);
      setBranchCount(totalBranches);
      setReviewBranchById(reviewBranches);
      if (shopStaff?.role !== 'owner') {
        await orderNotifier.refresh();
      }
    } finally {
      setLoading(false);
    }
  }, [shop, shopStaff, branchId, orderNotifier.refresh]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  useEffect(() => {
    if (!shop?.id || shopStaff?.role !== 'owner') return;

    const unsubscribe = subscribeMerchantBookingRealtime(
      { shopId: shop.id, staff: shopStaff, activeBranchId: branchId },
      {
        onBookingUpdate: (booking, previousStatus) => {
          if (booking.status !== 'cancelled' || !previousStatus || previousStatus === 'cancelled') {
            return;
          }
          setAuditOrderBookings((prev) => prev.filter((row) => row.id !== booking.id));
          void handleMerchantBookingCancelledRealtime(booking, shopStaff, locale, branchId).then(() => {
            void listWashCenterNotifications(shop.id).then(async (rows) => {
              const filtered = await filterWashNotificationsForStaff(shopStaff, rows);
              setNotifications(filtered);
            });
          });
        },
      },
    );

    return unsubscribe;
  }, [shop?.id, shopStaff, branchId, locale]);

  const orderBookings = shopStaff?.role === 'owner' ? auditOrderBookings : orderNotifier.pendingBookings;
  const ordersTabBadge =
    shopStaff?.role === 'owner' ? auditOrderBookings.length : orderNotifier.pendingCount;

  function renderBranchBadge(branchIdForCard?: string) {
    if (!showBranchBadges) return null;
    const label = formatBranchBadgeLabel(branchIdForCard, branchLabels, locale);
    if (!label) return null;
    return (
      <Text style={[styles.branchBadge, { color: theme.accent, borderColor: theme.accent }, isRTL && styles.textRtl]}>
        {t('wash_hub_branch_badge').replace('{branch}', label)}
      </Text>
    );
  }

  const reviewNotifications = useMemo(
    () => notifications.filter((row) => row.kind === 'new_review'),
    [notifications],
  );

  const visibleReviews = useMemo(
    () =>
      reviews
        .filter((review) => !review.hidden)
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [reviews],
  );

  const ratingSummary = useMemo(() => computeShopRatingSummary(reviews), [reviews]);

  const unreadReviewCount = reviewNotifications.filter((n) => !n.read).length;

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
    if (status === 'no_show') {
      await markBookingNoShow(booking.id, booking);
    } else {
      await updateBookingStatus(booking.id, status, booking, note ? { ownerRejectionNote: note } : undefined);
    }
    orderNotifier.patchBookingLocally(booking.id, status);
    orderNotifier.removePendingLocally(booking.id);
    setAuditOrderBookings((prev) =>
      status === 'pending'
        ? prev.map((row) => (row.id === booking.id ? { ...row, status } : row))
        : prev.filter((row) => row.id !== booking.id),
    );
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

  function onMerchantNoShowOverride(booking: Booking) {
    promptMerchantNoShowOverride({
      title: t('merchant_noshow_override_title'),
      message: t('merchant_noshow_override_body'),
      confirmLabel: t('merchant_noshow_override_btn'),
      cancelLabel: t('alert_cancel'),
      onConfirm: () => onBookingStatusChange(booking, 'no_show'),
    });
  }

  function renderReviewSummary() {
    return (
      <View style={[styles.ratingSummary, { borderColor: theme.border, backgroundColor: theme.card }]}>
        <Text style={[styles.ratingSummaryLabel, { color: theme.textMuted }, isRTL && styles.textRtl]}>
          {t('wash_hub_rating_summary')}
        </Text>
        <Text style={[styles.ratingSummaryValue, { color: theme.text }, isRTL && styles.textRtl]}>
          {ratingSummary.average != null ? `★ ${ratingSummary.average.toFixed(1)}` : '—'}
        </Text>
        <Text style={[styles.ratingSummaryStars, { color: theme.accent }, isRTL && styles.textRtl]}>
          {ratingSummary.average != null ? formatReviewStarRow(ratingSummary.average) : formatReviewStarRow(0)}
        </Text>
        <Text style={[styles.ratingSummaryMeta, { color: theme.textDim }, isRTL && styles.textRtl]}>
          {t('wash_hub_rating_count').replace('{count}', String(ratingSummary.count))}
        </Text>
      </View>
    );
  }

  function renderReviewRow(review: ShopReview) {
    const linkedNotification = reviewNotifications.find((row) => row.reviewId === review.id);
    const unread = linkedNotification ? !linkedNotification.read : false;

    return (
      <View
        key={review.id}
        style={[
          styles.card,
          styles.reviewCard,
          {
            borderColor: unread ? theme.brand : theme.border,
            backgroundColor: unread ? theme.bgElevated : theme.card,
          },
        ]}>
        {unread ? <UnreadPulseDot rtl={isRTL} /> : null}
        {renderBranchBadge(resolveBranchIdForReview(review, shopBookings, reviewBranchById))}
        <View style={[styles.reviewHeader, isRTL && styles.reviewHeaderRtl]}>
          <Text style={[styles.cardTitle, { color: theme.text }, isRTL && styles.textRtl]}>{review.customerName}</Text>
          <Text style={[styles.reviewStars, { color: theme.accent }, isRTL && styles.textRtl]}>
            {formatReviewStarRow(review.rating)}
          </Text>
        </View>
        <Text style={[styles.meta, { color: theme.textMuted }, isRTL && styles.textRtl]}>{review.body}</Text>
        {review.ownerReply ? (
          <Text style={[styles.meta, { color: theme.textDim }, isRTL && styles.textRtl]}>
            {t('wash_review_owner_reply')}: {review.ownerReply}
          </Text>
        ) : null}
        <TextInput
          value={replyDrafts[review.id] ?? ''}
          onChangeText={(value) => setReplyDrafts((prev) => ({ ...prev, [review.id]: value }))}
          placeholder={t('wash_hub_reply_placeholder')}
          placeholderTextColor={theme.textDim}
          multiline
          style={[
            styles.noteInput,
            {
              color: theme.text,
              borderColor: theme.border,
              backgroundColor: theme.bgElevated,
              textAlign: isRTL ? 'right' : 'left',
              writingDirection: isRTL ? 'rtl' : 'ltr',
            },
          ]}
        />
        <Pressable
          onPress={() => void onSubmitReviewReply(review.id, linkedNotification?.id)}
          disabled={busy}
          style={[
            styles.actionBtn,
            styles.actionBtnPrimary,
            {
              backgroundColor: theme.accent,
              borderColor: theme.accent,
              marginTop: 8,
              opacity: busy ? 0.6 : 1,
            },
          ]}>
          <Text style={[styles.actionBtnText, { color: theme.onAccent }]}>{t('wash_hub_reply_submit')}</Text>
        </Pressable>
      </View>
    );
  }

  function renderTabContent() {
    if (tab === 'reviews') {
      if (visibleReviews.length === 0) {
        return <Text style={[styles.empty, { color: theme.textMuted }]}>{t('wash_hub_reviews_empty')}</Text>;
      }

      return (
        <>
          {renderReviewSummary()}
          {visibleReviews.map((review) => renderReviewRow(review))}
        </>
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
        {renderBranchBadge(booking.branchId)}
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
                onPress={() => onMerchantNoShowOverride(booking)}
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
            { id: 'orders' as const, label: t('wash_hub_tab_orders'), badge: ordersTabBadge },
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
  content: { width: '100%', maxWidth: 1024, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  empty: { textAlign: 'center', fontSize: 14, lineHeight: 20, marginTop: 24 },
  textRtl: { writingDirection: 'rtl', textAlign: 'right' },
  ratingSummary: {
    borderWidth: 1,
    borderRadius: 0,
    padding: 14,
    marginBottom: 12,
    gap: 4,
  },
  ratingSummaryLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.08,
    textTransform: 'uppercase',
  },
  ratingSummaryValue: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.03,
  },
  ratingSummaryStars: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
  ratingSummaryMeta: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  branchBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.04,
  },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
  reviewCard: { position: 'relative', overflow: 'visible', borderRadius: 0 },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  reviewHeaderRtl: { flexDirection: 'row-reverse' },
  reviewStars: { fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
  notifCard: { position: 'relative', overflow: 'visible' },
  unreadDot: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 12,
    height: 12,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadDotCore: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  unreadDotRtl: { right: undefined, left: 12 },
  notifHint: { fontSize: 11, fontWeight: '600', marginTop: 8 },
  notifActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  actionBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 9,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnPrimary: {},
  actionBtnDangerSoft: {},
  actionBtnText: { fontSize: 14, fontWeight: '600', letterSpacing: 0.5 },
  cardTitle: { fontSize: 16, fontWeight: '800', marginBottom: 6, paddingRight: 18 },
  when: { fontSize: 16, fontWeight: '800', marginBottom: 6 },
  meta: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  status: { fontSize: 14, fontWeight: '800', marginTop: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chipBtn: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 9 },
  chipText: { fontSize: 13, fontWeight: '600', letterSpacing: 0.5, color: '#fff' },
  primaryBtn: { borderRadius: 9, paddingVertical: 13, alignItems: 'center' },
  primaryBtnText: { fontWeight: '600', fontSize: 15, letterSpacing: 0.5 },
  modalBackdrop: BOXED_OVERLAY.backdrop,
  modalCard: BOXED_OVERLAY.card,
  noteInput: { borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 80, marginTop: 10, textAlignVertical: 'top' },
});
