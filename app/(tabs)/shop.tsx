import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { MerchantCampaignsPanel } from '@/components/merchant/MerchantCampaignsPanel';
import { OwnerHistoryPanel } from '@/components/owner/OwnerHistoryPanel';
import { OwnerProfileHeader } from '@/components/owner/OwnerProfileHeader';
import { useMerchantOrderNotifier } from '@/components/merchant/OrderNotifier';
import { OwnerSectionCard } from '@/components/owner/OwnerSectionCard';
import { WashOwnerPanel } from '@/components/owner/wash/WashOwnerPanel';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import {
  listOwnerNotificationsForShop,
  pushCustomerNotification,
  resolveOwnerNotification,
} from '@/lib/booking/commerceEvents';
import { formatEgp } from '@/lib/booking/reporting';
import { useShopAuth } from '@/context/ShopAuthContext';
import { useAppSignOut } from '@/lib/auth/useAppSignOut';
import { userAlert } from '@/lib/ui/userAlert';
import { bookingStatusLabel, DEFAULT_WORK_CLOSE, DEFAULT_WORK_OPEN, DEFAULT_SERVICE_DURATION_MINUTES, formatBookingDateTime, formatShopScheduleLine, normalizeTimeHm, shopTypeLabel } from '@/lib/booking/format';
import {
  cancelBookingReminders,
  scheduleBookingReminders,
} from '@/lib/booking/bookingReminders';
import {
  addInventoryItem,
  listInventoryForShop,
  listPartsOrdersForShop,
  updateInventoryStock,
  updatePartsOrderStatus,
} from '@/lib/booking/partsStorage';
import { isStoreShopType, storeCategoryForShopType } from '@/lib/booking/storeCatalog';
import { uploadImageToBucket } from '@/lib/supabase/storageUpload';
import {
  addShopImage,
  getShopExtras,
  removeShopImage,
  setShopCoverImage,
  setShopProfileInfo,
  setShopProfileImage,
  setShopSchedule,
  setShopServicePrice,
  setShopWeeklyHours,
  shopHasSavedSchedule,
} from '@/lib/booking/shopExtrasStorage';
import { defaultWeeklyHours } from '@/lib/booking/shopSchedule';
import { listBookingsForShop, sortBookingsByScheduledAtDesc, updateBookingStatus } from '@/lib/booking/storage';
import { registerOwnerPushToken } from '@/lib/push/shopPush';
import type {
  Booking,
  OwnerNotification,
  OwnerNotificationResolution,
  PartsOrder,
  ShopExtras,
  StoreItem,
} from '@/lib/booking/types';
import { isWashShopType } from '@/lib/booking/wash/types';

const webListScrollStyle =
  Platform.OS === 'web'
    ? ({ overflowY: 'auto' as const, overflowX: 'hidden' as const } as const)
    : null;

