import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useMemo, useState } from 'react';
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

import { BookingDatePicker } from '@/components/ui/BookingDatePicker';
import { OwnerProfileHeader } from '@/components/owner/OwnerProfileHeader';
import { OwnerSectionCard } from '@/components/owner/OwnerSectionCard';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import {
  listOwnerNotificationsForShop,
  pushCustomerNotification,
  resolveOwnerNotification,
} from '@/lib/booking/commerceEvents';
import {
  buildOwnerReportHtml,
  filterBookingsByRange,
  formatEgp,
  formatRangeLabel,
  normalizeBookingMoney,
  resolveCustomRange,
  resolvePresetRange,
  toYmdLocal,
  type ReportPreset,
} from '@/lib/booking/reporting';
import { useShopAuth } from '@/context/ShopAuthContext';
import { bookingStatusLabel, formatBookingDateTime, shopTypeLabel } from '@/lib/booking/format';
import {
  addInventoryItem,
  listInventoryForShop,
  listPartsOrdersForShop,
  updateInventoryStock,
  updatePartsOrderStatus,
} from '@/lib/booking/partsStorage';
import {
  addShopImage,
  addShopOffer,
  cancelShopOffer,
  getShopExtras,
  removeShopImage,
  setShopProfileInfo,
  setShopProfileImage,
  setShopServicePrice,
} from '@/lib/booking/shopExtrasStorage';
import { listBookingsForShop, updateBookingStatus } from '@/lib/booking/storage';
import { registerOwnerPushToken } from '@/lib/push/shopPush';
import type {
  Booking,
  BookingStatus,
  OwnerNotification,
  OwnerNotificationResolution,
  PartsOrder,
  ShopExtras,
  SparePartItem,
} from '@/lib/booking/types';

const PRESETS: ReportPreset[] = ['2d', '3d', '7d', '30d', 'custom'];

