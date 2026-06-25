import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import {
  countUnreadCustomerNotifications,
  listCustomerNotifications,
  markCustomerNotificationsSeen,
} from '@/lib/booking/commerceEvents';
import { processDueBookingReminders } from '@/lib/booking/bookingReminders';
import {
  customerNotificationIsApproved,
  customerNotificationIsReminder,
  formatCustomerNotificationLine,
} from '@/lib/booking/customerNotificationText';
import type { CustomerNotification } from '@/lib/booking/types';

export function CustomerNotificationsBell() {
  const { customer, isGuest } = useCustomerAuth();
  const { t, tp, locale } = useI18n();
  const theme = useAppTheme();
  const [visible, setVisible] = useState(false);
  const [notifications, setNotifications] = useState<CustomerNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async () => {
    await processDueBookingReminders();
    if (!customer?.phone && !customer?.id) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    const input = { customerId: customer?.id, customerPhone: customer?.phone };
    const [rows, unread] = await Promise.all([
      listCustomerNotifications(input),
      countUnreadCustomerNotifications(input),
    ]);
    setNotifications(rows);
    setUnreadCount(unread);
  }, [customer?.id, customer?.phone]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  async function openModal() {
    setVisible(true);
    if (customer) {
      await markCustomerNotificationsSeen({
        customerId: customer.id,
        customerPhone: customer.phone,
      });
      setUnreadCount(0);
    }
  }

  if (!customer || isGuest) return null;

  const notificationMessages = {
    bookingApproved: t('customer_notification_booking_approved'),
    bookingDeclined: t('customer_notification_booking_declined'),
    bookingReminderHour: t('customer_notification_booking_reminder_hour'),
    bookingReminderSoon: t('customer_notification_booking_reminder_soon'),
    partsConfirmed: t('customer_notification_parts_confirmed'),
    partsDeclined: t('customer_notification_parts_declined'),
  };

  return (
    <>
      <Pressable
        onPress={openModal}
        style={styles.bellBtn}
        accessibilityLabel={t('customer_notifications_button')}
        hitSlop={8}>
        <FontAwesome name="bell" size={20} color={theme.text} />
        {unreadCount > 0 ? (
          <View style={[styles.badge, { backgroundColor: theme.danger }]}>
            <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
          </View>
        ) : null}
      </Pressable>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.title, { color: theme.text }]}>{t('customer_notifications_title')}</Text>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
              {notifications.length === 0 ? (
                <Text style={[styles.empty, { color: theme.textMuted }]}>{t('customer_notifications_empty')}</Text>
              ) : (
                notifications.map((notification) => {
                  const approved = customerNotificationIsApproved(notification);
                  const isReminder = customerNotificationIsReminder(notification);
                  return (
                    <View
                      key={notification.id}
                      style={[styles.row, { borderTopColor: theme.border, backgroundColor: theme.bgElevated }]}>
                      <View style={styles.rowHead}>
                        <Text style={[styles.rowText, { color: theme.text, flex: 1 }]}>
                          {formatCustomerNotificationLine(notification, locale, notificationMessages)}
                        </Text>
                        <View
                          style={[
                            styles.pill,
                            {
                              backgroundColor: approved ? theme.accentSoft : theme.bgElevated,
                              borderColor: approved ? theme.accent : theme.danger,
                            },
                          ]}>
                          <Text
                            style={{
                              color: approved ? theme.accent : theme.danger,
                              fontSize: 11,
                              fontWeight: '800',
                            }}>
                            {isReminder
                              ? t('customer_notification_status_reminder')
                              : approved
                                ? t('customer_notification_status_approved')
                                : t('customer_notification_status_declined')}
                          </Text>
                        </View>
                      </View>
                      {notification.ownerNote ? (
                        <Text style={[styles.meta, { color: theme.textMuted }]}>
                          {tp('customer_notification_owner_note', { note: notification.ownerNote })}
                        </Text>
                      ) : null}
                      <Text style={[styles.meta, { color: theme.textMuted }]}>
                        {new Date(notification.createdAt).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-EG')}
                      </Text>
                    </View>
                  );
                })
              )}
            </ScrollView>
            <Pressable
              onPress={() => setVisible(false)}
              style={[styles.closeBtn, { backgroundColor: theme.accent }]}>
              <Text style={[styles.closeBtnText, { color: theme.onAccent }]}>{t('welcome_ok')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bellBtn: {
    marginRight: 16,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '85%',
    borderWidth: 1,
    borderRadius: 18,
    padding: 20,
  },
  title: { fontSize: 20, fontWeight: '900', marginBottom: 12 },
  scroll: { maxHeight: 420 },
  scrollContent: { paddingBottom: 8 },
  empty: { fontSize: 14, lineHeight: 21 },
  row: {
    borderTopWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  rowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  rowText: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  pill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  meta: { fontSize: 13, lineHeight: 19, marginTop: 6 },
  closeBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  closeBtnText: { fontSize: 15, fontWeight: '800' },
});