export default function ShopScreen() {
  const theme = useAppTheme();
  const { t, tp, locale } = useI18n();
  const { ready, shop, busy, login, isAdmin, shopStaff } = useShopAuth();

  useEffect(() => {
    if (ready && isAdmin) {
      router.replace('/admin');
    }
  }, [ready, isAdmin]);
  const { signOut } = useAppSignOut();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [panelTab, setPanelTab] = useState<'workspace' | 'history'>('workspace');
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [inventory, setInventory] = useState<StoreItem[]>([]);
  const [partsOrders, setPartsOrders] = useState<PartsOrder[]>([]);
  const [loadingParts, setLoadingParts] = useState(false);
  const [newPartName, setNewPartName] = useState('');
  const [newPartPrice, setNewPartPrice] = useState('');
  const [newPartStock, setNewPartStock] = useState('1');
  const [newPartImage, setNewPartImage] = useState('');
  const [ownerNotifications, setOwnerNotifications] = useState<OwnerNotification[]>([]);
  const [shopExtras, setShopExtras] = useState<ShopExtras | null>(null);
  const [pickingImage, setPickingImage] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileNameAr, setProfileNameAr] = useState('');
  const [profileAddress, setProfileAddress] = useState('');
  const [profileAddressAr, setProfileAddressAr] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [moreInfo, setMoreInfo] = useState('');
  const [moreInfoAr, setMoreInfoAr] = useState('');
  const [winchEnabled, setWinchEnabled] = useState(false);
  const [winchPhone, setWinchPhone] = useState('');
  const [newServicePrice, setNewServicePrice] = useState('');
  const [workOpenTime, setWorkOpenTime] = useState(DEFAULT_WORK_OPEN);
  const [workCloseTime, setWorkCloseTime] = useState(DEFAULT_WORK_CLOSE);
  const [serviceDurationMinutes, setServiceDurationMinutes] = useState(String(DEFAULT_SERVICE_DURATION_MINUTES));
  const [notificationsModalVisible, setNotificationsModalVisible] = useState(false);
  const [decisionTarget, setDecisionTarget] = useState<{
    notification: OwnerNotification;
    resolution: OwnerNotificationResolution;
  } | null>(null);
  const [decisionNote, setDecisionNote] = useState('');
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [saveNotice, setSaveNotice] = useState<{ title: string; body: string } | null>(null);
  const [scheduleInlineOk, setScheduleInlineOk] = useState(false);

  const orderNotifier = useMerchantOrderNotifier({
    shopId: shop?.id,
    staff: shopStaff,
    locale,
    enabled: Boolean(shop && ready && !isWashShopType(shop.type)),
  });

  const refreshOwnerNotifications = useCallback(async () => {
    if (!shop) return;
    const rows = await listOwnerNotificationsForShop(shop.id);
    setOwnerNotifications(rows);
  }, [shop]);

  const refreshShopExtras = useCallback(async () => {
    if (!shop) return;
    const row = await getShopExtras(shop.id);
    setShopExtras(row);
    if (row.servicePriceEgp != null) setNewServicePrice(String(row.servicePriceEgp));
    setProfileName(row.profileName ?? shop.name);
    setProfileNameAr(row.profileNameAr ?? '');
    setProfileAddress(row.profileAddress ?? shop.address);
    setProfileAddressAr(row.profileAddressAr ?? '');
    setProfilePhone(row.profilePhone ?? shop.phone);
    setProfileEmail(row.profileEmail ?? '');
    setMoreInfo(row.moreInfo ?? '');
    setMoreInfoAr(row.moreInfoAr ?? '');
    setWinchEnabled(!!row.winchEnabled);
    setWinchPhone(row.winchPhone ?? '');
    setWorkOpenTime(row.workOpenTime ?? DEFAULT_WORK_OPEN);
    setWorkCloseTime(row.workCloseTime ?? DEFAULT_WORK_CLOSE);
    setServiceDurationMinutes(String(row.serviceDurationMinutes ?? DEFAULT_SERVICE_DURATION_MINUTES));
  }, [shop]);

  const refreshBookings = useCallback(async () => {
    if (!shop) return;
    setLoadingBookings(true);
    const rows = await listBookingsForShop(shop.id);
    setBookings(rows);
    setLoadingBookings(false);
  }, [shop]);

  const refreshPartsData = useCallback(async () => {
    if (!shop) return;
    const category = storeCategoryForShopType(shop.type);
    if (!category) return;
    setLoadingParts(true);
    try {
      const [invRows, orderRows] = await Promise.all([
        listInventoryForShop(shop.id, category),
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
      refreshOwnerNotifications();
      refreshShopExtras();
      if (isStoreShopType(shop.type)) refreshPartsData();
      else {
        refreshBookings();
        void orderNotifier.refresh();
      }
    }, [shop, refreshBookings, refreshPartsData, refreshOwnerNotifications, refreshShopExtras, orderNotifier.refresh]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!shop) return;
      registerOwnerPushToken({
        shopId: shop.id,
        ownerEmail: shop.ownerEmail,
        locale,
      }).catch(() => {});
    }, [shop, locale]),
  );

  const activeBookings = useMemo(
    () =>
      sortBookingsByScheduledAtDesc(bookings.filter((booking) => booking.status === 'pending')),
    [bookings],
  );

  async function onLogin() {
    const result = await login(email, password);
    if (result === 'invalid_credentials') {
      userAlert(t('shop_login_auth_fail_title'), t('shop_login_auth_fail_body'));
      return;
    }
    if (result === 'shop_not_found') {
      userAlert(t('shop_login_shop_not_found_title'), t('shop_login_shop_not_found_body'));
      return;
    }
    if (result === 'ok_admin') {
      router.replace('/admin');
      return;
    }
    if (result !== 'ok') {
      userAlert(t('shop_login_fail_title'), t('shop_login_fail_body'));
    }
  }

  async function onLogout() {
    await signOut({ welcomeFocus: 'owner' });
  }

  async function onAddPart() {
    if (!shop) return;
    const category = storeCategoryForShopType(shop.type);
    if (!category) return;
    const price = Number(newPartPrice);
    const stock = Number(newPartStock);
    if (!newPartName.trim() || Number.isNaN(price) || price < 0 || Number.isNaN(stock) || stock < 0) {
      Alert.alert(t('parts_owner_invalid_part_title'), t('parts_owner_invalid_part_body'));
      return;
    }
    await addInventoryItem(shop.id, category, {
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
    if (!shop) return;
    const category = storeCategoryForShopType(shop.type);
    if (!category) return;
    await updateInventoryStock(shop.id, category, partId, delta);
    await refreshPartsData();
  }

  async function onPartsOrderStatusChange(orderId: string, status: PartsOrder['status']) {
    if (!shop || !isStoreShopType(shop.type)) return;
    await updatePartsOrderStatus(shop.id, orderId, status);
    await refreshPartsData();
  }

  function renderBookingCard(item: Booking, showActions: boolean) {
    return (
      <View key={item.id} style={[styles.card, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
        <Text style={[styles.when, { color: theme.text }]}>{formatBookingDateTime(item.scheduledAt, locale)}</Text>
        <Text style={[styles.meta, { color: theme.textMuted }]}>{t('book_phone_label')}: {item.customerPhone}</Text>
        <Text style={[styles.meta, { color: theme.textMuted }]}>{t('book_car_type_label')}: {item.carType}</Text>
        {item.carColor ? (
          <Text style={[styles.meta, { color: theme.textMuted }]}>{t('book_car_color_label')}: {item.carColor}</Text>
        ) : null}
        <Text style={[styles.status, { color: theme.accent }]}>{bookingStatusLabel(item.status, locale)}</Text>
        {showActions && item.status === 'pending' ? (
          <View style={styles.actions}>
            <Pressable
              onPress={() => openBookingCardDecision(item, 'approved')}
              style={[styles.chipBtn, { backgroundColor: theme.accent, borderColor: theme.accent }]}>
              <Text style={[styles.actionText, { color: theme.onAccent }]}>{t('shop_action_approve')}</Text>
            </Pressable>
            <Pressable
              onPress={() => openBookingCardDecision(item, 'declined')}
              style={[styles.chipBtn, { backgroundColor: theme.danger, borderColor: theme.danger }]}>
              <Text style={styles.actionText}>{t('shop_action_decline')}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  }

  function partsStatusLabel(status: PartsOrder['status']) {
    if (status === 'pending') return t('parts_status_pending');
    if (status === 'confirmed') return t('parts_status_confirmed');
    if (status === 'cancelled') return t('parts_status_cancelled');
    return t('parts_status_shipped');
  }

  function notificationCarType(notification: OwnerNotification): string {
    if (notification.carType?.trim()) return notification.carType.trim();
    if (notification.bookingId) {
      const booking = bookings.find((row) => row.id === notification.bookingId);
      if (booking?.carType?.trim()) return booking.carType.trim();
    }
    return t('shop_notification_car_unknown');
  }

  function notificationStatus(notification: OwnerNotification): OwnerNotificationResolution | 'pending' {
    if (notification.resolution) return notification.resolution;
    if (notification.bookingId) {
      const booking = bookings.find((row) => row.id === notification.bookingId);
      if (booking?.status === 'confirmed' || booking?.status === 'done') return 'approved';
      if (booking?.status === 'cancelled') return 'declined';
    }
    return 'pending';
  }

  const pendingNotificationCount = orderNotifier.pendingCount;

  function notificationForBooking(booking: Booking): OwnerNotification {
    return (
      ownerNotifications.find(
        (row) => row.kind === 'service_booking' && row.bookingId === booking.id,
      ) ?? {
        id: `booking-${booking.id}`,
        shopId: shop!.id,
        kind: 'service_booking',
        createdAt: booking.createdAt,
        bookingId: booking.id,
        customerPhone: booking.customerPhone,
        shopType: booking.shopType,
        carType: booking.carType,
        scheduledAt: booking.scheduledAt,
      }
    );
  }

  function openBookingDecision(notification: OwnerNotification, resolution: OwnerNotificationResolution) {
    setDecisionNote('');
    setDecisionTarget({ notification, resolution });
  }

  function openBookingCardDecision(booking: Booking, resolution: OwnerNotificationResolution) {
    openBookingDecision(notificationForBooking(booking), resolution);
  }

  async function submitBookingDecision() {
    if (!shop || !decisionTarget?.notification.bookingId) return;
    setDecisionBusy(true);
    try {
      const { notification, resolution } = decisionTarget;
      const bookingId = notification.bookingId;
      if (!bookingId) return;
      const status = resolution === 'approved' ? 'confirmed' : 'cancelled';
      await updateBookingStatus(bookingId, status);
      orderNotifier.patchBookingLocally(bookingId, status);
      orderNotifier.removePendingLocally(bookingId);
      setBookings((prev) => prev.map((row) => (row.id === bookingId ? { ...row, status } : row)));
      const storedNotification = ownerNotifications.find((row) => row.id === notification.id);
      if (storedNotification) {
        await resolveOwnerNotification({
          shopId: shop.id,
          notificationId: notification.id,
          resolution,
          ownerNote: decisionNote.trim() || undefined,
        });
        setOwnerNotifications((prev) =>
          prev.map((row) =>
            row.id === notification.id
              ? {
                  ...row,
                  resolution,
                  ownerNote: decisionNote.trim() || undefined,
                  resolvedAt: new Date().toISOString(),
                }
              : row,
          ),
        );
      }
      const booking = bookings.find((row) => row.id === bookingId);
      if (resolution !== 'approved') {
        await pushCustomerNotification({
          customerId: booking?.customerId,
          customerPhone: notification.customerPhone,
          kind: 'booking_declined',
          shopId: shop.id,
          bookingId,
          scheduledAt: notification.scheduledAt ?? booking?.scheduledAt,
          ownerNote: decisionNote.trim() || undefined,
        });
      }
      const scheduledAt = notification.scheduledAt ?? booking?.scheduledAt;
      if (resolution === 'approved' && scheduledAt) {
        await scheduleBookingReminders({
          bookingId,
          shopId: shop.id,
          customerId: booking?.customerId,
          customerPhone: notification.customerPhone,
          scheduledAt,
          locale,
        });
      } else {
        await cancelBookingReminders(bookingId);
      }
      setDecisionTarget(null);
      setDecisionNote('');
      await refreshBookings();
      await refreshOwnerNotifications();
    } finally {
      setDecisionBusy(false);
    }
  }

  function notificationStatusLabel(status: OwnerNotificationResolution | 'pending'): string {
    if (status === 'approved') return t('shop_notification_status_approved');
    if (status === 'declined') return t('shop_notification_status_declined');
    return t('shop_notification_status_pending');
  }

  function ownerNotificationLine(notification: OwnerNotification): string {
    if (notification.kind === 'service_booking') {
      const serviceLabel = notification.shopType
        ? shopTypeLabel(notification.shopType, locale)
        : t('service_maintenance_title');
      const when = notification.scheduledAt
        ? formatBookingDateTime(notification.scheduledAt, locale)
        : new Date(notification.createdAt).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-EG');
      return t('shop_notification_service_booking_line')
        .replace('{service}', serviceLabel)
        .replace('{phone}', notification.customerPhone)
        .replace('{carType}', notificationCarType(notification))
        .replace('{when}', when);
    }
    const partsCount = String(notification.partsCount ?? 0);
    const total = formatEgp(notification.totalEgp ?? 0, locale);
    return t('shop_notification_parts_order_line')
      .replace('{phone}', notification.customerPhone)
      .replace('{count}', partsCount)
      .replace('{total}', total);
  }

  function renderOwnerNotificationRow(notification: OwnerNotification) {
    const status = notificationStatus(notification);
    const canDecide =
      notification.kind === 'service_booking' && !!notification.bookingId && status === 'pending';

    return (
      <View key={notification.id} style={[styles.notificationRow, { borderTopColor: theme.border }]}>
        <View style={styles.notificationHead}>
          <Text style={[styles.metaStrong, { color: theme.text, flex: 1 }]}>{ownerNotificationLine(notification)}</Text>
          <View
            style={[
              styles.statusPill,
              {
                backgroundColor: status === 'approved' ? theme.accentSoft : theme.bgElevated,
                borderColor: status === 'declined' ? theme.danger : theme.border,
              },
            ]}>
            <Text
              style={{
                color: status === 'approved' ? theme.accent : status === 'declined' ? theme.danger : theme.textMuted,
                fontSize: 11,
                fontWeight: '800',
              }}>
              {notificationStatusLabel(status)}
            </Text>
          </View>
        </View>
        {notification.kind === 'service_booking' ? (
          <Text style={[styles.meta, { color: theme.textMuted }]}>
            {t('book_car_type_label')}: {notificationCarType(notification)}
          </Text>
        ) : null}
        <Text style={[styles.meta, { color: theme.textMuted }]}>
          {new Date(notification.createdAt).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-EG')}
        </Text>
        {notification.ownerNote ? (
          <Text style={[styles.meta, { color: theme.textMuted }]}>
            {tp('customer_notification_owner_note', { note: notification.ownerNote })}
          </Text>
        ) : null}
        {canDecide ? (
          <View style={styles.actions}>
            <Pressable
              onPress={() => openBookingDecision(notification, 'approved')}
              style={[styles.chipBtn, { backgroundColor: theme.accent, borderColor: theme.accent }]}>
              <Text style={[styles.actionText, { color: theme.onAccent }]}>{t('shop_action_approve')}</Text>
            </Pressable>
            <Pressable
              onPress={() => openBookingDecision(notification, 'declined')}
              style={[styles.chipBtn, { backgroundColor: theme.danger, borderColor: theme.danger }]}>
              <Text style={styles.actionText}>{t('shop_action_decline')}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  }

  async function onSetCoverImage() {
    if (!shop) return;
    if (Platform.OS !== 'web') {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t('shop_image_permission_title'), t('shop_image_permission_body'));
        return;
      }
    }
    setPickingImage(true);
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: Platform.OS !== 'web',
        quality: 0.8,
      });
      if (picked.canceled || !picked.assets?.length) return;
      const asset = picked.assets[0];
      const uri = asset.uri;
      if (!uri) return;
      const uploadedUrl = await uploadImageToBucket({
        localUri: uri,
        mimeType: asset.mimeType,
        bucket: 'shop-assets',
        folderPath: `${shop.id}/cover`,
      });
      await setShopCoverImage(shop.id, uploadedUrl);
      await refreshShopExtras();
    } finally {
      setPickingImage(false);
    }
  }

  async function onAddShopImage() {
    if (!shop) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('shop_image_permission_title'), t('shop_image_permission_body'));
      return;
    }
    setPickingImage(true);
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: 5,
        quality: 0.8,
      });
      if (picked.canceled || !picked.assets?.length) return;
      for (const asset of picked.assets) {
        if (!asset.uri) continue;
        const uploadedUrl = await uploadImageToBucket({
          localUri: asset.uri,
          mimeType: asset.mimeType,
          bucket: 'shop-gallery',
          folderPath: `${shop.id}/gallery`,
        });
        await addShopImage(shop.id, uploadedUrl);
      }
      await refreshShopExtras();
    } finally {
      setPickingImage(false);
    }
  }

  async function onSetProfileImage() {
    if (!shop) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('shop_image_permission_title'), t('shop_image_permission_body'));
      return;
    }
    setPickingImage(true);
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      });
      if (picked.canceled || !picked.assets?.length) return;
      const asset = picked.assets[0];
      const uri = asset.uri;
      if (!uri) return;
      const uploadedUrl = await uploadImageToBucket({
        localUri: uri,
        mimeType: asset.mimeType,
        bucket: 'shop-assets',
        folderPath: `${shop.id}/profile`,
      });
      await setShopProfileImage(shop.id, uploadedUrl);
      await refreshShopExtras();
    } finally {
      setPickingImage(false);
    }
  }

  async function onRemoveShopImage(imageUrl: string) {
    if (!shop) return;
    await removeShopImage(shop.id, imageUrl);
    await refreshShopExtras();
  }

  function showSaveNotice(title: string, body: string) {
    setSaveNotice({ title, body });
  }

  async function onSaveServicePrice() {
    if (!shop) return;
    const price = Number(newServicePrice);
    if (Number.isNaN(price) || price < 0) {
      showSaveNotice(t('shop_price_invalid_title'), t('shop_price_invalid_body'));
      return;
    }
    await setShopServicePrice(shop.id, price);
    await refreshShopExtras();
    showSaveNotice(t('shop_price_saved_title'), t('shop_price_saved_body'));
  }

  async function onSaveSchedule() {
    if (!shop) return;
    const open = normalizeTimeHm(workOpenTime);
    const close = normalizeTimeHm(workCloseTime);
    const duration = Number(serviceDurationMinutes);
    if (!open || !close || Number.isNaN(duration) || duration < 15) {
      setScheduleInlineOk(false);
      showSaveNotice(t('shop_schedule_invalid_title'), t('shop_schedule_invalid_body'));
      return;
    }
    if (hmToMinutesCloseBeforeOpen(open, close)) {
      setScheduleInlineOk(false);
      showSaveNotice(t('shop_schedule_invalid_title'), t('shop_schedule_close_before_open'));
      return;
    }
    const saved = await setShopSchedule(shop.id, {
      workOpenTime: open,
      workCloseTime: close,
      serviceDurationMinutes: duration,
    });
    const weeklyHours = defaultWeeklyHours().map((row) => ({
      ...row,
      openTime: open,
      closeTime: close,
      closed: row.day === 5,
    }));
    const withWeekly = await setShopWeeklyHours(shop.id, weeklyHours);
    setWorkOpenTime(saved.workOpenTime ?? open);
    setWorkCloseTime(saved.workCloseTime ?? close);
    setServiceDurationMinutes(String(saved.serviceDurationMinutes ?? duration));
    setShopExtras(withWeekly);
    setScheduleInlineOk(true);
    showSaveNotice(
      t('shop_schedule_saved_title'),
      `${t('shop_schedule_saved_body')}\n\n${formatShopScheduleLine(open, close, duration, locale)}`,
    );
  }

  function hmToMinutesCloseBeforeOpen(open: string, close: string): boolean {
    const o = open.split(':').map(Number);
    const c = close.split(':').map(Number);
    return c[0] * 60 + c[1] <= o[0] * 60 + o[1];
  }

  async function onSaveProfileInfo() {
    if (!shop) return;
    if (!profileName.trim() || !profileAddress.trim() || !profilePhone.trim()) {
      Alert.alert(t('shop_profile_invalid_title'), t('shop_profile_invalid_body'));
      return;
    }
    await setShopProfileInfo(shop.id, {
      profileName,
      profileNameAr,
      profileAddress,
      profileAddressAr,
      profilePhone,
      profileEmail,
      moreInfo,
      moreInfoAr,
      winchEnabled: shop.type === 'maintenance' ? winchEnabled : false,
      winchPhone: shop.type === 'maintenance' ? winchPhone : undefined,
    });
    await refreshShopExtras();
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
      <ScrollView
        style={[styles.screen, { backgroundColor: theme.bg }]}
        contentContainerStyle={styles.loginContent}>
        <Text style={[styles.title, { color: theme.text }]}>{t('shop_login_title')}</Text>
        <Text style={[styles.lead, { color: theme.textMuted }]}>{t('shop_login_lead')}</Text>
        <Text style={[styles.label, { color: theme.text }]}>{t('shop_email_label')}</Text>
        <TextInput
          placeholder="wash@demo.com"
          placeholderTextColor={theme.textDim}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bgElevated }]}
        />
        <Text style={[styles.label, { color: theme.text }]}>{t('customer_password_placeholder')}</Text>
        <TextInput
          placeholder="demo123"
          placeholderTextColor={theme.textDim}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bgElevated }]}
        />
        <Pressable
          onPress={onLogin}
          disabled={busy}
          style={[styles.primaryBtn, { backgroundColor: theme.accent, opacity: busy ? 0.65 : 1 }]}>
          <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>{t('shop_login_btn')}</Text>
        </Pressable>
        <Text style={[styles.demoHint, { color: theme.textDim }]}>{t('shop_demo_accounts')}</Text>
      </ScrollView>
    );
  }

  const fieldStyle = [styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bgElevated }];

  if (isWashShopType(shop.type)) {
    return <WashOwnerPanel shop={shop} />;
  }

  const shopName =
    locale === 'ar'
      ? shopExtras?.profileNameAr || shopExtras?.profileName || shop.nameAr
      : shopExtras?.profileName || shop.name;
  const coverImage = shopExtras?.imageUrls?.[0];
  const profileImage = shopExtras?.profileImageUrl;

  const ownerProfileHero = (
    <OwnerProfileHeader
      theme={theme}
      shopName={shopName}
      typeLabel={shopTypeLabel(shop.type, locale)}
      welcomeLine={t('shop_welcome_back').replace('{name}', shopName)}
      coverImage={coverImage}
      profileImage={profileImage}
      pickingImage={pickingImage}
      coverEditLabel={t('shop_manage_add_image')}
      onEditCover={onSetCoverImage}
      onEditProfile={onSetProfileImage}
      notificationsLabel={t('shop_notifications_button')}
      notificationCount={pendingNotificationCount}
      onOpenNotifications={() => setNotificationsModalVisible(true)}
    />
  );

  const ownerManageSections = (
    <>
      <OwnerSectionCard theme={theme} title={t('shop_manage_profile_title')} subtitle={t('shop_manage_lead')}>
        <TextInput placeholder={t('shop_manage_profile_name_placeholder')} placeholderTextColor={theme.textDim} value={profileName} onChangeText={setProfileName} style={fieldStyle} />
        <TextInput placeholder={t('shop_manage_profile_name_ar_placeholder')} placeholderTextColor={theme.textDim} value={profileNameAr} onChangeText={setProfileNameAr} style={fieldStyle} />
        <TextInput placeholder={t('shop_manage_profile_phone_placeholder')} placeholderTextColor={theme.textDim} keyboardType="phone-pad" value={profilePhone} onChangeText={setProfilePhone} style={fieldStyle} />
        <TextInput placeholder={t('shop_manage_profile_email_placeholder')} placeholderTextColor={theme.textDim} keyboardType="email-address" autoCapitalize="none" value={profileEmail} onChangeText={setProfileEmail} style={fieldStyle} />
        <TextInput placeholder={t('shop_manage_profile_address_placeholder')} placeholderTextColor={theme.textDim} value={profileAddress} onChangeText={setProfileAddress} style={fieldStyle} />
        <TextInput placeholder={t('shop_manage_profile_address_ar_placeholder')} placeholderTextColor={theme.textDim} value={profileAddressAr} onChangeText={setProfileAddressAr} style={fieldStyle} />
        <Text style={[styles.inlineSectionTitle, { color: theme.text }]}>{t('shop_manage_more_info_title')}</Text>
        <TextInput
          placeholder={t('shop_manage_more_info_placeholder')}
          placeholderTextColor={theme.textDim}
          value={moreInfo}
          onChangeText={setMoreInfo}
          multiline
          style={[fieldStyle, styles.noteInput]}
        />
        <TextInput
          placeholder={t('shop_manage_more_info_ar_placeholder')}
          placeholderTextColor={theme.textDim}
          value={moreInfoAr}
          onChangeText={setMoreInfoAr}
          multiline
          style={[fieldStyle, styles.noteInput]}
        />
        {shop.type === 'maintenance' ? (
          <>
            <Text style={[styles.inlineSectionTitle, { color: theme.text }]}>{t('shop_manage_winch_title')}</Text>
            <View style={styles.actions}>
              <Pressable onPress={() => setWinchEnabled(true)} style={[styles.chipBtn, { backgroundColor: winchEnabled ? theme.accent : theme.bgElevated, borderColor: theme.border }]}>
                <Text style={[styles.chipBtnText, { color: winchEnabled ? theme.onAccent : theme.text }]}>{t('shop_manage_winch_enable')}</Text>
              </Pressable>
              <Pressable onPress={() => setWinchEnabled(false)} style={[styles.chipBtn, { backgroundColor: !winchEnabled ? theme.accent : theme.bgElevated, borderColor: theme.border }]}>
                <Text style={[styles.chipBtnText, { color: !winchEnabled ? theme.onAccent : theme.text }]}>{t('shop_manage_winch_disable')}</Text>
              </Pressable>
            </View>
            <TextInput placeholder={t('shop_manage_winch_phone_placeholder')} placeholderTextColor={theme.textDim} keyboardType="phone-pad" value={winchPhone} onChangeText={setWinchPhone} editable={winchEnabled} style={[fieldStyle, { opacity: winchEnabled ? 1 : 0.55 }]} />
          </>
        ) : null}
        <Pressable onPress={onSaveProfileInfo} style={[styles.primaryBtn, { backgroundColor: theme.accent }]}>
          <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>{t('shop_manage_save_profile')}</Text>
        </Pressable>
      </OwnerSectionCard>

      <OwnerSectionCard theme={theme} title={t('shop_profile_album')} subtitle={t('shop_manage_image_label')}>
        <Pressable onPress={onAddShopImage} disabled={pickingImage} style={[styles.secondaryBtn, { borderColor: theme.border, opacity: pickingImage ? 0.65 : 1 }]}>
          <Text style={[styles.secondaryBtnText, { color: theme.text }]}>{pickingImage ? t('shop_manage_picking_image') : t('shop_manage_add_image')}</Text>
        </Pressable>
        {shopExtras?.imageUrls?.length ? (
          <View style={styles.albumGrid}>
            {shopExtras.imageUrls.map((url) => (
              <View key={url} style={[styles.albumTile, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                <Image source={{ uri: url }} style={styles.albumImage} contentFit="cover" />
                <Pressable onPress={() => onRemoveShopImage(url)} style={[styles.removePhotoBtn, { backgroundColor: theme.danger }]}>
                  <Text style={styles.actionText}>{t('shop_manage_remove_image')}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : (
          <Text style={[styles.emptyHint, { color: theme.textMuted }]}>{t('shop_manage_profile_image_hint')}</Text>
        )}
      </OwnerSectionCard>

      <OwnerSectionCard theme={theme} title={t('shop_manage_price_label')}>
        <TextInput placeholder={t('shop_manage_price_placeholder')} placeholderTextColor={theme.textDim} keyboardType="numeric" value={newServicePrice} onChangeText={setNewServicePrice} style={fieldStyle} />
        <Pressable onPress={onSaveServicePrice} style={[styles.primaryBtn, { backgroundColor: theme.accent }]}>
          <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>{t('shop_manage_save_price')}</Text>
        </Pressable>
      </OwnerSectionCard>

      {!isStoreShopType(shop.type) ? (
        <OwnerSectionCard theme={theme} title={t('shop_manage_schedule_title')} subtitle={t('shop_manage_schedule_lead')}>
          <Text style={[styles.meta, { color: theme.textMuted, marginBottom: 8 }]}>{t('shop_manage_time_format_hint')}</Text>
          <Text style={[styles.label, { color: theme.text }]}>{t('shop_manage_work_open_label')}</Text>
          <TextInput placeholder="12:00" placeholderTextColor={theme.textDim} value={workOpenTime} onChangeText={(v) => { setWorkOpenTime(v); setScheduleInlineOk(false); }} style={fieldStyle} />
          <Text style={[styles.label, { color: theme.text }]}>{t('shop_manage_work_close_label')}</Text>
          <TextInput placeholder="22:00" placeholderTextColor={theme.textDim} value={workCloseTime} onChangeText={(v) => { setWorkCloseTime(v); setScheduleInlineOk(false); }} style={fieldStyle} />
          <Text style={[styles.label, { color: theme.text }]}>{t('shop_manage_duration_label')}</Text>
          <TextInput placeholder="30" placeholderTextColor={theme.textDim} keyboardType="numeric" value={serviceDurationMinutes} onChangeText={(v) => { setServiceDurationMinutes(v); setScheduleInlineOk(false); }} style={fieldStyle} />
          {shopHasSavedSchedule(shopExtras) && shopExtras?.workOpenTime && shopExtras.workCloseTime && shopExtras.serviceDurationMinutes ? (
            <Text style={[styles.meta, { color: theme.accent, marginBottom: 8 }]}>
              {formatShopScheduleLine(
                shopExtras.workOpenTime,
                shopExtras.workCloseTime,
                shopExtras.serviceDurationMinutes,
                locale,
              )}
            </Text>
          ) : null}
          {scheduleInlineOk ? (
            <Text style={[styles.meta, { color: theme.accent, fontWeight: '800', marginBottom: 8 }]}>
              ✓ {t('shop_schedule_saved_customer_hint')}
            </Text>
          ) : null}
          <Pressable onPress={onSaveSchedule} style={[styles.primaryBtn, { backgroundColor: theme.accent }]}>
            <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>{t('shop_manage_save_schedule')}</Text>
          </Pressable>
        </OwnerSectionCard>
      ) : null}

      {!isStoreShopType(shop.type) ? (
        <OwnerSectionCard theme={theme} title={t('shop_profile_services')} subtitle={t('shop_manage_services_lead')}>
          {(shopExtras?.services?.length ? shopExtras.services : []).slice(0, 6).map((service) => (
            <Text key={service.id} style={[styles.meta, { color: theme.textMuted }]}>
              {locale === 'ar' ? service.nameAr || service.name : service.name} · {service.priceEgp} EGP · {service.durationMinutes} min
            </Text>
          ))}
          {!shopExtras?.services?.length ? (
            <Text style={[styles.meta, { color: theme.textMuted }]}>{t('wash_services_empty')}</Text>
          ) : null}
        </OwnerSectionCard>
      ) : null}

      <OwnerSectionCard theme={theme} title={t('campaign_panel_title')} subtitle={t('campaign_panel_lead')}>
        <MerchantCampaignsPanel shopId={shop.id} />
      </OwnerSectionCard>
    </>
  );

  const ownerModals = (
    <>
      <Modal
        visible={notificationsModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNotificationsModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{t('shop_notifications_button')}</Text>
            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
              {ownerNotifications.filter((row) => notificationStatus(row) === 'pending').length === 0 ? (
                <Text style={[styles.meta, { color: theme.textMuted }]}>{t('shop_notifications_empty')}</Text>
              ) : (
                ownerNotifications
                  .filter((row) => notificationStatus(row) === 'pending')
                  .map((notification) => renderOwnerNotificationRow(notification))
              )}
            </ScrollView>
            <Pressable
              onPress={() => setNotificationsModalVisible(false)}
              style={[styles.primaryBtn, { backgroundColor: theme.accent, marginTop: 12 }]}>
              <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>{t('welcome_ok')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!decisionTarget}
        transparent
        animationType="fade"
        onRequestClose={() => !decisionBusy && setDecisionTarget(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              {decisionTarget?.resolution === 'approved'
                ? t('shop_booking_decision_approve_title')
                : t('shop_booking_decision_decline_title')}
            </Text>
            <Text style={[styles.meta, { color: theme.textMuted }]}>{t('shop_booking_decision_body')}</Text>
            <Text style={[styles.label, { color: theme.text, marginTop: 12 }]}>{t('shop_owner_note_label')}</Text>
            <TextInput
              value={decisionNote}
              onChangeText={setDecisionNote}
              placeholder={t('shop_owner_note_placeholder')}
              placeholderTextColor={theme.textDim}
              multiline
              style={[
                styles.input,
                styles.noteInput,
                { color: theme.text, borderColor: theme.border, backgroundColor: theme.bgElevated },
              ]}
            />
            <View style={styles.modalActions}>
              <Pressable
                disabled={decisionBusy}
                onPress={() => setDecisionTarget(null)}
                style={[styles.modalBtnSecondary, { borderColor: theme.border, opacity: decisionBusy ? 0.6 : 1 }]}>
                <Text style={[styles.modalBtnSecondaryText, { color: theme.text }]}>{t('alert_cancel')}</Text>
              </Pressable>
              <Pressable
                disabled={decisionBusy}
                onPress={submitBookingDecision}
                style={[
                  styles.modalBtnPrimary,
                  {
                    backgroundColor: decisionTarget?.resolution === 'declined' ? theme.danger : theme.accent,
                    opacity: decisionBusy ? 0.6 : 1,
                  },
                ]}>
                <Text style={[styles.modalBtnPrimaryText, { color: theme.onAccent }]}>
                  {decisionBusy ? t('book_saving') : t('shop_booking_decision_submit')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!saveNotice} transparent animationType="fade" onRequestClose={() => setSaveNotice(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{saveNotice?.title}</Text>
            <Text style={[styles.meta, { color: theme.textMuted }]}>{saveNotice?.body}</Text>
            <Pressable
              onPress={() => setSaveNotice(null)}
              style={[styles.primaryBtn, { backgroundColor: theme.accent, marginTop: 16 }]}>
              <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>{t('welcome_ok')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );

  if (isStoreShopType(shop.type)) {
    return (
      <>
        <ScrollView style={[styles.screen, { backgroundColor: theme.bg }]} contentContainerStyle={styles.page}>
        {ownerProfileHero}
        {ownerManageSections}

        <OwnerSectionCard theme={theme} title={t('parts_owner_inventory_title')} subtitle={t('parts_owner_dashboard_lead')}>
          <TextInput placeholder={t('parts_owner_part_name_placeholder')} placeholderTextColor={theme.textDim} value={newPartName} onChangeText={setNewPartName} style={fieldStyle} />
          <TextInput placeholder={t('parts_owner_part_price_placeholder')} placeholderTextColor={theme.textDim} keyboardType="numeric" value={newPartPrice} onChangeText={setNewPartPrice} style={fieldStyle} />
          <TextInput placeholder={t('parts_owner_part_stock_placeholder')} placeholderTextColor={theme.textDim} keyboardType="numeric" value={newPartStock} onChangeText={setNewPartStock} style={fieldStyle} />
          <TextInput placeholder={t('parts_owner_part_image_placeholder')} placeholderTextColor={theme.textDim} value={newPartImage} onChangeText={setNewPartImage} style={fieldStyle} />
          <Pressable onPress={onAddPart} style={[styles.primaryBtn, { backgroundColor: theme.accent }]}>
            <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>{t('parts_owner_add_part_btn')}</Text>
          </Pressable>
          {loadingParts ? (
            <ActivityIndicator style={{ marginTop: 12 }} color={theme.accent} />
          ) : (
            inventory.map((part) => (
              <View key={part.id} style={[styles.partOwnerRow, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                {part.imageUrl ? <Image source={{ uri: part.imageUrl }} style={styles.partOwnerImage} /> : null}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.metaStrong, { color: theme.text }]}>{part.name}</Text>
                  <Text style={[styles.meta, { color: theme.textMuted }]}>
                    {formatEgp(part.priceEgp, locale)} · {t('parts_stock')}: {part.stockQty}
                  </Text>
                </View>
                <View style={styles.actions}>
                  <Pressable onPress={() => onAdjustStock(part.id, -1)} style={[styles.chipBtn, { backgroundColor: theme.danger, borderColor: theme.danger }]}>
                    <Text style={styles.actionText}>-1</Text>
                  </Pressable>
                  <Pressable onPress={() => onAdjustStock(part.id, 1)} style={[styles.chipBtn, { backgroundColor: theme.accent, borderColor: theme.accent }]}>
                    <Text style={[styles.actionText, { color: theme.onAccent }]}>+1</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </OwnerSectionCard>

        <OwnerSectionCard theme={theme} title={t('parts_owner_orders_title')}>
          {partsOrders.length === 0 ? (
            <Text style={[styles.empty, { color: theme.textMuted }]}>{t('parts_owner_no_orders')}</Text>
          ) : (
            partsOrders.map((order) => (
              <View key={order.id} style={[styles.card, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                <Text style={[styles.when, { color: theme.text }]}>{new Date(order.createdAt).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-EG')}</Text>
                <Text style={[styles.meta, { color: theme.textMuted }]}>{t('book_phone_label')}: {order.customerPhone}</Text>
                <Text style={[styles.meta, { color: theme.textMuted }]}>{t('parts_shipping_address_label')}: {order.shippingAddress}</Text>
                <Text style={[styles.meta, { color: theme.textMuted }]}>
                  {t('parts_order_money_line')
                    .replace('{subtotal}', formatEgp(order.subtotalEgp, locale))
                    .replace('{fee}', formatEgp(order.platformFeeEgp, locale))
                    .replace('{total}', formatEgp(order.totalEgp, locale))}
                </Text>
                <Text style={[styles.status, { color: theme.accent }]}>{partsStatusLabel(order.status)}</Text>
                <View style={styles.actions}>
                  {order.status === 'pending' ? (
                    <Pressable onPress={() => onPartsOrderStatusChange(order.id, 'confirmed')} style={[styles.chipBtn, { backgroundColor: theme.accent, borderColor: theme.accent }]}>
                      <Text style={[styles.actionText, { color: theme.onAccent }]}>{t('shop_action_confirm')}</Text>
                    </Pressable>
                  ) : null}
                  {order.status !== 'cancelled' ? (
                    <Pressable onPress={() => onPartsOrderStatusChange(order.id, 'cancelled')} style={[styles.chipBtn, { backgroundColor: theme.danger, borderColor: theme.danger }]}>
                      <Text style={styles.actionText}>{t('shop_action_cancel')}</Text>
                    </Pressable>
                  ) : null}
                  {order.status === 'confirmed' ? (
                    <Pressable onPress={() => onPartsOrderStatusChange(order.id, 'shipped')} style={[styles.chipBtn, { backgroundColor: theme.accent, borderColor: theme.accent }]}>
                      <Text style={[styles.actionText, { color: theme.onAccent }]}>{t('parts_mark_shipped')}</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))
          )}
        </OwnerSectionCard>
        </ScrollView>
        {ownerModals}
      </>
    );
  }

  return (
    <>
      <ScrollView style={[styles.screen, { backgroundColor: theme.bg }]} contentContainerStyle={styles.page}>
      {ownerProfileHero}

      <View style={[styles.panelTabRow, { borderColor: theme.border }]}>
        {(
          [
            { id: 'workspace' as const, label: t('owner_panel_tab_workspace') },
            { id: 'history' as const, label: t('owner_panel_tab_history') },
          ] as const
        ).map((item) => (
          <Pressable
            key={item.id}
            onPress={() => setPanelTab(item.id)}
            style={[
              styles.panelTabBtn,
              {
                backgroundColor: panelTab === item.id ? theme.accent : theme.bgElevated,
                borderColor: panelTab === item.id ? theme.accent : theme.border,
              },
            ]}>
            <Text style={[styles.panelTabText, { color: panelTab === item.id ? theme.onAccent : theme.text }]}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {panelTab === 'history' ? (
        <OwnerHistoryPanel shop={shop} staff={shopStaff} variant="shop" />
      ) : (
        <>
      {ownerManageSections}

      <OwnerSectionCard theme={theme} title={t('shop_active_requests_title')} subtitle={t('shop_active_requests_lead')}>
        {loadingBookings ? (
          <ActivityIndicator color={theme.accent} />
        ) : activeBookings.length === 0 ? (
          <Text style={[styles.empty, { color: theme.textMuted }]}>{t('shop_active_requests_empty')}</Text>
        ) : (
          activeBookings.map((item) => renderBookingCard(item, true))
        )}
      </OwnerSectionCard>
        </>
      )}
      </ScrollView>
      {ownerModals}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loginContent: { padding: 20, paddingBottom: 40 },
  page: { padding: 16, paddingBottom: 40 },
  panelTabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  panelTabBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  panelTabText: { fontSize: 13, fontWeight: '800' },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 6 },
  lead: { fontSize: 14, lineHeight: 20 },
  inlineSectionTitle: { fontSize: 14, fontWeight: '800', marginTop: 14, marginBottom: 8 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginTop: 8,
  },
  primaryBtn: {
    marginTop: 14,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  primaryBtnText: { fontWeight: '800', fontSize: 15 },
  secondaryBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryBtnText: { fontSize: 14, fontWeight: '700' },
  demoHint: { fontSize: 12, lineHeight: 18, marginTop: 16 },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  presetChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  customRangeWrap: { marginTop: 6 },
  lastDaysRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  lastDaysInput: { flex: 1, minWidth: 120, marginTop: 0 },
  reportPreviewScroll: { maxHeight: 320, marginTop: 12 },
  historyScroll: { maxHeight: 280, marginTop: 12 },
  reportPreviewContent: { paddingBottom: 4 },
  reportModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 8,
  },
  reportModalTitle: { flex: 1, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  reportModalBtn: { paddingVertical: 8, paddingHorizontal: 4, minWidth: 84 },
  reportModalScreen: { flex: 1 },
  reportIframeWrap: { flex: 1, minHeight: 0 },
  reportSummary: { marginTop: 12, fontSize: 13, lineHeight: 19 },
  reportMoney: { marginTop: 6, fontSize: 13, lineHeight: 19, fontWeight: '800' },
  empty: { textAlign: 'center' },
  emptyHint: { fontSize: 13, lineHeight: 19, marginTop: 10 },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
  },
  when: { fontSize: 16, fontWeight: '800', marginBottom: 6 },
  metaStrong: { fontSize: 15, fontWeight: '800', marginBottom: 2 },
  meta: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  status: { fontSize: 14, fontWeight: '800', marginTop: 8 },
  notificationRow: {
    borderTopWidth: 1,
    paddingTop: 10,
    marginTop: 10,
  },
  notificationHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  statusPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '85%',
    borderWidth: 1,
    borderRadius: 18,
    padding: 20,
  },
  modalTitle: { fontSize: 20, fontWeight: '900', marginBottom: 8 },
  modalScroll: { maxHeight: 420 },
  modalScrollContent: { paddingBottom: 8 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
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
  modalBtnPrimaryText: { fontSize: 15, fontWeight: '800' },
  noteInput: { minHeight: 88, textAlignVertical: 'top' },
  partOwnerRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  partOwnerImage: { width: 56, height: 56, borderRadius: 8 },
  albumGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  albumTile: {
    width: '47%',
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  albumImage: { width: '100%', height: 120 },
  removePhotoBtn: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chipBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  chipBtnText: { fontSize: 13, fontWeight: '800' },
  actionText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
