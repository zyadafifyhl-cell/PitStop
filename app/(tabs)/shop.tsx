import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
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
import { MerchantNotificationsModal } from '@/components/merchant/MerchantNotificationsModal';
import { OwnerHistoryPanel } from '@/components/owner/OwnerHistoryPanel';
import { OwnerDashboardNav } from '@/components/owner/OwnerDashboardNav';
import { OwnerMetricsGrid } from '@/components/owner/OwnerMetricsGrid';
import { OwnerProfileHeader } from '@/components/owner/OwnerProfileHeader';
import { PremiumFeatureGate } from '@/components/owner/PremiumFeatureGate';
import { useMerchantOrderNotifier } from '@/components/merchant/OrderNotifier';
import { OwnerAccountSettings } from '@/components/owner/OwnerAccountSettings';
import { OwnerReviewsHistory } from '@/components/owner/reviews/OwnerReviewsHistory';
import { OwnerSectionCard } from '@/components/owner/OwnerSectionCard';
import { WashOwnerPanel } from '@/components/owner/wash/WashOwnerPanel';
import { StoreOwnerDashboard } from '@/components/store/owner/StoreOwnerDashboard';
import { StoreInventoryManager } from '@/components/store/owner/StoreInventoryManager';
import { StoreOrdersPanel } from '@/components/store/owner/StoreOrdersPanel';
import { StoreOwnerProfileSections } from '@/components/store/owner/StoreOwnerProfileSections';
import { StoreOwnerSettings } from '@/components/store/owner/StoreOwnerSettings';
import type { StoreInventoryListFilter, StoreOrderListFilter } from '@/lib/store/ownerFilters';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import {
  listOwnerNotificationsForShop,
  pushCustomerNotification,
  resolveOwnerNotification,
} from '@/lib/booking/commerceEvents';
import { formatEgp } from '@/lib/booking/reporting';
import { promptMerchantNoShowOverride } from '@/lib/booking/merchantBookingOverride';
import { preventAuthFormRefresh } from '@/lib/auth/classifySignInError';
import { useShopAuth } from '@/context/ShopAuthContext';
import { useShopSubscription } from '@/lib/shop/useShopSubscription';
import { useAppSignOut } from '@/lib/auth/useAppSignOut';
import { showCustomConfirm } from '@/lib/ui/CustomConfirmProvider';
import { userAlert } from '@/lib/ui/userAlert';
import { textInputSubmitProps } from '@/lib/ui/textInputSubmit';
import { bookingStatusLabel, DEFAULT_WORK_CLOSE, DEFAULT_WORK_OPEN, DEFAULT_SERVICE_DURATION_MINUTES, formatBookingDateTime, formatShopScheduleLine, normalizeTimeHm, shopTypeLabel } from '@/lib/booking/format';
import {
  cancelBookingReminders,
  scheduleBookingReminders,
} from '@/lib/booking/bookingReminders';
import { isStoreShopType } from '@/lib/booking/storeCatalog';
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
  setStoreOperatingStatus,
  shopHasSavedSchedule,
} from '@/lib/booking/shopExtrasStorage';
import { defaultWeeklyHours } from '@/lib/booking/shopSchedule';
import {
  listBookingsForShop,
  markBookingNoShow,
  sortBookingsByScheduledAtDesc,
  updateBookingStatus,
} from '@/lib/booking/storage';
import { registerOwnerPushToken } from '@/lib/push/shopPush';
import { getOwnerNavTabs, type OwnerShellTabId } from '@/lib/owner/dashboardConfig';
import { getFastCurrentPosition } from '@/lib/geolocation/getFastCurrentPosition';
import { updateShopLocationRemote } from '@/lib/booking/wash/branchRepository';
import { patchShopCoordinates } from '@/lib/booking/catalogRepository';
import type {
  Booking,
  OwnerNotification,
  OwnerNotificationResolution,
  ShopExtras,
  StoreOperatingStatus,
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
  const { isPro } = useShopSubscription(shop?.id);

  useEffect(() => {
    if (ready && isAdmin) {
      router.replace('/admin');
    }
  }, [ready, isAdmin]);
  const { signOut } = useAppSignOut();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [panelTab, setPanelTab] = useState<'workspace' | 'history'>('workspace');
  const [storeAdminTab, setStoreAdminTab] = useState<OwnerShellTabId>('dashboard');
  const [storeOrderFilter, setStoreOrderFilter] = useState<StoreOrderListFilter>('all');
  const [storeInventoryFilter, setStoreInventoryFilter] = useState<StoreInventoryListFilter>('all');
  const [focusStoreOrderId, setFocusStoreOrderId] = useState<string | null>(null);
  const [focusBookingId, setFocusBookingId] = useState<string | null>(null);
  const [dashboardPendingOrders, setDashboardPendingOrders] = useState(0);
  const [capturingGps, setCapturingGps] = useState(false);
  const [storeStatusBusy, setStoreStatusBusy] = useState(false);
  const [mapPinCoords, setMapPinCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [loadingBookings, setLoadingBookings] = useState(false);
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

  useEffect(() => {
    if (!shop) {
      setMapPinCoords(null);
      return;
    }
    if (Number.isFinite(shop.latitude) && Number.isFinite(shop.longitude)) {
      setMapPinCoords({ latitude: shop.latitude, longitude: shop.longitude });
    }
  }, [shop]);

  const refreshBookings = useCallback(async () => {
    if (!shop) return;
    setLoadingBookings(true);
    const rows = await listBookingsForShop(shop.id);
    setBookings(rows);
    setLoadingBookings(false);
  }, [shop]);

  useFocusEffect(
    useCallback(() => {
      if (!shop) return;
      refreshOwnerNotifications();
      refreshShopExtras();
      if (isStoreShopType(shop.type)) {
        void orderNotifier.refreshStoreOrders();
      } else {
        refreshBookings();
        void orderNotifier.refresh();
      }
    }, [shop, refreshBookings, refreshOwnerNotifications, refreshShopExtras, orderNotifier.refresh, orderNotifier.refreshStoreOrders]),
  );

  const openNotificationsModal = useCallback(() => {
    if (shop && isStoreShopType(shop.type)) {
      void orderNotifier.refreshStoreOrders();
    }
    setNotificationsModalVisible(true);
  }, [shop, orderNotifier.refreshStoreOrders]);

  useEffect(() => {
    if (!shop || !isStoreShopType(shop.type)) return;
    void orderNotifier.refreshStoreOrders();
  }, [shop, orderNotifier.refreshStoreOrders, orderNotifier.storeOrdersRevision]);

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
  const focusedBooking = focusBookingId
    ? bookings.find((booking) => booking.id === focusBookingId) ?? null
    : null;

  const serviceRevenueMetric = useMemo(
    () => {
      const completedRevenue = bookings
        .filter((booking) => booking.status === 'done')
        .reduce((sum, booking) => sum + Number(booking.servicePriceEgp ?? 0), 0);
      return {
        id: 'revenue',
        label: t('store_owner_total_revenue'),
        value: formatEgp(completedRevenue, locale),
        icon: 'money' as const,
        tone: 'success' as const,
      };
    },
    [bookings, locale, t],
  );

  const serviceOwnerMetrics = useMemo(() => {
    const today = new Date().toDateString();
    return [
      ...(isPro ? [serviceRevenueMetric] : []),
      {
        id: 'today',
        label: t('owner_dashboard_today_bookings'),
        value: bookings.filter((booking) => new Date(booking.scheduledAt).toDateString() === today).length,
        icon: 'calendar-check-o' as const,
      },
      {
        id: 'pending',
        label: t('owner_dashboard_pending_requests'),
        value: activeBookings.length,
        icon: 'clock-o' as const,
        tone: 'warning' as const,
      },
      {
        id: 'services',
        label: t('owner_dashboard_active_services'),
        value: (shopExtras?.services ?? []).filter((service) => service.active).length,
        icon: 'wrench' as const,
      },
    ];
  }, [activeBookings.length, bookings, isPro, serviceRevenueMetric, shopExtras?.services, t]);

  async function onLogin(event?: { preventDefault?: () => void }) {
    preventAuthFormRefresh(event);
    setLoginError('');
    const result = await login(email, password);
    if (result === 'ok_admin') {
      router.replace('/admin');
      return;
    }
    if (result === 'ok') {
      return;
    }
    if (result === 'shop_not_found') {
      userAlert(t('shop_login_shop_not_found_title'), t('shop_login_shop_not_found_body'));
      return;
    }
    setPassword('');
    if (result === 'rate_limited') {
      setLoginError(t('auth_login_rate_limited_body'));
      return;
    }
    if (result === 'network_error') {
      setLoginError(t('auth_login_network_body'));
      return;
    }
    setLoginError(t('auth_login_invalid_body'));
  }

  function onLogout() {
    showCustomConfirm({
      title: t('merchant_settings_sign_out_confirm_title'),
      message: t('merchant_settings_sign_out_confirm_body'),
      confirmLabel: t('merchant_settings_sign_out'),
      cancelLabel: t('alert_cancel'),
      destructive: true,
      onConfirm: async () => {
        await signOut({ welcomeFocus: 'owner' });
      },
    });
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
        {showActions && (item.status === 'confirmed' || item.status === 'in_progress') ? (
          <View style={styles.actions}>
            <Pressable
              onPress={() => void updateBookingStatus(item.id, 'done', item).then(() => refreshBookings())}
              style={[styles.chipBtn, { backgroundColor: theme.accent, borderColor: theme.accent }]}>
              <Text style={[styles.actionText, { color: theme.onAccent }]}>{t('wash_action_complete')}</Text>
            </Pressable>
            <Pressable
              onPress={() =>
                promptMerchantNoShowOverride({
                  title: t('merchant_noshow_override_title'),
                  message: t('merchant_noshow_override_body'),
                  confirmLabel: t('owner_history_noshow_action'),
                  cancelLabel: t('alert_cancel'),
                  onConfirm: async () => {
                    await markBookingNoShow(item.id, item);
                    await refreshBookings();
                  },
                })
              }
              style={[styles.chipBtn, { backgroundColor: theme.bgElevated, borderColor: theme.danger }]}>
              <Text style={[styles.chipBtnText, { color: theme.danger }]}>{t('owner_history_noshow_action')}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
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

  const pendingNotificationCount = isStoreShopType(shop?.type ?? 'parts')
    ? Math.max(orderNotifier.pendingStoreOrderCount, dashboardPendingOrders)
    : orderNotifier.notificationBadgeCount;

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
        fileName: asset.fileName,
        webFile: asset.file,
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

  async function onSetStoreMapPin() {
    if (!shop) return;
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('wash_branch_gps_denied_title'), t('wash_branch_gps_denied_body'));
      return;
    }
    setCapturingGps(true);
    try {
      const coords = await getFastCurrentPosition();
      const saved = await updateShopLocationRemote(shop.id, coords.latitude, coords.longitude);
      setMapPinCoords(coords);
      patchShopCoordinates(shop.id, coords.latitude, coords.longitude);
      showSaveNotice(
        t('wash_branch_gps_saved_title'),
        saved ? t('wash_branch_gps_saved_body_synced') : t('wash_branch_gps_saved_body_local_only'),
      );
    } catch {
      Alert.alert(
        t('wash_branch_gps_fail_title'),
        Platform.OS === 'web' ? t('wash_branch_gps_fail_body_web') : t('wash_branch_gps_fail_body'),
      );
    } finally {
      setCapturingGps(false);
    }
  }

  async function onChangeStoreStatus(status: StoreOperatingStatus) {
    if (!shop) return;
    setStoreStatusBusy(true);
    try {
      const row = await setStoreOperatingStatus(shop.id, status);
      setShopExtras(row);
    } catch {
      Alert.alert(t('merchant_settings_status_fail_title'), t('merchant_settings_status_fail_body'));
    } finally {
      setStoreStatusBusy(false);
    }
  }

  async function onChangeWinchEnabled(next: boolean) {
    if (!shop) return;
    const previous = winchEnabled;
    setWinchEnabled(next);
    try {
      const row = await setShopProfileInfo(shop.id, {
        profileName,
        profileNameAr,
        profileAddress,
        profileAddressAr,
        profilePhone,
        profileEmail,
        moreInfo,
        moreInfoAr,
        winchEnabled: next,
        winchPhone,
      });
      setShopExtras(row);
    } catch {
      setWinchEnabled(previous);
      Alert.alert(t('merchant_settings_status_fail_title'), t('merchant_settings_status_fail_body'));
    }
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
        <View style={[styles.loginCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.title, { color: theme.text }]}>{t('shop_login_title')}</Text>
        <Text style={[styles.lead, { color: theme.textMuted }]}>{t('shop_login_lead')}</Text>
        <Text style={[styles.label, { color: theme.text }]}>{t('shop_email_label')}</Text>
        <TextInput
          placeholder="wash@demo.com"
          placeholderTextColor={theme.textDim}
          autoCapitalize="none"
          keyboardType="email-address"
          returnKeyType="next"
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
          onChangeText={(text) => {
            setPassword(text);
            if (loginError) setLoginError('');
          }}
          style={[
            styles.input,
            {
              color: theme.text,
              borderColor: loginError ? theme.text : theme.border,
              backgroundColor: theme.bgElevated,
            },
          ]}
          {...textInputSubmitProps({
            enabled: !busy && !!email.trim() && !!password.trim(),
            onSubmit: () => {
              void onLogin();
            },
          })}
        />
        {loginError ? (
          <Text style={[styles.lead, { color: theme.text, marginTop: 8 }]}>{loginError}</Text>
        ) : null}
        <Pressable
          onPress={onLogin}
          disabled={busy}
          accessibilityRole="button"
          {...(Platform.OS === 'web' ? ({ type: 'button' } as object) : {})}
          style={[styles.primaryBtn, { backgroundColor: theme.accent, opacity: busy ? 0.65 : 1 }]}>
          <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>{t('shop_login_btn')}</Text>
        </Pressable>
        <Text style={[styles.demoHint, { color: theme.textDim }]}>{t('shop_demo_accounts')}</Text>
        </View>
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
      onOpenNotifications={openNotificationsModal}
      onOpenSettings={() => setStoreAdminTab('settings')}
      settingsLabel={t('merchant_settings_open')}
    />
  );

  const ownerProfileSections = (
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
        {(shop.type === 'maintenance' || shop.type === 'winch') ? (
          <>
            <Text style={[styles.inlineSectionTitle, { color: theme.text }]}>{t('shop_manage_winch_title')}</Text>
            <TextInput
              placeholder={t('shop_manage_winch_phone_placeholder')}
              placeholderTextColor={theme.textDim}
              keyboardType="phone-pad"
              value={winchPhone}
              onChangeText={setWinchPhone}
              style={fieldStyle}
            />
          </>
        ) : null}
        <Pressable onPress={onSaveProfileInfo} style={[styles.primaryBtn, { backgroundColor: theme.accent }]}>
          <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>{t('shop_manage_save_profile')}</Text>
        </Pressable>
      </OwnerSectionCard>

      <OwnerSectionCard theme={theme} title={t('store_map_pin_title')} subtitle={t('store_map_pin_lead')}>
        <Pressable
          onPress={onSetStoreMapPin}
          disabled={capturingGps}
          style={[styles.secondaryBtn, { borderColor: theme.accent, opacity: capturingGps ? 0.65 : 1 }]}>
          <Text style={[styles.secondaryBtnText, { color: theme.accent }]}>
            {capturingGps ? t('store_map_pin_capturing') : t('store_map_pin_button')}
          </Text>
        </Pressable>
        {mapPinCoords ? (
          <Text style={[styles.meta, { color: theme.textMuted, marginTop: 8 }]}>
            {t('store_map_pin_coords')
              .replace('{lat}', mapPinCoords.latitude.toFixed(5))
              .replace('{lng}', mapPinCoords.longitude.toFixed(5))}
          </Text>
        ) : null}
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
    </>
  );

  const ownerOperationsSections = (
    <>
      <OwnerSectionCard theme={theme} title={t('shop_manage_price_label')}>
        <TextInput placeholder={t('shop_manage_price_placeholder')} placeholderTextColor={theme.textDim} keyboardType="numeric" value={newServicePrice} onChangeText={setNewServicePrice} style={fieldStyle} />
        <Pressable onPress={onSaveServicePrice} style={[styles.primaryBtn, { backgroundColor: theme.accent }]}>
          <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>{t('shop_manage_save_price')}</Text>
        </Pressable>
      </OwnerSectionCard>

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

      <PremiumFeatureGate shopId={shop.id} hint={t('premium_campaigns_lock_hint')}>
        <OwnerSectionCard theme={theme} title={t('campaign_panel_title')} subtitle={t('campaign_panel_lead')}>
          <MerchantCampaignsPanel shopId={shop.id} />
        </OwnerSectionCard>
      </PremiumFeatureGate>

      <StoreInventoryManager shop={shop} />
    </>
  );

  const shopOperatingStatus = shopExtras?.storeOperatingStatus ?? 'open';

  const shopOperatingStatusCard = (
    <OwnerSectionCard theme={theme} title={t('shop_operating_status_title')} subtitle={t('shop_operating_status_lead')}>
      <View style={styles.actions}>
        {([
          { id: 'open' as const, labelKey: 'store_status_open' as const },
          { id: 'closed' as const, labelKey: 'store_status_closed' as const },
          { id: 'maintenance' as const, labelKey: 'store_status_maintenance' as const },
        ]).map((option) => {
          const active = shopOperatingStatus === option.id;
          return (
            <Pressable
              key={option.id}
              disabled={storeStatusBusy}
              onPress={() => onChangeStoreStatus(option.id)}
              style={[
                styles.chipBtn,
                {
                  backgroundColor: active ? theme.accent : theme.bgElevated,
                  borderColor: active ? theme.accent : theme.border,
                  opacity: storeStatusBusy ? 0.7 : 1,
                },
              ]}>
              <Text style={[styles.chipBtnText, { color: active ? theme.onAccent : theme.text }]}>
                {t(option.labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </OwnerSectionCard>
  );

  const ownerSettingsSections = (
    <>
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

      {(shop.type === 'maintenance' || shop.type === 'winch') ? (
        <OwnerSectionCard theme={theme} title={t('shop_manage_winch_title')}>
          <View style={styles.actions}>
            <Pressable
              onPress={() => void onChangeWinchEnabled(true)}
              style={[styles.chipBtn, { backgroundColor: winchEnabled ? theme.accent : theme.bgElevated, borderColor: theme.border }]}>
              <Text style={[styles.chipBtnText, { color: winchEnabled ? theme.onAccent : theme.text }]}>{t('shop_manage_winch_enable')}</Text>
            </Pressable>
            <Pressable
              onPress={() => void onChangeWinchEnabled(false)}
              style={[styles.chipBtn, { backgroundColor: !winchEnabled ? theme.accent : theme.bgElevated, borderColor: theme.border }]}>
              <Text style={[styles.chipBtnText, { color: !winchEnabled ? theme.onAccent : theme.text }]}>{t('shop_manage_winch_disable')}</Text>
            </Pressable>
          </View>
        </OwnerSectionCard>
      ) : null}

      <OwnerAccountSettings
        extraPreferenceRows={[
          {
            label: t('store_notifications_row'),
            subtitle: t('store_notifications_subtitle'),
            onPress: () => openNotificationsModal(),
          },
        ]}
      />
    </>
  );

  const ownerModals = (
    <>
      <MerchantNotificationsModal
        visible={notificationsModalVisible}
        onClose={() => setNotificationsModalVisible(false)}
        shopId={shop.id}
        pendingStoreOrders={orderNotifier.pendingStoreOrders}
        pendingBookings={isStoreShopType(shop.type) ? [] : orderNotifier.pendingBookings}
        onSelectStoreOrder={(order) => {
          setStoreOrderFilter('pending');
          setFocusStoreOrderId(order.id);
          setStoreAdminTab('management');
        }}
        onSelectBooking={(booking) => {
          setPanelTab('workspace');
          setFocusBookingId(booking.id);
          setStoreAdminTab('management');
        }}
      />

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
    const STORE_TABS = getOwnerNavTabs(shop.type).map((tab) => ({
      id: tab.id,
      label: t(tab.labelKey),
      icon: tab.icon,
    }));
    const storeStatus = shopExtras?.storeOperatingStatus ?? 'open';
    const storeScheduleHint =
      shopHasSavedSchedule(shopExtras) && shopExtras?.workOpenTime && shopExtras.workCloseTime
        ? formatShopScheduleLine(
            shopExtras.workOpenTime,
            shopExtras.workCloseTime,
            shopExtras.serviceDurationMinutes ?? DEFAULT_SERVICE_DURATION_MINUTES,
            locale,
          )
        : undefined;

    const onStoreTabChange = (tab: OwnerShellTabId) => {
      setStoreAdminTab(tab);
      if (tab === 'management') setStoreOrderFilter('all');
      if (tab === 'operations') setStoreInventoryFilter('all');
    };

    return (
      <View style={[styles.screen, { backgroundColor: theme.bg }]}>
        <ScrollView
          style={styles.screen}
          contentContainerStyle={[styles.page, styles.pageWithBottomNav]}>
          {(storeAdminTab === 'dashboard' || storeAdminTab === 'profile') && ownerProfileHero}

          {storeAdminTab === 'dashboard' ? (
            <StoreOwnerDashboard
              shop={shop}
              storeStatus={storeStatus}
              onPendingOrdersChange={setDashboardPendingOrders}
              onNavigate={(target) => {
                if (target === 'reports') {
                  router.push('/shop/store-reports');
                  return;
                }
                if (target === 'management') {
                  setStoreAdminTab('management');
                  return;
                }
                if (target === 'pending_orders') {
                  setStoreOrderFilter('pending');
                  setStoreAdminTab('management');
                  return;
                }
                if (target === 'active_orders') {
                  setStoreOrderFilter('active');
                  setStoreAdminTab('management');
                  return;
                }
                setStoreInventoryFilter('low_stock');
                setStoreAdminTab('operations');
              }}
            />
          ) : null}

          {storeAdminTab === 'profile' ? (
            <>
              <StoreOwnerProfileSections
                theme={theme}
                fieldStyle={fieldStyle}
                profileName={profileName}
                profileNameAr={profileNameAr}
                profilePhone={profilePhone}
                profileEmail={profileEmail}
                profileAddress={profileAddress}
                profileAddressAr={profileAddressAr}
                moreInfo={moreInfo}
                moreInfoAr={moreInfoAr}
                pickingImage={pickingImage}
                imageUrls={shopExtras?.imageUrls ?? []}
                onChangeProfileName={setProfileName}
                onChangeProfileNameAr={setProfileNameAr}
                onChangeProfilePhone={setProfilePhone}
                onChangeProfileEmail={setProfileEmail}
                onChangeProfileAddress={setProfileAddress}
                onChangeProfileAddressAr={setProfileAddressAr}
                onChangeMoreInfo={setMoreInfo}
                onChangeMoreInfoAr={setMoreInfoAr}
                onSaveProfile={onSaveProfileInfo}
                onAddImage={onAddShopImage}
                onRemoveImage={onRemoveShopImage}
                mapPinBusy={capturingGps}
                mapPinCoords={mapPinCoords}
                onSetMapPin={onSetStoreMapPin}
              />
              <PremiumFeatureGate shopId={shop.id} hint={t('premium_campaigns_lock_hint')}>
                <OwnerSectionCard theme={theme} title={t('campaign_panel_title')} subtitle={t('campaign_panel_lead')}>
                  <MerchantCampaignsPanel shopId={shop.id} />
                </OwnerSectionCard>
              </PremiumFeatureGate>
            </>
          ) : null}

          {storeAdminTab === 'settings' ? (
            <StoreOwnerSettings
              fieldStyle={fieldStyle}
              workOpenTime={workOpenTime}
              workCloseTime={workCloseTime}
              scheduleInlineOk={scheduleInlineOk}
              scheduleHint={storeScheduleHint}
              onChangeWorkOpenTime={(value) => {
                setWorkOpenTime(value);
                setScheduleInlineOk(false);
              }}
              onChangeWorkCloseTime={(value) => {
                setWorkCloseTime(value);
                setScheduleInlineOk(false);
              }}
              onSaveSchedule={onSaveSchedule}
              onOpenNotifications={openNotificationsModal}
            />
          ) : null}

          {storeAdminTab === 'operations' ? (
            <StoreInventoryManager
              shop={shop}
              stockFilter={storeInventoryFilter}
              onStockFilterChange={setStoreInventoryFilter}
            />
          ) : null}

          {storeAdminTab === 'management' ? (
            <>
              {shopOperatingStatusCard}
              <StoreOrdersPanel
                shop={shop}
                statusFilter={storeOrderFilter}
                onStatusFilterChange={setStoreOrderFilter}
                focusOrderId={focusStoreOrderId}
                onFocusOrderHandled={() => setFocusStoreOrderId(null)}
              />
              <OwnerReviewsHistory shopId={shop.id} />
            </>
          ) : null}
        </ScrollView>

        <OwnerDashboardNav tabs={STORE_TABS} activeTab={storeAdminTab} onChange={onStoreTabChange} />

        {ownerModals}
      </View>
    );
  }

  const SERVICE_TABS = getOwnerNavTabs(shop.type).map((tab) => ({
    id: tab.id,
    label: t(tab.labelKey),
    icon: tab.icon,
  }));

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <ScrollView style={styles.screen} contentContainerStyle={[styles.page, styles.pageWithBottomNav]}>
        {(storeAdminTab === 'dashboard' || storeAdminTab === 'profile') && ownerProfileHero}

        {storeAdminTab === 'dashboard' ? (
          <>
            <OwnerSectionCard theme={theme} title={t('owner_dashboard_overview')} subtitle={t('shop_welcome_back').replace('{name}', shopName)}>
              <Pressable onPress={() => setStoreAdminTab('management')} style={{ paddingTop: 4, marginBottom: 10 }}>
                <Text style={[styles.meta, { color: theme.text, fontWeight: '800' }]}>
                  {shopOperatingStatus === 'closed'
                    ? t('store_status_closed')
                    : shopOperatingStatus === 'maintenance'
                      ? t('store_status_maintenance')
                      : t('store_status_open')}
                </Text>
                <Text style={[styles.meta, { color: theme.textMuted }]}>{t('shop_operating_status_hint')}</Text>
              </Pressable>
              <OwnerMetricsGrid metrics={serviceOwnerMetrics} />
            </OwnerSectionCard>
            {!isPro ? (
              <PremiumFeatureGate shopId={shop.id} hint={t('premium_feature_analytics')}>
                <OwnerSectionCard theme={theme} title={t('wash_analytics_title')} subtitle={t('premium_feature_analytics')}>
                  <OwnerMetricsGrid metrics={[serviceRevenueMetric]} />
                </OwnerSectionCard>
              </PremiumFeatureGate>
            ) : null}
          </>
        ) : null}

        {storeAdminTab === 'management' ? (
          <>
            {focusedBooking ? (
              <OwnerSectionCard
                theme={theme}
                title={t('merchant_notif_booking_title')}
                subtitle={t('shop_active_requests_lead')}>
                {renderBookingCard(focusedBooking, true)}
              </OwnerSectionCard>
            ) : null}
            {shopOperatingStatusCard}
            <OwnerSectionCard theme={theme} title={t('shop_active_requests_title')} subtitle={t('shop_active_requests_lead')}>
              {loadingBookings ? (
                <ActivityIndicator color={theme.accent} />
              ) : activeBookings.length === 0 ? (
                <Text style={[styles.empty, { color: theme.textMuted }]}>{t('shop_active_requests_empty')}</Text>
              ) : (
                activeBookings.map((item) => renderBookingCard(item, true))
              )}
            </OwnerSectionCard>
            <StoreOrdersPanel
              shop={shop}
              statusFilter={storeOrderFilter}
              onStatusFilterChange={setStoreOrderFilter}
              focusOrderId={focusStoreOrderId}
              onFocusOrderHandled={() => setFocusStoreOrderId(null)}
            />
            <OwnerReviewsHistory shopId={shop.id} />
            <OwnerHistoryPanel shop={shop} staff={shopStaff} variant="shop" />
          </>
        ) : null}

        {storeAdminTab === 'operations' ? ownerOperationsSections : null}
        {storeAdminTab === 'profile' ? ownerProfileSections : null}
        {storeAdminTab === 'settings' ? ownerSettingsSections : null}
      </ScrollView>

      <OwnerDashboardNav tabs={SERVICE_TABS} activeTab={storeAdminTab} onChange={setStoreAdminTab} />
      {ownerModals}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loginContent: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 48,
    justifyContent: 'center',
    flexGrow: 1,
  },
  loginCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 22,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  page: { width: '100%', maxWidth: 1024, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48 },
  pageWithBottomNav: { paddingBottom: 96 },
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
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginTop: 8,
  },
  primaryBtn: {
    marginTop: 14,
    borderRadius: 999,
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
  bottomTabBar: {
    flexDirection: 'row',
    height: 65,
    borderTopWidth: 1,
    paddingBottom: Platform.OS === 'ios' ? 15 : 0,
    alignItems: 'center',
    justifyContent: 'space-around',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  bottomTabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingVertical: 8,
  },
  bottomTabLabel: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4,
  },
});
