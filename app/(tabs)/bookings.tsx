import { router, useFocusEffect, type Href } from 'expo-router';
import React, { useCallback, useState } from 'react';
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

import { OrderListCard } from '@/components/customer/OrderListCard';
import { AutomotiveBackground } from '@/components/ui/AutomotiveBackground';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { addShopReview, getCustomerShopReview } from '@/lib/booking/reviewsStorage';
import { orderHistoryReviewBody } from '@/lib/booking/reviewConstants';
import {
  clearCustomerBookingHistory,
  listBookingsForPhone,
  sortBookingsByScheduledAtDesc,
} from '@/lib/booking/storage';
import type { Booking } from '@/lib/booking/types';

function formatDisplayPhone(phone: string): string {
  return phone.startsWith('+20') ? `0${phone.slice(3)}` : phone;
}

export default function MyBookingsScreen() {
  const { t, locale } = useI18n();
  const theme = useAppTheme();
  const { customer, ready: authReady } = useCustomerAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [ratedShopIds, setRatedShopIds] = useState<Set<string>>(new Set());
  const [shopRatings, setShopRatings] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(true);
  const [ratingShopId, setRatingShopId] = useState<string | null>(null);
  const [eraseConfirmVisible, setEraseConfirmVisible] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [eraseSuccessVisible, setEraseSuccessVisible] = useState(false);

  const refreshBookings = useCallback(async () => {
    if (!customer?.phone) {
      setBookings([]);
      setRatedShopIds(new Set());
      setShopRatings({});
      setBusy(false);
      return;
    }
    const rows = sortBookingsByScheduledAtDesc(await listBookingsForPhone(customer.phone));
    setBookings(rows);
    if (customer.id) {
      const shopIds = [...new Set(rows.map((row) => row.shopId))];
      const rated = new Set<string>();
      const ratings: Record<string, number> = {};
      await Promise.all(
        shopIds.map(async (shopId) => {
          const review = await getCustomerShopReview(shopId, customer.id!);
          if (review) {
            rated.add(shopId);
            ratings[shopId] = review.rating;
          }
        }),
      );
      setRatedShopIds(rated);
      setShopRatings(ratings);
    } else {
      setRatedShopIds(new Set());
      setShopRatings({});
    }
    setBusy(false);
  }, [customer?.id, customer?.phone]);

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
          await refreshBookings();
        } catch {
          if (!cancelled) setBookings([]);
        } finally {
          if (!cancelled) setBusy(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [authReady, refreshBookings]),
  );

  function onViewDetails(booking: Booking) {
    router.push(`/booking/${booking.id}` as Href);
  }

  function onBookAgain(booking: Booking) {
    router.push(`/book/${booking.shopId}`);
  }

  async function onRate(booking: Booking, rating: number) {
    if (!customer?.id || rating < 1) return;
    setRatingShopId(booking.shopId);
    try {
      await addShopReview({
        shopId: booking.shopId,
        customerId: customer.id,
        customerName: customer.name?.trim() || t('shop_review_anonymous'),
        rating,
        body: orderHistoryReviewBody(locale),
      });
      setRatedShopIds((prev) => new Set(prev).add(booking.shopId));
      setShopRatings((prev) => ({ ...prev, [booking.shopId]: rating }));
      Alert.alert(t('shop_review_success_title'), t('order_rating_saved'));
    } catch (error) {
      if (error instanceof Error && error.message === 'shop_review_already_exists') {
        const existing = await getCustomerShopReview(booking.shopId, customer.id);
        if (existing) {
          setRatedShopIds((prev) => new Set(prev).add(booking.shopId));
          setShopRatings((prev) => ({ ...prev, [booking.shopId]: existing.rating }));
        }
        Alert.alert(t('shop_review_success_title'), t('shop_review_already_rated'));
      } else {
        Alert.alert(t('shop_review_submit_fail_title'), t('shop_review_submit_fail_body'));
      }
    } finally {
      setRatingShopId(null);
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

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <AutomotiveBackground theme={theme} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {customer ? (
          <View style={[styles.pageHeader, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.profileName, { color: theme.text }]}>{customer.name}</Text>
            {customer.phone ? (
              <Text style={[styles.profilePhone, { color: theme.textMuted }]}>
                {formatDisplayPhone(customer.phone)}
              </Text>
            ) : null}
            <Text style={[styles.pageLead, { color: theme.textMuted }]}>{t('bookings_lead_customer')}</Text>
          </View>
        ) : null}

        {busy ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={theme.accent} />
        ) : bookings.length === 0 ? (
          <Text style={[styles.empty, { color: theme.textMuted }]}>{t('bookings_empty')}</Text>
        ) : (
          bookings.map((item) => (
            <OrderListCard
              key={item.id}
              booking={item}
              locale={locale}
              theme={theme}
              t={t}
              alreadyRated={ratedShopIds.has(item.shopId)}
              savedRating={shopRatings[item.shopId]}
              ratingBusy={ratingShopId === item.shopId}
              onViewDetails={() => onViewDetails(item)}
              onBookAgain={() => onBookAgain(item)}
              onRate={(rating) => onRate(item, rating)}
            />
          ))
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
      </ScrollView>

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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  pageHeader: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    gap: 4,
  },
  profileName: { fontSize: 20, fontWeight: '900' },
  profilePhone: { fontSize: 16, fontWeight: '700' },
  pageLead: { fontSize: 15, lineHeight: 22, fontWeight: '600', marginTop: 4 },
  empty: { textAlign: 'center', marginTop: 24, fontSize: 16, fontWeight: '700' },
  eraseBtn: {
    marginTop: 24,
    alignSelf: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  eraseBtnText: { fontSize: 15, fontWeight: '900' },
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