export default function ShopScreen() {
  const theme = useAppTheme();
  const { t, tp, locale } = useI18n();
  const { ready, shop, busy, login, logout } = useShopAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [reportPreset, setReportPreset] = useState<ReportPreset>('30d');
  const [customStartYmd, setCustomStartYmd] = useState(() => {
    const preset = resolvePresetRange('30d');
    return toYmdLocal(preset.start);
  });
  const [customEndYmd, setCustomEndYmd] = useState(() => toYmdLocal(new Date()));
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [inventory, setInventory] = useState<SparePartItem[]>([]);
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
  const [winchEnabled, setWinchEnabled] = useState(false);
  const [winchPhone, setWinchPhone] = useState('');
  const [newServicePrice, setNewServicePrice] = useState('');
  const [newOfferTitle, setNewOfferTitle] = useState('');
  const [newOfferTitleAr, setNewOfferTitleAr] = useState('');
  const [newOfferDays, setNewOfferDays] = useState('7');
  const [notificationsModalVisible, setNotificationsModalVisible] = useState(false);
  const [decisionTarget, setDecisionTarget] = useState<{
    notification: OwnerNotification;
    resolution: OwnerNotificationResolution;
  } | null>(null);
  const [decisionNote, setDecisionNote] = useState('');
  const [decisionBusy, setDecisionBusy] = useState(false);

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
    setProfileNameAr(row.profileNameAr ?? shop.nameAr);
    setProfileAddress(row.profileAddress ?? shop.address);
    setProfileAddressAr(row.profileAddressAr ?? shop.addressAr);
    setProfilePhone(row.profilePhone ?? shop.phone);
    setProfileEmail(row.profileEmail ?? '');
    setWinchEnabled(!!row.winchEnabled);
    setWinchPhone(row.winchPhone ?? '');
  }, [shop]);

  const refreshBookings = useCallback(async () => {
    if (!shop) return;
    setLoadingBookings(true);
    const rows = await listBookingsForShop(shop.id);
    setBookings(rows);
    setLoadingBookings(false);
  }, [shop]);

  const refreshPartsData = useCallback(async () => {
    if (!shop || shop.type !== 'parts') return;
    setLoadingParts(true);
    try {
      const [invRows, orderRows] = await Promise.all([
        listInventoryForShop(shop.id),
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
      if (shop.type === 'parts') refreshPartsData();
      else refreshBookings();
    }, [shop, refreshBookings, refreshPartsData, refreshOwnerNotifications, refreshShopExtras]),
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

  const reportRange = useMemo(() => {
    if (reportPreset === 'custom') return resolveCustomRange(customStartYmd, customEndYmd);
    return resolvePresetRange(reportPreset);
  }, [reportPreset, customStartYmd, customEndYmd]);

  const reportBookings = useMemo(() => {
    if (!reportRange) return [];
    return filterBookingsByRange(bookings, reportRange);
  }, [bookings, reportRange]);

  const financialTotals = useMemo(() => {
    return reportBookings.reduce(
      (acc, booking) => {
        const money = normalizeBookingMoney(booking);
        acc.gross += money.servicePriceEgp;
        acc.fee += money.platformFeeEgp;
        acc.net += money.ownerNetEgp;
        return acc;
      },
      { gross: 0, fee: 0, net: 0 },
    );
  }, [reportBookings]);

  async function onLogin() {
    const ok = await login(email, password);
    if (!ok) {
      Alert.alert(t('shop_login_fail_title'), t('shop_login_fail_body'));
    }
  }

  async function onLogout() {
    await logout();
    router.replace('/welcome');
  }

  async function onStatusChange(bookingId: string, status: BookingStatus) {
    await updateBookingStatus(bookingId, status);
    await refreshBookings();
  }

  async function onAddPart() {
    if (!shop || shop.type !== 'parts') return;
    const price = Number(newPartPrice);
    const stock = Number(newPartStock);
    if (!newPartName.trim() || Number.isNaN(price) || price < 0 || Number.isNaN(stock) || stock < 0) {
      Alert.alert(t('parts_owner_invalid_part_title'), t('parts_owner_invalid_part_body'));
      return;
    }
    await addInventoryItem(shop.id, {
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
    if (!shop || shop.type !== 'parts') return;
    await updateInventoryStock(shop.id, partId, delta);
    await refreshPartsData();
  }

  async function onPartsOrderStatusChange(orderId: string, status: PartsOrder['status']) {
    if (!shop || shop.type !== 'parts') return;
    await updatePartsOrderStatus(shop.id, orderId, status);
    await refreshPartsData();
  }

  async function onGeneratePdf() {
    if (!shop) return;
    if (!reportRange) {
      Alert.alert(t('shop_report_invalid_range_title'), t('shop_report_invalid_range_body'));
      return;
    }

    const rangeLabel = formatRangeLabel(reportRange, locale);
    const html = buildOwnerReportHtml({
      shop,
      bookings: reportBookings,
      range: reportRange,
      rangeLabel,
      generatedAt: new Date(),
      locale,
    });

    setGeneratingPdf(true);
    try {
      if (Platform.OS === 'web') {
        await Print.printAsync({ html });
        return;
      }
      const file = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/pdf',
          dialogTitle: t('shop_report_share_pdf'),
        });
      } else {
        Alert.alert(t('shop_report_pdf_ready_title'), file.uri);
      }
    } catch {
      Alert.alert(t('shop_report_pdf_fail_title'), t('shop_report_pdf_fail_body'));
    } finally {
      setGeneratingPdf(false);
    }
  }

  function confirmAction(bookingId: string, status: BookingStatus, title: string, body: string) {
    Alert.alert(title, body, [
      { text: t('alert_cancel'), style: 'cancel' },
      { text: t('shop_confirm_action'), onPress: () => onStatusChange(bookingId, status) },
    ]);
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

  const pendingNotificationCount = useMemo(
    () =>
      ownerNotifications.filter(
        (row) => row.kind === 'service_booking' && notificationStatus(row) === 'pending',
      ).length,
    [ownerNotifications, bookings],
  );

  function openBookingDecision(notification: OwnerNotification, resolution: OwnerNotificationResolution) {
    setDecisionNote('');
    setDecisionTarget({ notification, resolution });
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
      await resolveOwnerNotification({
        shopId: shop.id,
        notificationId: notification.id,
        resolution,
        ownerNote: decisionNote.trim() || undefined,
      });
      const booking = bookings.find((row) => row.id === bookingId);
      await pushCustomerNotification({
        customerId: booking?.customerId,
        customerPhone: notification.customerPhone,
        kind: resolution === 'approved' ? 'booking_approved' : 'booking_declined',
        shopId: shop.id,
        bookingId,
        scheduledAt: notification.scheduledAt ?? booking?.scheduledAt,
        ownerNote: decisionNote.trim() || undefined,
      });
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
        allowsEditing: true,
        quality: 0.8,
      });
      if (picked.canceled || !picked.assets?.length) return;
      const uri = picked.assets[0].uri;
      if (!uri) return;
      await addShopImage(shop.id, uri);
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
      const uri = picked.assets[0].uri;
      if (!uri) return;
      await setShopProfileImage(shop.id, uri);
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

  async function onSaveServicePrice() {
    if (!shop) return;
    const price = Number(newServicePrice);
    if (Number.isNaN(price) || price < 0) {
      Alert.alert(t('shop_price_invalid_title'), t('shop_price_invalid_body'));
      return;
    }
    await setShopServicePrice(shop.id, price);
    await refreshShopExtras();
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
      winchEnabled: shop.type === 'maintenance' ? winchEnabled : false,
      winchPhone: shop.type === 'maintenance' ? winchPhone : undefined,
    });
    await refreshShopExtras();
  }

  async function onAddOffer() {
    if (!shop || !newOfferTitle.trim()) {
      Alert.alert(t('shop_offer_invalid_title'), t('shop_offer_invalid_body'));
      return;
    }
    const days = Number(newOfferDays);
    if (Number.isNaN(days) || days < 1) {
      Alert.alert(t('shop_offer_invalid_title'), t('shop_offer_invalid_body'));
      return;
    }
    await addShopOffer({
      shopId: shop.id,
      title: newOfferTitle,
      titleAr: newOfferTitleAr,
      validDays: days,
    });
    setNewOfferTitle('');
    setNewOfferTitleAr('');
    setNewOfferDays('7');
    await refreshShopExtras();
  }

  async function onCancelOffer(offerId: string) {
    if (!shop) return;
    await cancelShopOffer(shop.id, offerId);
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

  const shopName =
    locale === 'ar'
      ? shopExtras?.profileNameAr || shopExtras?.profileName || shop.nameAr
      : shopExtras?.profileName || shop.name;
  const activeOffers = (shopExtras?.offers ?? []).filter((offer) => offer.active);
  const coverImage = shopExtras?.imageUrls?.[0] || shopExtras?.profileImageUrl;
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
      profileEditLabel={t('shop_manage_set_profile_image')}
      logoutLabel={t('shop_logout')}
      onEditCover={onAddShopImage}
      onEditProfile={onSetProfileImage}
      onLogout={onLogout}
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
        {shop.type === 'maintenance' ? (
          <>
            <Text style={[styles.inlineSectionTitle, { color: theme.text }]}>{t('shop_manage_winch_title')}</Text>
            <View style={styles.actions}>
              <Pressable onPress={() => setWinchEnabled(true)} style={[styles.chipBtn, { backgroundColor: winchEnabled ? theme.accent : theme.bgElevated, borderColor: theme.border }]}>
                <Text style={[styles.chipBtnText, { color: winchEnabled ? theme.onAccent : theme.text }]}>{t('shop_manage_winch_enable')}</Text>
              </Pressable>
              <Pressable onPress={() => setWinchEnabled(false)} style={[styles.chipBtn, { backgroundColor: !winchEnabled ? theme.accent : theme.bgElevated, borderColor: theme.border }]}>
                <Text style={[styles.chipBtnText, { color: !winchEnabled ? theme.onAccent : theme.text }]}>{t('shop_action_cancel')}</Text>
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

      <OwnerSectionCard theme={theme} title={t('shop_manage_offer_title')}>
        <TextInput placeholder={t('shop_manage_offer_title_placeholder')} placeholderTextColor={theme.textDim} value={newOfferTitle} onChangeText={setNewOfferTitle} style={fieldStyle} />
        <TextInput placeholder={t('shop_manage_offer_title_ar_placeholder')} placeholderTextColor={theme.textDim} value={newOfferTitleAr} onChangeText={setNewOfferTitleAr} style={fieldStyle} />
        <TextInput placeholder={t('shop_manage_offer_days_placeholder')} placeholderTextColor={theme.textDim} keyboardType="numeric" value={newOfferDays} onChangeText={setNewOfferDays} style={fieldStyle} />
        <Pressable onPress={onAddOffer} style={[styles.primaryBtn, { backgroundColor: theme.accent }]}>
          <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>{t('shop_manage_add_offer')}</Text>
        </Pressable>
        {activeOffers.length ? (
          <View style={styles.actions}>
            {activeOffers.map((offer) => (
              <Pressable key={offer.id} onPress={() => onCancelOffer(offer.id)} style={[styles.chipBtn, { backgroundColor: theme.danger, borderColor: theme.danger }]}>
                <Text style={styles.actionText}>{locale === 'ar' ? offer.titleAr || offer.title : offer.title}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </OwnerSectionCard>
    </>
  );

  const pendingOwnerNotifications = ownerNotifications.filter(
    (row) => row.kind === 'service_booking' && notificationStatus(row) === 'pending',
  );

  const notificationsSection = (
    <OwnerSectionCard theme={theme} title={t('shop_notifications_title')}>
      {pendingOwnerNotifications.length === 0 ? (
        <Text style={[styles.meta, { color: theme.textMuted }]}>{t('shop_notifications_empty')}</Text>
      ) : (
        pendingOwnerNotifications.slice(0, 6).map((notification) => renderOwnerNotificationRow(notification))
      )}
    </OwnerSectionCard>
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
              {ownerNotifications.length === 0 ? (
                <Text style={[styles.meta, { color: theme.textMuted }]}>{t('shop_notifications_empty')}</Text>
              ) : (
                ownerNotifications.map((notification) => renderOwnerNotificationRow(notification))
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
    </>
  );

  if (shop.type === 'parts') {
    return (
      <>
        <ScrollView style={[styles.screen, { backgroundColor: theme.bg }]} contentContainerStyle={styles.page}>
        {ownerProfileHero}
        {ownerManageSections}
        {notificationsSection}

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
      {ownerManageSections}
      {notificationsSection}

      <OwnerSectionCard theme={theme} title={t('shop_dashboard_lead')} subtitle={t('shop_report_lead')}>
        <View style={styles.presetRow}>
          {PRESETS.map((preset) => {
            const active = preset === reportPreset;
            return (
              <Pressable
                key={preset}
                onPress={() => setReportPreset(preset)}
                style={[
                  styles.presetChip,
                  {
                    backgroundColor: active ? theme.accent : 'transparent',
                    borderColor: active ? theme.accent : theme.border,
                  },
                ]}>
                <Text style={{ color: active ? theme.onAccent : theme.text, fontWeight: '700', fontSize: 12 }}>
                  {preset === '2d'
                    ? t('shop_report_last_2_days')
                    : preset === '3d'
                      ? t('shop_report_last_3_days')
                      : preset === '7d'
                        ? t('shop_report_last_week')
                        : preset === '30d'
                          ? t('shop_report_last_month')
                          : t('shop_report_custom')}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {reportPreset === 'custom' ? (
          <View style={styles.customRangeWrap}>
            <BookingDatePicker
              valueYmd={customStartYmd}
              onChangeYmd={setCustomStartYmd}
              locale={locale}
              label={t('shop_report_start_date')}
              pickHint={t('book_date_pick_hint')}
              minimumDate={new Date('2020-01-01T00:00:00')}
              borderColor={theme.border}
              backgroundColor={theme.bgElevated}
              textColor={theme.text}
            />
            <BookingDatePicker
              valueYmd={customEndYmd}
              onChangeYmd={setCustomEndYmd}
              locale={locale}
              label={t('shop_report_end_date')}
              pickHint={t('book_date_pick_hint')}
              minimumDate={new Date('2020-01-01T00:00:00')}
              borderColor={theme.border}
              backgroundColor={theme.bgElevated}
              textColor={theme.text}
            />
          </View>
        ) : null}

        <Text style={[styles.reportSummary, { color: theme.textMuted }]}>
          {reportRange
            ? t('shop_report_count')
                .replace('{count}', String(reportBookings.length))
                .replace('{range}', formatRangeLabel(reportRange, locale))
            : t('shop_report_invalid_range_body')}
        </Text>
        {reportRange ? (
          <Text style={[styles.reportMoney, { color: theme.text }]}>
            {t('shop_report_money_line')
              .replace('{gross}', formatEgp(financialTotals.gross, locale))
              .replace('{fee}', formatEgp(financialTotals.fee, locale))
              .replace('{net}', formatEgp(financialTotals.net, locale))}
          </Text>
        ) : null}

        <Pressable
          onPress={onGeneratePdf}
          disabled={generatingPdf || !reportRange}
          style={[styles.primaryBtn, { backgroundColor: theme.accent, opacity: generatingPdf || !reportRange ? 0.65 : 1 }]}>
          <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>
            {generatingPdf ? t('shop_report_generating') : t('shop_report_generate_pdf')}
          </Text>
        </Pressable>
      </OwnerSectionCard>

      <OwnerSectionCard theme={theme} title={t('shop_report_title')}>
        {loadingBookings ? (
          <ActivityIndicator color={theme.accent} />
        ) : reportBookings.length === 0 ? (
          <Text style={[styles.empty, { color: theme.textMuted }]}>{t('shop_report_no_bookings')}</Text>
        ) : (
          reportBookings.map((item) => (
            <View key={item.id} style={[styles.card, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
              <Text style={[styles.when, { color: theme.text }]}>{formatBookingDateTime(item.scheduledAt, locale)}</Text>
              <Text style={[styles.meta, { color: theme.textMuted }]}>{t('book_phone_label')}: {item.customerPhone}</Text>
              <Text style={[styles.meta, { color: theme.textMuted }]}>{t('book_car_type_label')}: {item.carType}</Text>
              {item.carColor ? (
                <Text style={[styles.meta, { color: theme.textMuted }]}>{t('book_car_color_label')}: {item.carColor}</Text>
              ) : null}
              <Text style={[styles.status, { color: theme.accent }]}>{bookingStatusLabel(item.status, locale)}</Text>
              {item.status !== 'cancelled' && item.status !== 'done' ? (
                <View style={styles.actions}>
                  {item.status === 'pending' ? (
                    <Pressable
                      onPress={() => confirmAction(item.id, 'confirmed', t('shop_confirm_booking_title'), t('shop_confirm_booking_body'))}
                      style={[styles.chipBtn, { backgroundColor: theme.accent, borderColor: theme.accent }]}>
                      <Text style={[styles.actionText, { color: theme.onAccent }]}>{t('shop_action_confirm')}</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={() => confirmAction(item.id, 'cancelled', t('shop_cancel_booking_title'), t('shop_cancel_booking_body'))}
                    style={[styles.chipBtn, { backgroundColor: theme.danger, borderColor: theme.danger }]}>
                    <Text style={styles.actionText}>{t('shop_action_cancel')}</Text>
                  </Pressable>
                  {item.status === 'confirmed' ? (
                    <Pressable onPress={() => onStatusChange(item.id, 'done')} style={[styles.chipBtn, { backgroundColor: theme.accent, borderColor: theme.accent }]}>
                      <Text style={[styles.actionText, { color: theme.onAccent }]}>{t('shop_action_done')}</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
          ))
        )}
      </OwnerSectionCard>
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
