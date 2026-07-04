import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  Switch,
  TextInput,
  View,
} from 'react-native';

import { ActiveVehiclePicker } from '@/components/customer/ActiveVehiclePicker';
import { BookingDatePicker } from '@/components/ui/BookingDatePicker';
import { AutomotiveBackground } from '@/components/ui/AutomotiveBackground';
import { ServiceMultiPicker } from '@/components/booking/ServiceMultiPicker';
import { useI18n } from '@/context/I18nContext';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useShopCatalog } from '@/context/ShopCatalogContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { getShopById } from '@/lib/booking/catalogRepository';
import { validateCouponForCheckout } from '@/lib/booking/couponRepository';
import { getShopExtras, shopHasSavedSchedule } from '@/lib/booking/shopExtrasStorage';
import {
  applyCampaignPrice,
  computePlatformFee,
  formatOfferBadge,
  isBuyXGetYFreeNext,
  pickBestLiveOffer,
  resolveOfferType,
  buildOfferBadgeMessages,
} from '@/lib/booking/offerPricing';
import { countDoneBookingsForCustomerAtShop } from '@/lib/booking/offerRepository';
import {
  buildScheduledIso,
  defaultBookingDateYmd,
  formatBookingDateTime,
  formatShopScheduleLine,
  shopTypeLabel,
} from '@/lib/booking/format';
import { formatEgp } from '@/lib/booking/reporting';
import {
  buildSlotsForShopDate,
  getActiveServices,
  shopHasCustomerSchedule,
  type SlotAvailability,
  type TimeSlotOption,
} from '@/lib/booking/shopSchedule';
import { createBooking, getSavedCustomerPhone, listBookingsForShop, saveCustomerPhone } from '@/lib/booking/storage';
import {
  getMerchantLoyaltyCheckoutState,
  MERCHANT_LOYALTY_REDEEM_POINTS_PER_EGP,
  validatePointsRedemptionRemote,
  type PointsRedemptionValidation,
} from '@/lib/booking/merchantLoyaltyRepository';
import { listCustomerVehicles } from '@/lib/booking/vehicleStorage';
import { formatPhoneDisplay, openPhone, openShopInMaps } from '@/lib/linking/contact';
import { buildBookReturnTo } from '@/lib/auth/returnTo';
import { logAndGetSafeErrorMessage } from '@/lib/errors/userError';
import { userAlert } from '@/lib/ui/userAlert';
import { normalizePhoneE164 } from '@/lib/phone';
import type { Booking, CustomerVehicle, ShopExtras } from '@/lib/booking/types';
import type { AppThemeTokens } from '@/constants/Theme';

function resolveBookingPhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const local = trimmed.startsWith('+20') ? `0${trimmed.slice(3)}` : trimmed;
  return normalizePhoneE164(local);
}

export default function BookShopScreen() {
  const {
    shopId,
    serviceId: rawServiceId,
    serviceIds: rawServiceIds,
  } = useLocalSearchParams<{
    shopId: string;
    serviceId?: string;
    serviceIds?: string;
  }>();
  const legacyServiceId = Array.isArray(rawServiceId) ? rawServiceId[0] : rawServiceId;
  const serviceIdsParam = Array.isArray(rawServiceIds) ? rawServiceIds[0] : rawServiceIds;
  const initialServiceIds = useMemo(() => {
    if (serviceIdsParam) {
      return serviceIdsParam.split(',').map((s: string) => s.trim()).filter(Boolean);
    }
    if (legacyServiceId) return [legacyServiceId];
    return [];
  }, [serviceIdsParam, legacyServiceId]);
  const theme = useAppTheme();
  const { t, locale, isRTL } = useI18n();
  const offerBadgeMessages = useMemo(() => buildOfferBadgeMessages(t), [t]);
  const { customer, isGuest } = useCustomerAuth();
  const { ready: catalogReady, version: catalogVersion } = useShopCatalog();

  const shop = useMemo(
    () => (catalogReady && shopId ? getShopById(shopId) : undefined),
    [catalogReady, catalogVersion, shopId],
  );

  const [resolvedPhone, setResolvedPhone] = useState('');
  const [carType, setCarType] = useState('');
  const [carColor, setCarColor] = useState('');
  const [hasRegisteredVehicles, setHasRegisteredVehicles] = useState(false);
  const [customerNotes, setCustomerNotes] = useState('');
  const [vehicleId, setVehicleId] = useState<string | undefined>();
  const [dateYmd, setDateYmd] = useState(defaultBookingDateYmd());
  const [timeSlot, setTimeSlot] = useState('');
  const [saving, setSaving] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);
  const [receiptSummary, setReceiptSummary] = useState<{
    shopName: string;
    serviceLabels: string[];
    totalPrice: number;
    totalMinutes: number;
    scheduledAt: string;
    timeSlot: string;
  } | null>(null);
  const [shopExtras, setShopExtras] = useState<ShopExtras | null>(null);
  const [shopBookings, setShopBookings] = useState<Booking[]>([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>(initialServiceIds);
  const [promoCode, setPromoCode] = useState('');
  const [applyingPromo, setApplyingPromo] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<{
    couponId: string;
    code: string;
    discountType: 'percent' | 'fixed';
    discountValue: number;
  } | null>(null);
  const showCoupons = false;
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(false);
  const [loyaltyBalance, setLoyaltyBalance] = useState(0);
  const [useLoyaltyPoints, setUseLoyaltyPoints] = useState(false);
  const [pointsToRedeemInput, setPointsToRedeemInput] = useState('');
  const [loyaltyValidation, setLoyaltyValidation] = useState<PointsRedemptionValidation | null>(null);
  const [validatingPoints, setValidatingPoints] = useState(false);
  const [doneBookingCount, setDoneBookingCount] = useState(0);

  const CHECKOUT_CYAN = '#00D4FF';
  const CHECKOUT_CARD = '#121826';

  const activeServices = useMemo(() => getActiveServices(shopExtras), [shopExtras]);

  useEffect(() => {
    if (initialServiceIds.length) {
      setSelectedServiceIds(initialServiceIds);
      return;
    }
    if (activeServices[0]?.id) {
      setSelectedServiceIds([activeServices[0].id]);
    }
  }, [initialServiceIds.join(','), activeServices.map((s) => s.id).join(',')]);

  const selectedServices = useMemo(
    () =>
      selectedServiceIds
        .map((id) => activeServices.find((s) => s.id === id))
        .filter((s): s is NonNullable<typeof s> => !!s),
    [selectedServiceIds, activeServices],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const profilePhone = customer?.phone?.trim();
      if (profilePhone) {
        if (!cancelled) setResolvedPhone(profilePhone);
        return;
      }
      const saved = await getSavedCustomerPhone();
      if (!cancelled && saved?.trim()) setResolvedPhone(saved.trim());
    })();
    return () => {
      cancelled = true;
    };
  }, [customer?.phone, customer?.id]);

  const applyVehicleToBooking = useCallback((vehicle: CustomerVehicle | null) => {
    if (vehicle) {
      setVehicleId(vehicle.id);
      setCarType(vehicle.makeModel);
      setCarColor(vehicle.color ?? '');
      return;
    }
    setVehicleId(undefined);
    setCarType('');
    setCarColor('');
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!customer?.id || isGuest) {
        setHasRegisteredVehicles(false);
        return;
      }
      let cancelled = false;
      listCustomerVehicles(customer.id).then((rows) => {
        if (!cancelled) setHasRegisteredVehicles(rows.length > 0);
      });
      return () => {
        cancelled = true;
      };
    }, [customer?.id, isGuest]),
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!shop) return;
      const row = await getShopExtras(shop.id);
      if (!cancelled) setShopExtras(row);
    })();
    return () => {
      cancelled = true;
    };
  }, [shop]);

  const refreshShopExtras = useCallback(async () => {
    if (!shop) return;
    const [row, bookings] = await Promise.all([getShopExtras(shop.id), listBookingsForShop(shop.id)]);
    setShopExtras(row);
    setShopBookings(bookings);
  }, [shop]);

  useFocusEffect(
    useCallback(() => {
      refreshShopExtras();
    }, [refreshShopExtras]),
  );

  const refreshLoyaltyBalance = useCallback(async () => {
    if (!customer?.id || isGuest || !shopId) {
      setLoyaltyEnabled(false);
      setLoyaltyBalance(0);
      return;
    }
    const state = await getMerchantLoyaltyCheckoutState(customer.id, shopId);
    setLoyaltyEnabled(state.enabled);
    setLoyaltyBalance(state.balance);
    if (!state.enabled || state.balance <= 0) {
      setUseLoyaltyPoints(false);
      setPointsToRedeemInput('');
      setLoyaltyValidation(null);
    }
  }, [customer?.id, isGuest, shopId]);

  useFocusEffect(
    useCallback(() => {
      refreshLoyaltyBalance();
    }, [refreshLoyaltyBalance]),
  );

  const activeCampaignOffer = useMemo(
    () => pickBestLiveOffer(shopExtras?.offers ?? []),
    [shopExtras?.offers],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!shop?.id || !activeCampaignOffer) {
        if (!cancelled) setDoneBookingCount(0);
        return;
      }
      if (resolveOfferType(activeCampaignOffer) !== 'buy_x_get_y') {
        if (!cancelled) setDoneBookingCount(0);
        return;
      }
      const count = await countDoneBookingsForCustomerAtShop({
        shopId: shop.id,
        customerId: customer?.id,
        customerPhone: resolvedPhone || customer?.phone,
      });
      if (!cancelled) setDoneBookingCount(count);
    })();
    return () => {
      cancelled = true;
    };
  }, [shop?.id, activeCampaignOffer, customer?.id, customer?.phone, resolvedPhone]);

  const rawServiceTotal = useMemo(() => {
    if (!shop) return 0;
    const servicesTotal = selectedServices.reduce((sum, s) => sum + s.priceEgp, 0);
    return (
      servicesTotal ||
      (shop.type === 'wash' ? activeServices[0]?.priceEgp ?? 0 : shopExtras?.servicePriceEgp ?? 0)
    );
  }, [shop, selectedServices, activeServices, shopExtras?.servicePriceEgp]);

  const campaignAdjustedTotal = useMemo(() => {
    if (!activeCampaignOffer) return rawServiceTotal;
    return applyCampaignPrice(rawServiceTotal, activeCampaignOffer, doneBookingCount);
  }, [rawServiceTotal, activeCampaignOffer, doneBookingCount]);

  const checkoutOriginalPriceEgp = useMemo(() => {
    if (showCoupons && appliedCoupon) {
      return appliedCoupon.discountType === 'percent'
        ? Math.max(0, Math.round(campaignAdjustedTotal * (1 - appliedCoupon.discountValue / 100) * 100) / 100)
        : Math.max(0, Math.round((campaignAdjustedTotal - appliedCoupon.discountValue) * 100) / 100);
    }
    return campaignAdjustedTotal;
  }, [campaignAdjustedTotal, showCoupons, appliedCoupon]);

  useEffect(() => {
    if (!useLoyaltyPoints || !customer?.id || !shop?.id || checkoutOriginalPriceEgp <= 0) {
      setLoyaltyValidation(null);
      return;
    }

    const parsedPoints = Math.floor(Number(pointsToRedeemInput) || 0);
    if (parsedPoints <= 0) {
      setLoyaltyValidation(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        setValidatingPoints(true);
        try {
          const result = await validatePointsRedemptionRemote({
            userId: customer.id,
            shopId: shop.id,
            pointsToRedeem: parsedPoints,
            invoiceTotalEgp: checkoutOriginalPriceEgp,
          });
          if (!cancelled) setLoyaltyValidation(result);
        } finally {
          if (!cancelled) setValidatingPoints(false);
        }
      })();
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    useLoyaltyPoints,
    pointsToRedeemInput,
    customer?.id,
    shop?.id,
    checkoutOriginalPriceEgp,
  ]);

  const appliedPointsRedeemed =
    useLoyaltyPoints && loyaltyValidation?.ok ? loyaltyValidation.pointsAllowed : 0;
  const appliedDiscountEgp =
    useLoyaltyPoints && loyaltyValidation?.ok ? loyaltyValidation.discountEgp : 0;
  const checkoutFinalAmountEgp = Math.max(
    0,
    Math.round((checkoutOriginalPriceEgp - appliedDiscountEgp) * 100) / 100,
  );
  const checkoutPlatformFee = computePlatformFee(checkoutFinalAmountEgp);

  const hasOwnerSchedule = shopHasCustomerSchedule(shopExtras) || shopHasSavedSchedule(shopExtras);

  const slotExtras = useMemo(() => {
    if (!shopExtras) return shopExtras;
    const duration =
      selectedServices.reduce((sum, s) => sum + s.durationMinutes, 0) ||
      shopExtras.serviceDurationMinutes;
    return { ...shopExtras, serviceDurationMinutes: duration };
  }, [shopExtras, selectedServices]);

  const timeSlots = useMemo((): TimeSlotOption[] => {
    if (!hasOwnerSchedule) return [];
    return buildSlotsForShopDate({
      extras: slotExtras,
      dateYmd,
      bookings: shopBookings,
    });
  }, [hasOwnerSchedule, slotExtras, dateYmd, shopBookings]);

  useEffect(() => {
    const available = timeSlots.filter((s) => s.status !== 'booked');
    if (!available.length) {
      setTimeSlot('');
      return;
    }
    if (!timeSlot || !available.some((s) => s.time === timeSlot)) {
      setTimeSlot(available[0].time);
    }
  }, [timeSlots, timeSlot]);

  if (!shop) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <Text style={{ color: theme.text }}>{t('book_shop_not_found')}</Text>
      </View>
    );
  }

  async function onSubmit() {
    if (isGuest || !customer) {
      router.push({
        pathname: '/auth-required',
        params: {
          intent: 'booking',
          returnTo: buildBookReturnTo(
            String(shopId),
            selectedServiceIds.length ? selectedServiceIds : undefined,
          ),
        },
      });
      return;
    }
    if (!shop) return;
    const normalizedPhone = resolveBookingPhone(resolvedPhone);
    if (!normalizedPhone) {
      userAlert(t('book_missing_title'), t('book_missing_phone_profile'));
      return;
    }
    if (!carType.trim()) {
      userAlert(t('book_missing_title'), t('book_missing_car_type'));
      return;
    }
    if (shop.type === 'wash' && activeServices.length && selectedServices.length === 0) {
      userAlert(t('book_missing_title'), t('book_missing_service'));
      return;
    }
    const scheduledAt = buildScheduledIso(dateYmd, timeSlot);
    if (!scheduledAt) {
      userAlert(t('book_missing_title'), t('book_invalid_datetime'));
      return;
    }

    const serviceName = selectedServices.map((s) => s.name).join(' + ') || undefined;
    const serviceNameAr =
      selectedServices.map((s) => s.nameAr || s.name).join(' + ') || undefined;
    const serviceDurationMinutes =
      selectedServices.reduce((sum, s) => sum + s.durationMinutes, 0) || undefined;
    const baseServicePriceEgp = campaignAdjustedTotal;
    let loyaltyCheckout:
      | {
          originalPriceEgp: number;
          pointsRedeemed: number;
          discountAppliedEgp: number;
          finalAmountPaidEgp: number;
        }
      | undefined;

    if (useLoyaltyPoints && appliedPointsRedeemed > 0) {
      const freshValidation = await validatePointsRedemptionRemote({
        userId: customer.id,
        shopId: shop.id,
        pointsToRedeem: appliedPointsRedeemed,
        invoiceTotalEgp: checkoutOriginalPriceEgp,
      });
      if (!freshValidation.ok || freshValidation.pointsAllowed <= 0) {
        userAlert(t('book_missing_title'), t('book_loyalty_invalid'));
        return;
      }
      loyaltyCheckout = {
        originalPriceEgp: checkoutOriginalPriceEgp,
        pointsRedeemed: freshValidation.pointsAllowed,
        discountAppliedEgp: freshValidation.discountEgp,
        finalAmountPaidEgp: Math.max(
          0,
          Math.round((checkoutOriginalPriceEgp - freshValidation.discountEgp) * 100) / 100,
        ),
      };
    } else {
      loyaltyCheckout = {
        originalPriceEgp: checkoutOriginalPriceEgp,
        pointsRedeemed: 0,
        discountAppliedEgp: 0,
        finalAmountPaidEgp: checkoutOriginalPriceEgp,
      };
    }

    const discountedServicePriceEgp = loyaltyCheckout.finalAmountPaidEgp;
    const notesCombined = customerNotes.trim() || undefined;

    setSaving(true);
    try {
      await createBooking({
        shopId: shop.id,
        shopType: shop.type,
        customerId: customer?.id,
        customerPhone: normalizedPhone,
        carType: carType.trim(),
        carColor: carColor.trim(),
        scheduledAt,
        serviceId: selectedServices[0]?.id,
        serviceName,
        serviceNameAr,
        serviceDurationMinutes,
        servicePriceEgp: discountedServicePriceEgp,
        offerId: activeCampaignOffer?.id,
        customerNotes: notesCombined,
        vehicleId,
      }, {
        appliedCouponId: showCoupons ? appliedCoupon?.couponId : undefined,
        couponUsageUserId: showCoupons ? customer.id : undefined,
        loyaltyCheckout,
      });
      await saveCustomerPhone(normalizedPhone);
      await refreshLoyaltyBalance();
      setReceiptSummary({
        shopName,
        serviceLabels,
        totalPrice: loyaltyCheckout.finalAmountPaidEgp,
        totalMinutes,
        scheduledAt,
        timeSlot,
      });
      setSuccessVisible(true);
    } catch (error) {
      const message = logAndGetSafeErrorMessage(error, t, 'booking.createBooking');
      userAlert(t('book_submit_fail_title'), message);
    } finally {
      setSaving(false);
    }
  }

  function onFinalizeBooking() {
    setSuccessVisible(false);
    setReceiptSummary(null);
    router.replace('/bookings');
  }

  function onRedeemMaxPoints() {
    const maxFromInvoice = Math.floor(checkoutOriginalPriceEgp * MERCHANT_LOYALTY_REDEEM_POINTS_PER_EGP);
    const maxPoints = Math.min(loyaltyBalance, maxFromInvoice);
    setUseLoyaltyPoints(true);
    setPointsToRedeemInput(maxPoints > 0 ? String(maxPoints) : '');
  }

  function onToggleLoyaltyRedemption(next: boolean) {
    setUseLoyaltyPoints(next);
    if (!next) {
      setPointsToRedeemInput('');
      setLoyaltyValidation(null);
    }
  }

  const shopName =
    locale === 'ar'
      ? shopExtras?.profileNameAr || shopExtras?.profileName || shop.nameAr
      : shopExtras?.profileName || shop.name;
  const shopAddress =
    locale === 'ar'
      ? shopExtras?.profileAddressAr || shopExtras?.profileAddress || shop.addressAr
      : shopExtras?.profileAddress || shop.address;
  const shopPhone = shopExtras?.profilePhone || shop.phone;

  const serviceLabels = selectedServices.map((s) =>
    locale === 'ar' ? s.nameAr || s.name : s.name,
  );
  const baseTotalPrice = rawServiceTotal;
  const discountedTotalPrice = checkoutOriginalPriceEgp;
  const totalMinutes = selectedServices.reduce((sum, s) => sum + s.durationMinutes, 0);
  const campaignSavingsEgp = Math.max(0, Math.round((rawServiceTotal - campaignAdjustedTotal) * 100) / 100);
  const qualifiesForFreeWash =
    !!activeCampaignOffer && isBuyXGetYFreeNext(activeCampaignOffer, doneBookingCount);
  const estimatedPlatformFee = computePlatformFee(checkoutFinalAmountEgp);

  const selectedSlot = timeSlots.find((s) => s.time === timeSlot);

  async function onApplyPromoCode() {
    if (!shop) return;
    if (!customer?.id || isGuest) {
      userAlert(t('book_coupon_invalid_title'), t('book_coupon_invalid_or_expired'));
      return;
    }
    const code = promoCode.trim();
    if (!code) return;
    setApplyingPromo(true);
    try {
      const validation = await validateCouponForCheckout({
        shopId: shop.id,
        code,
        userId: customer.id,
      });
      if (!validation.ok) {
        const messageKey =
          validation.reason === 'global_limit_reached'
            ? 'book_coupon_limit_reached'
            : validation.reason === 'per_user_limit_reached'
              ? 'book_coupon_already_used'
              : 'book_coupon_invalid_or_expired';
        userAlert(t('book_coupon_invalid_title'), t(messageKey));
        setAppliedCoupon(null);
        return;
      }
      if (validation.minOrderEgp != null && baseTotalPrice < validation.minOrderEgp) {
        userAlert(t('book_coupon_invalid_title'), t('book_coupon_invalid_or_expired'));
        setAppliedCoupon(null);
        return;
      }
      setAppliedCoupon({
        couponId: validation.couponId,
        code: validation.code,
        discountType: validation.discountType,
        discountValue: validation.discountValue,
      });
      const discountText =
        validation.discountType === 'percent'
          ? `${validation.discountValue}%`
          : `${validation.discountValue} EGP`;
      userAlert(
        t('book_coupon_applied_title'),
        t('book_coupon_applied_body').replace('{discount}', discountText),
      );
    } finally {
      setApplyingPromo(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <AutomotiveBackground theme={theme} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.shopName, { color: theme.text }]}>{shopName}</Text>
        <Text style={[styles.meta, { color: theme.textMuted }]}>
          {shopTypeLabel(shop.type, locale)} · {shopAddress}
        </Text>

        {activeCampaignOffer ? (
          <View style={[styles.offerBanner, { backgroundColor: theme.warmSoft, borderColor: theme.warm }]}>
            <Text style={[styles.offerBannerTitle, { color: theme.warm }]}>{t('book_offer_banner_title')}</Text>
            <Text style={[styles.offerBannerBody, { color: theme.text }]}>
              {formatOfferBadge(activeCampaignOffer, offerBadgeMessages)} ·{' '}
              {locale === 'ar'
                ? activeCampaignOffer.titleAr || activeCampaignOffer.title
                : activeCampaignOffer.title}
            </Text>
            {qualifiesForFreeWash ? (
              <Text style={[styles.offerBannerMeta, { color: theme.green }]}>{t('book_offer_free_wash')}</Text>
            ) : campaignSavingsEgp > 0 ? (
              <Text style={[styles.offerBannerMeta, { color: theme.danger }]}>
                {t('book_offer_savings').replace('{amount}', formatEgp(campaignSavingsEgp, locale))}
              </Text>
            ) : null}
          </View>
        ) : null}

        {shop.type === 'wash' && activeServices.length > 0 ? (
          <ServiceMultiPicker
            services={activeServices}
            selectedIds={selectedServiceIds}
            onChange={setSelectedServiceIds}
            disabled={saving}
          />
        ) : null}

        <View style={styles.shopContactRow}>
          <Pressable
            onPress={() => openPhone(shopPhone).catch(() => Alert.alert(t('settings_link_fail_title'), t('settings_link_fail_body')))}
            style={[styles.contactChip, { borderColor: theme.accent, backgroundColor: theme.accentSoft }]}>
            <Text style={[styles.contactChipText, { color: theme.accent }]}>
              {t('book_call_shop')} · {formatPhoneDisplay(shopPhone)}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => openShopInMaps(shop, locale).catch(() => Alert.alert(t('settings_link_fail_title'), t('settings_link_fail_body')))}
            style={[styles.contactChip, { borderColor: theme.accent, backgroundColor: theme.accentSoft }]}>
            <Text style={[styles.contactChipText, { color: theme.accent }]}>{t('book_open_maps')}</Text>
          </Pressable>
        </View>

        <Text style={[styles.label, { color: theme.text }]}>{t('book_your_phone_label')}</Text>
        <View
          style={[
            styles.savedCarCard,
            {
              borderColor: theme.border,
              backgroundColor: theme.card,
            },
          ]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.savedCarLabel, { color: theme.textMuted }]}>
              {t('book_phone_from_profile')}
            </Text>
            <Text style={[styles.savedCarText, { color: theme.text }]}>
              {resolvedPhone ? formatPhoneDisplay(resolvedPhone) : t('book_phone_missing_profile')}
            </Text>
          </View>
        </View>

        {customer && !isGuest && hasRegisteredVehicles ? (
          <>
            <Text style={[styles.label, { color: theme.text }]}>{t('book_vehicle_select_label')}</Text>
            <ActiveVehiclePicker
              customerId={customer.id}
              embedded
              showManageLink
              onVehicleChange={applyVehicleToBooking}
            />
          </>
        ) : (
          <>
            <Text style={[styles.label, { color: theme.text }]}>{t('book_car_type_label')}</Text>
            <TextInput
              placeholder={t('book_car_type_placeholder')}
              placeholderTextColor={theme.textDim}
              value={carType}
              onChangeText={setCarType}
              style={inputStyle(theme)}
            />

            <Text style={[styles.label, { color: theme.text }]}>{t('book_car_color_label')}</Text>
            <TextInput
              placeholder={t('book_car_color_placeholder')}
              placeholderTextColor={theme.textDim}
              value={carColor}
              onChangeText={setCarColor}
              style={inputStyle(theme)}
            />
          </>
        )}

        {customer && !isGuest && !hasRegisteredVehicles ? (
          <Pressable
            onPress={() => router.push('/settings/vehicles')}
            style={[styles.manageVehiclesLink, { borderColor: theme.border }]}>
            <Text style={{ color: theme.accent, fontWeight: '800', fontSize: 13 }}>{t('home_manage_vehicles')}</Text>
          </Pressable>
        ) : null}

        <Text style={[styles.label, { color: theme.text }]}>{t('book_customer_notes_label')}</Text>
        <TextInput
          placeholder={t('book_customer_notes_placeholder')}
          placeholderTextColor={theme.textDim}
          value={customerNotes}
          onChangeText={setCustomerNotes}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          style={[inputStyle(theme), styles.notesInput]}
        />

        <BookingDatePicker
          valueYmd={dateYmd}
          onChangeYmd={setDateYmd}
          locale={locale}
          label={t('book_date_label')}
          pickHint={t('book_date_pick_hint')}
          borderColor={theme.border}
          backgroundColor={theme.card}
          textColor={theme.text}
        />

        {hasOwnerSchedule && shopExtras?.workOpenTime && shopExtras.workCloseTime && shopExtras.serviceDurationMinutes ? (
          <Text style={[styles.scheduleHint, { color: theme.textMuted }]}>
            {formatShopScheduleLine(
              shopExtras.workOpenTime,
              shopExtras.workCloseTime,
              selectedServices[0]?.durationMinutes ?? shopExtras.serviceDurationMinutes,
              locale,
            )}
          </Text>
        ) : hasOwnerSchedule ? null : (
          <Text style={[styles.scheduleHint, { color: theme.textMuted }]}>{t('book_no_shop_hours')}</Text>
        )}

        <Text style={[styles.label, { color: theme.text }]}>{t('book_time_label')}</Text>
        {!hasOwnerSchedule ? (
          <Text style={[styles.meta, { color: theme.textMuted }]}>{t('book_no_shop_hours')}</Text>
        ) : timeSlots.length === 0 ? (
          <Text style={[styles.meta, { color: theme.textMuted }]}>{t('book_no_slots')}</Text>
        ) : (
          <View style={[styles.slots, isRTL && styles.slotsRtl]}>
            {timeSlots.map((slot) => {
              const active = slot.time === timeSlot;
              const disabled = slot.status === 'booked';
              const slotColors = slotStyle(slot.status, active, disabled, theme);
              return (
                <Pressable
                  key={slot.time}
                  onPress={() => !disabled && setTimeSlot(slot.time)}
                  disabled={disabled}
                  style={[
                    styles.slot,
                    {
                      backgroundColor: slotColors.backgroundColor,
                      borderColor: slotColors.borderColor,
                      opacity: disabled ? 0.5 : 1,
                    },
                  ]}>
                  <Text
                    style={{
                      color: disabled ? theme.textDim : active ? theme.onAccent : theme.text,
                      fontWeight: '700',
                    }}>
                    {slot.time}
                  </Text>
                  {slot.status !== 'available' ? (
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: '700',
                        color: disabled ? theme.textDim : active ? theme.onAccent : theme.warm,
                        marginTop: 2,
                      }}>
                      {slot.status === 'booked' ? t('slot_booked') : t('slot_almost_full')}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        )}

        {timeSlot && selectedSlot?.status !== 'booked' ? (
          <View
            style={[
              styles.summaryCard,
              {
                borderColor: theme.border,
                backgroundColor: theme.card,
              },
            ]}>
            <Text style={[styles.summaryTitle, { color: theme.text }]}>{t('book_summary_title')}</Text>
            <Text style={[styles.summaryLine, { color: theme.text }]}>{shopName}</Text>
            {serviceLabels.length ? (
              serviceLabels.map((label) => (
                <Text key={label} style={[styles.summaryLine, { color: theme.textMuted }]}>
                  · {label}
                </Text>
              ))
            ) : null}
            {baseTotalPrice > 0 ? (
              <Text style={[styles.summaryLine, { color: theme.accent }]}>
                {formatEgp(baseTotalPrice, locale)}
                {totalMinutes > 0 ? ` · ${totalMinutes} ${locale === 'ar' ? 'دقيقة' : 'min'}` : ''}
              </Text>
            ) : null}
            <Text style={[styles.summaryLine, { color: theme.textMuted }]}>
              {carType.trim() || '—'}
              {carColor.trim() ? ` · ${carColor.trim()}` : ''}
            </Text>
            <Text style={[styles.summaryLine, { color: theme.textMuted }]}>
              {dateYmd} · {timeSlot}
            </Text>
            {customerNotes.trim() ? (
              <Text style={[styles.summaryLine, { color: theme.textMuted }]}>
                {customerNotes.trim()}
              </Text>
            ) : null}
          </View>
        ) : null}

        {checkoutOriginalPriceEgp > 0 && timeSlot && selectedSlot?.status !== 'booked' ? (
          <>
            {loyaltyEnabled && loyaltyBalance > 0 && customer && !isGuest ? (
              <View
                style={[
                  styles.checkoutCard,
                  { backgroundColor: CHECKOUT_CARD, borderColor: 'rgba(255,255,255,0.05)' },
                ]}>
                <Text style={[styles.checkoutSectionTitle, { color: theme.text }]}>
                  {t('book_loyalty_section_title')}
                </Text>
                <Text style={[styles.checkoutHint, { color: theme.textMuted, fontSize: 16 }]}>
                  {t('book_loyalty_available').replace('{points}', String(loyaltyBalance))}
                </Text>
                <Text style={[styles.checkoutHint, { color: CHECKOUT_CYAN, fontSize: 16, fontWeight: '700' }]}>
                  {t('book_loyalty_exchange_hint')}
                </Text>

                <View style={styles.loyaltyToggleRow}>
                  <Text style={[styles.loyaltyToggleLabel, { color: theme.text }]}>
                    {t('book_loyalty_points_input_label')}
                  </Text>
                  <Switch
                    value={useLoyaltyPoints}
                    onValueChange={onToggleLoyaltyRedemption}
                    trackColor={{ false: theme.border, true: theme.accentSoft }}
                    thumbColor={useLoyaltyPoints ? CHECKOUT_CYAN : theme.textDim}
                  />
                </View>

                {useLoyaltyPoints ? (
                  <>
                    <View style={styles.loyaltyInputRow}>
                      <TextInput
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor={theme.textDim}
                        value={pointsToRedeemInput}
                        onChangeText={(text) => setPointsToRedeemInput(text.replace(/[^\d]/g, ''))}
                        style={[
                          inputStyle(theme),
                          styles.loyaltyPointsInput,
                          { backgroundColor: theme.bgElevated, fontSize: 18, fontWeight: '800' },
                        ]}
                      />
                      <Pressable
                        onPress={onRedeemMaxPoints}
                        style={[styles.redeemMaxBtn, { borderColor: CHECKOUT_CYAN, backgroundColor: theme.bgElevated }]}>
                        <Text style={[styles.redeemMaxBtnText, { color: CHECKOUT_CYAN }]}>
                          {t('book_loyalty_redeem_max')}
                        </Text>
                      </Pressable>
                    </View>
                    {validatingPoints ? (
                      <Text style={[styles.checkoutHint, { color: theme.textMuted }]}>
                        {t('book_saving')}
                      </Text>
                    ) : loyaltyValidation && !loyaltyValidation.ok && Number(pointsToRedeemInput) > 0 ? (
                      <Text style={[styles.checkoutHint, { color: theme.danger, fontSize: 16 }]}>
                        {t('book_loyalty_invalid')}
                      </Text>
                    ) : null}
                  </>
                ) : null}
              </View>
            ) : null}

            <View
              style={[
                styles.checkoutCard,
                { backgroundColor: CHECKOUT_CARD, borderColor: 'rgba(255,255,255,0.05)' },
              ]}>
              <Text style={[styles.checkoutSectionTitle, { color: theme.text }]}>
                {t('book_summary_title')}
              </Text>

              <View style={styles.invoiceRow}>
                <Text style={[styles.invoiceLabel, { color: theme.textMuted }]}>
                  {t('book_invoice_subtotal')}
                </Text>
                <Text style={[styles.invoiceValue, { color: theme.text }]}>
                  {formatEgp(checkoutOriginalPriceEgp, locale)}
                </Text>
              </View>

              {appliedDiscountEgp > 0 ? (
                <View style={styles.invoiceRow}>
                  <Text style={[styles.invoiceLabel, { color: theme.textMuted }]}>
                    {t('book_invoice_points_discount')}
                  </Text>
                  <Text style={[styles.invoiceValue, { color: theme.green }]}>
                    -{formatEgp(appliedDiscountEgp, locale)}
                  </Text>
                </View>
              ) : null}

              <View style={[styles.invoiceDivider, { backgroundColor: theme.border }]} />

              <View style={styles.invoiceRow}>
                <Text style={[styles.invoiceTotalLabel, { color: theme.text }]}>
                  {t('book_invoice_total_payment')}
                </Text>
                <Text style={[styles.invoiceTotalValue, { color: CHECKOUT_CYAN }]}>
                  {formatEgp(checkoutFinalAmountEgp, locale)}
                </Text>
              </View>

              <Text style={[styles.checkoutHint, { color: theme.textDim, fontSize: 16, marginTop: 8 }]}>
                {t('book_platform_fee_note').replace('{fee}', formatEgp(checkoutPlatformFee, locale))}
              </Text>
            </View>
          </>
        ) : null}

        {showCoupons && checkoutOriginalPriceEgp > 0 ? (
          <View style={[styles.checkoutCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.label, { color: theme.text, marginTop: 0 }]}>{t('book_coupon_label')}</Text>
            <View style={styles.couponRow}>
              <TextInput
                placeholder={t('book_coupon_placeholder')}
                placeholderTextColor={theme.textDim}
                value={promoCode}
                onChangeText={setPromoCode}
                style={[inputStyle(theme), styles.couponInput]}
                autoCapitalize="characters"
              />
              <Pressable
                onPress={() => void onApplyPromoCode()}
                disabled={applyingPromo}
                style={[styles.couponApplyBtn, { backgroundColor: theme.accent, opacity: applyingPromo ? 0.65 : 1 }]}>
                <Text style={[styles.couponApplyBtnText, { color: theme.onAccent }]}>
                  {applyingPromo ? t('book_saving') : t('book_coupon_apply')}
                </Text>
              </Pressable>
            </View>
            {appliedCoupon ? (
              <Text style={[styles.checkoutHint, { color: theme.accent }]}>
                {t('book_coupon_active').replace('{code}', appliedCoupon.code)}
              </Text>
            ) : null}
            <Text style={[styles.checkoutLabel, { color: theme.textMuted }]}>{t('book_checkout_total')}</Text>
            {appliedCoupon ? (
              <Text style={[styles.checkoutStrike, { color: theme.textDim }]}>{formatEgp(baseTotalPrice, locale)}</Text>
            ) : null}
            <Text style={[styles.checkoutValue, { color: theme.text }]}>
              {formatEgp(discountedTotalPrice, locale)}
            </Text>
            <Text style={[styles.checkoutHint, { color: theme.textDim }]}>
              {t('book_platform_fee_note').replace('{fee}', formatEgp(estimatedPlatformFee, locale))}
            </Text>
          </View>
        ) : null}

        <Text style={[styles.policyText, { color: theme.textDim }]}>{t('book_cancellation_policy')}</Text>

        <Pressable
          onPress={onSubmit}
          disabled={saving || !timeSlot || !resolvedPhone || selectedSlot?.status === 'booked'}
          style={[
            styles.primaryBtn,
            {
              backgroundColor: theme.accent,
              opacity: saving || !timeSlot || !resolvedPhone ? 0.65 : 1,
            },
          ]}>
          <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>
            {saving ? t('book_saving') : t('book_submit')}
          </Text>
        </Pressable>
      </ScrollView>

      <Modal visible={successVisible} transparent animationType="fade" onRequestClose={onFinalizeBooking}>
        <View style={styles.successBackdrop}>
          <View
            style={[
              styles.successCard,
              {
                backgroundColor: theme.card,
                borderColor: theme.border,
              },
            ]}>
            <View style={[styles.successIconWrap, { backgroundColor: theme.accent }]}>
              <FontAwesome name="check" size={28} color={theme.onAccent} />
            </View>
            <Text style={[styles.successTitle, { color: theme.text }]}>{t('book_receipt_title')}</Text>
            <Text style={[styles.successLead, { color: theme.textMuted }]}>{t('book_receipt_lead')}</Text>

            <View style={[styles.receiptCard, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
              <Text style={[styles.receiptShop, { color: theme.text }]}>{receiptSummary?.shopName ?? shopName}</Text>

              {receiptSummary?.serviceLabels.length ? (
                <View style={styles.receiptSection}>
                  <Text style={[styles.receiptLabel, { color: theme.textMuted }]}>{t('book_receipt_services')}</Text>
                  {receiptSummary.serviceLabels.map((label) => (
                    <Text key={label} style={[styles.receiptBullet, { color: theme.text }]}>
                      · {label}
                    </Text>
                  ))}
                </View>
              ) : null}

              <View style={styles.receiptSection}>
                <Text style={[styles.receiptLabel, { color: theme.textMuted }]}>{t('book_receipt_total')}</Text>
                <Text style={[styles.receiptValue, { color: theme.text }]}>
                  {formatEgp(receiptSummary?.totalPrice ?? baseTotalPrice, locale)}
                  {(receiptSummary?.totalMinutes ?? totalMinutes) > 0
                    ? ` · ${receiptSummary?.totalMinutes ?? totalMinutes} ${locale === 'ar' ? 'دقيقة' : 'min'}`
                    : ''}
                </Text>
              </View>

              <View style={styles.receiptSection}>
                <Text style={[styles.receiptLabel, { color: theme.textMuted }]}>{t('book_receipt_appointment')}</Text>
                <Text style={[styles.receiptValue, { color: theme.text }]}>
                  {receiptSummary?.scheduledAt
                    ? formatBookingDateTime(receiptSummary.scheduledAt, locale)
                    : `${dateYmd} · ${timeSlot}`}
                </Text>
                {receiptSummary?.timeSlot ? (
                  <Text style={[styles.receiptMeta, { color: theme.textMuted }]}>
                    {t('book_receipt_slot')}: {receiptSummary.timeSlot}
                  </Text>
                ) : null}
              </View>
            </View>

            <Pressable onPress={onFinalizeBooking} style={[styles.successBtn, { backgroundColor: theme.accent }]}>
              <Text style={[styles.successBtnText, { color: theme.onAccent }]}>{t('book_receipt_finalize')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function slotStyle(
  status: SlotAvailability,
  active: boolean,
  disabled: boolean,
  theme: AppThemeTokens,
) {
  if (disabled) {
    return {
      backgroundColor: theme.bgElevated,
      borderColor: theme.border,
    };
  }
  if (active) {
    return { backgroundColor: theme.accent, borderColor: theme.accent };
  }
  if (status === 'almost_full') {
    return {
      backgroundColor: theme.warmSoft,
      borderColor: theme.warm,
    };
  }
  return {
    backgroundColor: theme.card,
    borderColor: theme.border,
  };
}

function inputStyle(theme: AppThemeTokens) {
  return [
    styles.input,
    {
      color: theme.text,
      borderColor: theme.border,
      backgroundColor: theme.card,
    },
  ];
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  content: { padding: 20, paddingBottom: 40 },
  shopName: { fontSize: 24, fontWeight: '900', marginBottom: 4, letterSpacing: -0.3 },
  meta: { fontSize: 14, marginBottom: 12 },
  offerBanner: { borderWidth: 1, borderRadius: 20, padding: 14, marginBottom: 14 },
  offerBannerTitle: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', marginBottom: 4, letterSpacing: 0.5 },
  offerBannerBody: { fontSize: 15, fontWeight: '800' },
  offerBannerMeta: { fontSize: 13, fontWeight: '800', marginTop: 6 },
  offerActionBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
  },
  offerActionBtnText: { fontSize: 14, fontWeight: '800' },
  checkoutCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
    marginTop: 16,
    gap: 8,
  },
  checkoutSectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  loyaltyToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    gap: 12,
  },
  loyaltyToggleLabel: { fontSize: 16, fontWeight: '800', flex: 1 },
  loyaltyInputRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 8 },
  loyaltyPointsInput: { flex: 1, marginTop: 0, minHeight: 52 },
  redeemMaxBtn: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 52,
    justifyContent: 'center',
  },
  redeemMaxBtnText: { fontSize: 15, fontWeight: '800' },
  invoiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 6,
  },
  invoiceLabel: { fontSize: 16, fontWeight: '700' },
  invoiceValue: { fontSize: 16, fontWeight: '800' },
  invoiceDivider: { height: 1, marginVertical: 8 },
  invoiceTotalLabel: { fontSize: 17, fontWeight: '900' },
  invoiceTotalValue: { fontSize: 24, fontWeight: '900' },
  checkoutLabel: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  checkoutValue: { fontSize: 22, fontWeight: '900' },
  checkoutStrike: { fontSize: 16, fontWeight: '700', textDecorationLine: 'line-through' },
  checkoutHint: { fontSize: 12, lineHeight: 18 },
  couponRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 },
  couponInput: { flex: 1, marginTop: 0 },
  couponApplyBtn: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 86,
  },
  couponApplyBtnText: { fontSize: 13, fontWeight: '800' },
  priceRow: { gap: 4, marginBottom: 4 },
  strikePrice: { textDecorationLine: 'line-through' },
  shopContactRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  contactChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  contactChipText: { fontSize: 13, fontWeight: '800' },
  label: { fontSize: 14, fontWeight: '700', marginBottom: 8, marginTop: 12 },
  scheduleHint: { fontSize: 13, lineHeight: 19, marginBottom: 4, marginTop: 4 },
  savedCarCard: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  savedCarLabel: { fontSize: 12, marginBottom: 3, fontWeight: '600' },
  savedCarText: { fontSize: 16, fontWeight: '800' },
  manageVehiclesLink: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  notesInput: { minHeight: 96, paddingTop: 14 },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotsRtl: { flexDirection: 'row-reverse' },
  slot: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    minWidth: 72,
  },
  summaryCard: { borderWidth: 1, borderRadius: 22, padding: 16, marginTop: 18 },
  summaryTitle: { fontSize: 15, fontWeight: '800', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryLine: { fontSize: 14, lineHeight: 21, marginBottom: 4 },
  policyText: { fontSize: 12, lineHeight: 18, marginTop: 18 },
  primaryBtn: {
    marginTop: 18,
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnText: { fontWeight: '800', fontSize: 16 },
  successBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  successCard: {
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
  },
  successIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  successTitle: { fontSize: 22, fontWeight: '900', textAlign: 'center', marginBottom: 8 },
  successLead: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 16 },
  receiptCard: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 18,
    gap: 12,
  },
  receiptShop: { fontSize: 18, fontWeight: '900' },
  receiptSection: { gap: 4 },
  receiptLabel: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  receiptBullet: { fontSize: 14, lineHeight: 20 },
  receiptValue: { fontSize: 15, fontWeight: '800', lineHeight: 22 },
  receiptMeta: { fontSize: 13, lineHeight: 18 },
  successBtn: {
    width: '100%',
    borderRadius: 28,
    paddingVertical: 15,
    alignItems: 'center',
  },
  successBtnText: { fontWeight: '800', fontSize: 16 },
});
