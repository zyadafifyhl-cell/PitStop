import { router, type Href } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatVehicleDisplay } from '@/components/customer/ActiveVehiclePicker';
import { CustomerNotificationsBell } from '@/components/customer/CustomerNotificationsBell';
import { PitStopEgWordmark } from '@/components/ui/PitStopEgWordmark';
import { BRAND_COBALT } from '@/constants/Brand';
import { BOXED_OVERLAY, type AppThemeTokens } from '@/constants/Theme';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useI18n } from '@/context/I18nContext';
import { useShopCatalog } from '@/context/ShopCatalogContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { getShopById } from '@/lib/booking/catalogRepository';
import { getAreaById } from '@/lib/booking/areas';
import { bookingStatusLabel, formatBookingDateTime, shopTypeLabel } from '@/lib/booking/format';
import {
  fetchNextUpcomingBookingForPhone,
  getMyPenaltyBalance,
  isHomeNextUpcomingBooking,
  applyVirtualBookingLifecycle,
  listOutstandingPenaltyBookingsForPhone,
  pickPrimaryOutstandingPenaltyBooking,
  type PenaltyBalance,
} from '@/lib/booking/storage';
import type { Booking, ShopOffer, ShopType } from '@/lib/booking/types';
import { listAllActiveOffers, subscribeOffersRealtime } from '@/lib/booking/offerRepository';
import { isStoreShopType } from '@/lib/booking/storeCatalog';
import { listCustomerVehicles, loadVehiclePickerState } from '@/lib/booking/vehicleStorage';
import { formatOfferBadge, isOfferLive, buildOfferBadgeMessages } from '@/lib/booking/offerPricing';
import { formatEgp } from '@/lib/booking/reporting';
import type { TranslationKey } from '@/lib/i18n/strings';

const EMPTY_PENALTY_BALANCE: PenaltyBalance = {
  outstandingBalance: 0,
  pendingDisputes: 0,
  collectibleBalance: 0,
};

const LANDING_WEB = require('../../assets/images/landing-web.png');
const LANDING_MOBILE = require('../../assets/images/landing-mobile.png');

function homeColors(theme: AppThemeTokens) {
  const dark = theme.bg === '#000000';
  return {
    bg: theme.bg,
    card: theme.card,
    text: theme.text,
    muted: theme.textMuted,
    accent: theme.accent,
    ice: theme.warmSoft,
    iceText: theme.warm,
    cyan: theme.gradientYellow,
    border: theme.border,
    soonBorder: theme.chipBorder,
    soonPillBg: theme.accentSoft,
    soonPillText: theme.accent,
    titleSoon: dark ? theme.textMuted : '#334155',
    penaltyBg: dark ? 'rgba(239, 68, 68, 0.16)' : '#FEF2F2',
    penaltyTitle: dark ? '#FECACA' : '#7F1D1D',
    penaltyBody: dark ? '#FCA5A5' : '#991B1B',
    sectionBorder: theme.border,
  };
}

type HomePalette = ReturnType<typeof homeColors>;

function bookingStatusTone(status: Booking['status'], palette: HomePalette) {
  if (status === 'confirmed') {
    return { bg: palette.ice, color: palette.iceText, border: 'rgba(14, 165, 233, 0.28)' };
  }
  if (status === 'in_progress') {
    return { bg: 'rgba(0, 37, 92, 0.10)', color: palette.accent, border: 'rgba(0, 37, 92, 0.22)' };
  }
  if (status === 'done') return { bg: 'rgba(16, 185, 129, 0.12)', color: '#34D399', border: 'rgba(16, 185, 129, 0.28)' };
  if (status === 'no_show') return { bg: 'rgba(211, 47, 47, 0.10)', color: '#D32F2F', border: 'rgba(211, 47, 47, 0.25)' };
  return { bg: palette.card, color: palette.muted, border: palette.border };
}

function serviceIconName(type: ShopType): React.ComponentProps<typeof FontAwesome>['name'] {
  if (type === 'wash') return 'tint';
  if (type === 'detailing_studio') return 'shield';
  if (type === 'maintenance') return 'wrench';
  if (type === 'winch') return 'life-ring';
  if (type === 'parts') return 'cogs';
  return 'shopping-bag';
}

function safeHomeText(
  translateText: ((key: TranslationKey) => string) | undefined,
  key: TranslationKey,
  fallback: string,
): string {
  try {
    if (typeof translateText !== 'function') return fallback;
    const value = translateText(key);
    return typeof value === 'string' && value.trim() ? value : fallback;
  } catch {
    return fallback;
  }
}

function buildHomeServiceCards(
  translateText: ((key: TranslationKey) => string) | undefined,
  query: string,
): Array<{
  type: ShopType;
  title: string;
  subtitle: string;
  href: Href;
  available: boolean;
  image: number;
}> {
  const cards = [
    {
      type: 'wash' as const,
      title: safeHomeText(translateText, 'service_wash_title', 'Car Wash'),
      subtitle: safeHomeText(translateText, 'service_wash_sub', 'Exterior wash, polish & detailing'),
      href: '/service/wash' as Href,
      available: true,
      image: require('../../assets/images/service-wash.jpg'),
    },
    {
      type: 'detailing_studio' as const,
      title: safeHomeText(translateText, 'service_detailing_title', 'Detailing & Protection'),
      subtitle: safeHomeText(
        translateText,
        'service_detailing_sub',
        'PPF, ceramic coating, tinting & paint correction',
      ),
      href: '/service/detailing_studio' as Href,
      available: true,
      image: require('../../assets/images/service-detailing.jpg'),
    },
    {
      type: 'maintenance' as const,
      title: safeHomeText(translateText, 'service_maintenance_title', 'Maintenance'),
      subtitle: safeHomeText(
        translateText,
        'service_maintenance_sub',
        'Oil change, brakes, engine check & more',
      ),
      href: '/service/maintenance' as Href,
      available: false,
      image: require('../../assets/images/service-maintenance.jpg'),
    },
    {
      type: 'parts' as const,
      title: safeHomeText(translateText, 'service_parts_title', 'Spare parts'),
      subtitle: safeHomeText(translateText, 'service_parts_sub', 'Find parts shops in your area'),
      href: '/service/parts' as Href,
      available: false,
      image: require('../../assets/images/service-parts.jpg'),
    },
    {
      type: 'accessories' as const,
      title: safeHomeText(translateText, 'service_accessories_title', 'Accessories'),
      subtitle: safeHomeText(
        translateText,
        'service_accessories_sub',
        'Phone holders, covers, and car add-ons',
      ),
      href: '/service/accessories' as Href,
      available: false,
      image: require('../../assets/images/service-accessories.jpg'),
    },
  ];
  const q = query.trim().toLowerCase();
  if (!q) return cards;
  return cards.filter(
    (card) => card.title.toLowerCase().includes(q) || card.subtitle.toLowerCase().includes(q),
  );
}

function createHomeStyles(HOME: HomePalette) {
  return StyleSheet.create({
    screen: { flex: 1 },
    scroll: { flex: 1 },
    sheet: {
      width: '100%',
      marginTop: -28,
      paddingTop: 8,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      backgroundColor: HOME.bg,
    },
    content: {
      width: '100%',
      maxWidth: 1024,
      alignSelf: 'center',
      paddingHorizontal: 20,
      paddingTop: 14,
      paddingBottom: 52,
    },
    hero: {
      width: '100%',
      overflow: 'hidden',
      justifyContent: 'flex-end',
    },
    heroCopy: {
      paddingHorizontal: 22,
      paddingBottom: 52,
      maxWidth: 760,
      gap: 8,
    },
    heroTitle: {
      color: '#FFFFFF',
      fontSize: 34,
      fontWeight: '800',
      letterSpacing: -0.8,
      lineHeight: 40,
    },
    heroTagline: {
      color: 'rgba(255,255,255,0.9)',
      fontSize: 16,
      lineHeight: 23,
      maxWidth: 480,
    },
    heroMetaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 10,
      marginTop: 4,
    },
    heroGreeting: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '700',
    },
    heroVehicle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      maxWidth: 240,
      backgroundColor: 'rgba(255,255,255,0.16)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.34)',
      borderRadius: 999,
      paddingHorizontal: 11,
      paddingVertical: 6,
    },
    heroVehicleText: {
      flexShrink: 1,
      fontSize: 12,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    heroCta: {
      alignSelf: 'flex-start',
      marginTop: 8,
      backgroundColor: '#FFFFFF',
      borderRadius: 999,
      paddingHorizontal: 18,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    heroCtaText: {
      color: BRAND_COBALT,
      fontSize: 15,
      fontWeight: '800',
    },
    heroBell: {
      position: 'absolute',
      zIndex: 2,
      width: 40,
      height: 40,
      borderRadius: 999,
      backgroundColor: 'rgba(0,0,0,0.32)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.28)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    topHeaderRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 18,
    },
    greetingBlock: {
      flex: 1,
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 10,
    },
    greetingName: {
      fontSize: 26,
      fontWeight: '700',
      letterSpacing: -0.5,
      lineHeight: 32,
      color: HOME.text,
    },
    vehiclePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      maxWidth: 220,
      backgroundColor: HOME.ice,
      borderWidth: 1,
      borderColor: 'rgba(14, 165, 233, 0.22)',
      borderRadius: 999,
      paddingHorizontal: 11,
      paddingVertical: 6,
    },
    vehiclePillText: {
      flexShrink: 1,
      fontSize: 12,
      fontWeight: '700',
      color: HOME.iceText,
    },
    headerBellSlot: {
      width: 40,
      height: 40,
      borderRadius: 999,
      backgroundColor: HOME.card,
      borderWidth: 1,
      borderColor: HOME.border,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#0F172A',
      shadowOpacity: 0.06,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    penaltyBanner: {
      borderWidth: 1,
      borderColor: 'rgba(239, 68, 68, 0.28)',
      backgroundColor: HOME.penaltyBg,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 13,
      marginBottom: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    penaltyIcon: {
      width: 36,
      height: 36,
      borderRadius: 999,
      backgroundColor: 'rgba(239, 68, 68, 0.10)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    penaltyCopy: { flex: 1, gap: 3 },
    penaltyTitle: { color: HOME.penaltyTitle, fontSize: 15, fontWeight: '700' },
    penaltyBody: { color: HOME.penaltyBody, fontSize: 13, lineHeight: 18, fontWeight: '600' },
    penaltyPending: { color: '#B91C1C', fontSize: 12, lineHeight: 17, fontWeight: '700' },
    sectionCard: {
      backgroundColor: HOME.card,
      borderWidth: 1,
      borderColor: HOME.sectionBorder,
      borderRadius: 24,
      padding: 18,
      marginBottom: 14,
      shadowColor: '#0F172A',
      shadowOpacity: 0.06,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    heroCard: {
      paddingVertical: 20,
    },
    actionPressed: { transform: [{ scale: 0.98 }], opacity: 0.92 },
    sectionEyebrow: {
      color: HOME.muted,
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.4,
      marginBottom: 3,
      textTransform: 'uppercase',
    },
    nextBookingTopRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 12,
    },
    bookingIdentity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
    bookingTitleBlock: { flex: 1 },
    bookingIconBadge: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: HOME.ice,
      borderWidth: 1,
      borderColor: 'rgba(14, 165, 233, 0.22)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    confirmedBadge: {
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    confirmedDot: { width: 5, height: 5, borderRadius: 999 },
    confirmedBadgeText: { fontSize: 11, fontWeight: '700' },
    bookingMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 4 },
    cardTitle: { color: HOME.text, fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
    cardMeta: { color: HOME.muted, fontSize: 14, lineHeight: 20 },
    pillsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 16,
    },
    actionPill: {
      borderRadius: 999,
      paddingHorizontal: 16,
      paddingVertical: 10,
      minHeight: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionPillPrimary: {
      backgroundColor: HOME.accent,
    },
    actionPillGhost: {
      backgroundColor: HOME.card,
      borderWidth: 1,
      borderColor: HOME.border,
    },
    actionPillPrimaryText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
    actionPillGhostText: { fontSize: 14, fontWeight: '700', color: HOME.text },
    sectionTitle: { color: HOME.text, fontSize: 20, fontWeight: '700', marginBottom: 6, letterSpacing: -0.3 },
    sectionSub: { color: HOME.muted, fontSize: 14, lineHeight: 21, marginBottom: 14 },
    searchInput: {
      backgroundColor: HOME.bg,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 15,
      color: HOME.text,
      marginBottom: 14,
    },
    serviceList: {
      width: '100%',
      gap: 12,
    },
    serviceCard: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      borderWidth: 1,
      borderRadius: 18,
      paddingVertical: 10,
      paddingHorizontal: 10,
      minHeight: 104,
    },
    servicePhoto: {
      width: 84,
      height: 84,
      borderRadius: 12,
    },
    serviceCardActive: {
      backgroundColor: HOME.card,
      borderColor: 'rgba(0, 37, 92, 0.28)',
      minHeight: 96,
      opacity: 1,
    },
    serviceCardSoon: {
      backgroundColor: HOME.card,
      borderColor: HOME.soonBorder,
      opacity: 0.72,
    },
    serviceCardRtl: {
      flexDirection: 'row-reverse',
    },
    serviceCardHover: {
      borderColor: 'rgba(0, 37, 92, 0.45)',
      shadowColor: '#0F172A',
      shadowOpacity: 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 3 },
    },
    serviceCopy: { flex: 1, minWidth: 0, gap: 3 },
    serviceTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
    },
    serviceTitle: { fontSize: 16, fontWeight: '700', lineHeight: 21, color: HOME.text },
    serviceTitleSoon: { color: HOME.titleSoon },
    serviceSub: { fontSize: 13, lineHeight: 18, color: HOME.muted },
    comingSoonPill: {
      backgroundColor: HOME.soonPillBg,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    comingSoonPillText: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.2,
      color: HOME.soonPillText,
    },
    comingSoonBackdrop: BOXED_OVERLAY.backdrop,
    comingSoonCard: {
      ...BOXED_OVERLAY.card,
      maxWidth: 400,
      alignItems: 'center',
      padding: 22,
    },
    comingSoonIconWrap: {
      width: 48,
      height: 48,
      borderRadius: 999,
      backgroundColor: HOME.soonPillBg,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    comingSoonTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: HOME.text,
      marginBottom: 8,
      textAlign: 'center',
    },
    comingSoonBody: {
      fontSize: 15,
      lineHeight: 22,
      color: HOME.muted,
      textAlign: 'center',
      marginBottom: 18,
    },
    comingSoonBtn: {
      width: '100%',
      borderRadius: 999,
      paddingVertical: 13,
      alignItems: 'center',
    },
    comingSoonBtnText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
    offersCarousel: { gap: 12, paddingBottom: 4 },
    offerCard: {
      width: 230,
      backgroundColor: HOME.bg,
      borderWidth: 1,
      borderColor: HOME.border,
      borderRadius: 20,
      padding: 16,
    },
    offerTitle: { color: HOME.text, fontSize: 16, fontWeight: '700', marginBottom: 7, lineHeight: 22 },
    offerBadgeCapsule: {
      alignSelf: 'flex-start',
      backgroundColor: HOME.ice,
      borderWidth: 1,
      borderColor: 'rgba(14, 165, 233, 0.22)',
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
      marginBottom: 8,
    },
    offerBadgeCapsuleText: { fontSize: 12, fontWeight: '800', color: HOME.iceText },
    offerEyebrow: {
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      marginBottom: 8,
      color: HOME.muted,
    },
    offerMeta: { color: HOME.muted, fontSize: 13, lineHeight: 19 },
    offerShop: { color: HOME.text, fontSize: 13, lineHeight: 19, fontWeight: '600', marginTop: 6 },
  });
}

export default function HomeScreen() {
  const { t, tp, locale, isRTL } = useI18n();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const HOME = useMemo(() => homeColors(theme), [theme]);
  const styles = useMemo(() => createHomeStyles(HOME), [HOME]);
  const { customer, isGuest } = useCustomerAuth();
  const { ready: catalogReady, version: catalogVersion } = useShopCatalog();
  const [nextBookingSnapshot, setNextBookingSnapshot] = useState<Booking | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [liveOffers, setLiveOffers] = useState<
    Array<{ shopId: string; shopName: string; shopArea: string; shopType: ShopType; offer: ShopOffer }>
  >([]);
  const [serviceSearch, setServiceSearch] = useState('');
  const [serviceSearchFocused, setServiceSearchFocused] = useState(false);
  const [penaltyBalance, setPenaltyBalance] = useState<PenaltyBalance>(EMPTY_PENALTY_BALANCE);
  const [penaltyBookings, setPenaltyBookings] = useState<Booking[]>([]);
  const [activeVehicleLabel, setActiveVehicleLabel] = useState<string | null>(null);
  const [comingSoonVisible, setComingSoonVisible] = useState(false);

  const offerBadgeMessages = useMemo(() => buildOfferBadgeMessages(t), [t]);
  const serviceCards = useMemo(() => buildHomeServiceCards(t, serviceSearch), [t, serviceSearch]);
  const nextBooking = useMemo(() => {
    if (!nextBookingSnapshot) return null;
    const effective = applyVirtualBookingLifecycle(nextBookingSnapshot, nowMs);
    return isHomeNextUpcomingBooking(effective, nowMs) ? effective : null;
  }, [nextBookingSnapshot, nowMs]);
  const primaryPenaltyBooking = useMemo(
    () => pickPrimaryOutstandingPenaltyBooking(penaltyBookings),
    [penaltyBookings],
  );

  const loadLiveOffers = useCallback(async () => {
    if (!catalogReady) return;
    const activeOffers = await listAllActiveOffers();
    const cards: Array<{ shopId: string; shopName: string; shopArea: string; shopType: ShopType; offer: ShopOffer }> = [];

    for (const offer of activeOffers.filter((row) => isOfferLive(row))) {
      const shop = getShopById(offer.shopId ?? '');
      // Include every merchant type: wash, maintenance, winch, parts, accessories.
      if (!shop) continue;
      const shopName = locale === 'ar' ? shop.nameAr : shop.name;
      const area = getAreaById(shop.areaId);
      const shopArea =
        locale === 'ar'
          ? area?.nameAr || area?.name || shop.addressAr.split(',')[0] || shop.areaId
          : area?.name || shop.address.split(',')[0] || shop.areaId;
      cards.push({ shopId: shop.id, shopName, shopArea, shopType: shop.type, offer });
    }
    setLiveOffers(cards.slice(0, 8));
  }, [catalogReady, catalogVersion, locale]);

  function openFeaturedOffer(shopId: string, shopType: ShopType, offerId: string) {
    if (isStoreShopType(shopType)) {
      router.push({ pathname: '/store', params: { shopId } });
      return;
    }
    router.push(`/shop-profile/${shopId}?offerId=${encodeURIComponent(offerId)}` as Href);
  }

  const refreshHomeData = useCallback(async () => {
    if (!customer?.phone) {
      setNextBookingSnapshot(null);
      setPenaltyBalance(EMPTY_PENALTY_BALANCE);
      setPenaltyBookings([]);
      return;
    }

    const [upcoming, balance, outstandingPenalties] = await Promise.all([
      fetchNextUpcomingBookingForPhone(customer.phone),
      getMyPenaltyBalance().catch(() => EMPTY_PENALTY_BALANCE),
      listOutstandingPenaltyBookingsForPhone(customer.phone).catch(() => []),
    ]);
    setNextBookingSnapshot(upcoming);
    setPenaltyBalance(balance);
    setPenaltyBookings(outstandingPenalties);
    setNowMs(Date.now());
  }, [customer?.phone]);

  const refreshActiveVehicle = useCallback(async () => {
    if (!customer?.id || isGuest) {
      setActiveVehicleLabel(null);
      return;
    }
    const [, picker] = await Promise.all([
      listCustomerVehicles(customer.id),
      loadVehiclePickerState(customer.id),
    ]);
    const vehicle = picker.activeVehicle ?? picker.vehicles[0] ?? null;
    setActiveVehicleLabel(vehicle ? formatVehicleDisplay(vehicle) : null);
  }, [customer?.id, isGuest]);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    void refreshActiveVehicle();
  }, [refreshActiveVehicle]);

  useFocusEffect(
    useCallback(() => {
      refreshHomeData();
      loadLiveOffers();
      void refreshActiveVehicle();
    }, [refreshHomeData, loadLiveOffers, refreshActiveVehicle]),
  );

  useEffect(() => {
    const unsubscribe = subscribeOffersRealtime(() => {
      void loadLiveOffers();
    });
    return unsubscribe;
  }, [loadLiveOffers]);

  const greetingName = customer
    ? customer.name.split(' ')[0]?.trim() || customer.name
    : null;
  const nextBookingShop =
    catalogReady && nextBooking ? getShopById(nextBooking.shopId) : undefined;
  const nextBookingShopName = nextBookingShop
    ? locale === 'ar'
      ? nextBookingShop.nameAr
      : nextBookingShop.name
    : nextBooking?.shopId;
  const nextStatusTone = nextBooking ? bookingStatusTone(nextBooking.status, HOME) : null;

  function openPenaltyCause() {
    if (primaryPenaltyBooking) {
      router.push(`/booking/${primaryPenaltyBooking.id}` as Href);
      return;
    }
    router.push('/bookings');
  }

  function SurfaceCard({ children, style }: { children: React.ReactNode; style?: object }) {
    return <View style={[styles.sectionCard, style]}>{children}</View>;
  }

  const nativeLanding = Platform.OS !== 'web';
  const heroHeight = nativeLanding
    ? Math.round(Math.min(Math.max(height * 0.78, 560), 860))
    : Math.round(Math.min(Math.max(width < 820 ? height * 0.62 : height * 0.56, 440), 620));

  return (
    <View style={[styles.screen, { backgroundColor: HOME.bg }]}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { height: heroHeight }]}>
          <Image
            source={nativeLanding ? LANDING_MOBILE : LANDING_WEB}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
          <LinearGradient
            colors={['rgba(2,8,23,0.08)', 'rgba(2,8,23,0.18)', 'rgba(2,8,23,0.88)']}
            locations={[0, 0.46, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          {customer && !isGuest ? (
            <View
              style={[
                styles.heroBell,
                { top: insets.top + 12 },
                isRTL ? { left: 16 } : { right: 16 },
              ]}>
              <CustomerNotificationsBell embedded iconColor="#FFFFFF" />
            </View>
          ) : null}
          <View style={[styles.heroCopy, isRTL && { alignItems: 'flex-end', alignSelf: 'flex-end' }]}>
            <PitStopEgWordmark
              size={nativeLanding || width < 820 ? 'compact' : 'hero'}
              imageStyle={{ tintColor: '#FFFFFF' }}
              style={isRTL ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' }}
            />
            <Text style={[styles.heroTitle, isRTL && { textAlign: 'right' }]}>{t('welcome_hero_title')}</Text>
            <Text style={[styles.heroTagline, isRTL && { textAlign: 'right' }]}>{t('welcome_tagline')}</Text>
            <View style={[styles.heroMetaRow, isRTL && { flexDirection: 'row-reverse' }]}>
              <Text style={styles.heroGreeting}>
                {greetingName ? tp('home_greeting_named', { name: greetingName }) : t('home_greeting')}
              </Text>
              <Pressable
                onPress={() => router.push('/settings/vehicles')}
                style={({ pressed }) => [styles.heroVehicle, pressed && styles.actionPressed]}>
                <FontAwesome name="car" size={11} color="#FFFFFF" />
                <Text style={styles.heroVehicleText} numberOfLines={1}>
                  {activeVehicleLabel || t('store_no_vehicle')}
                </Text>
              </Pressable>
            </View>
            <Pressable
              onPress={() => router.push('/service/wash' as Href)}
              style={({ pressed }) => [
                styles.heroCta,
                isRTL && { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
                pressed && styles.actionPressed,
              ]}>
              <Text style={styles.heroCtaText}>{t('service_wash_title')}</Text>
              <FontAwesome name={isRTL ? 'arrow-left' : 'arrow-right'} size={13} color={BRAND_COBALT} />
            </Pressable>
          </View>
        </View>

        <View style={styles.sheet}>
        <View style={styles.content}>

        {penaltyBalance.outstandingBalance > 0 ? (
          <Pressable
            onPress={openPenaltyCause}
            style={({ pressed }) => [styles.penaltyBanner, pressed && styles.actionPressed]}>
            <View style={styles.penaltyIcon}>
              <FontAwesome name="exclamation" size={16} color="#B91C1C" />
            </View>
            <View style={styles.penaltyCopy}>
              <Text style={styles.penaltyTitle}>{t('home_penalty_balance_title')}</Text>
              <Text style={styles.penaltyBody}>
                {penaltyBookings.length > 1
                  ? tp('home_penalty_balance_body_multi', {
                      amount: formatEgp(penaltyBalance.outstandingBalance, locale),
                      count: String(penaltyBookings.length),
                    })
                  : tp('home_penalty_balance_body', {
                      amount: formatEgp(penaltyBalance.outstandingBalance, locale),
                    })}
              </Text>
              {penaltyBalance.pendingDisputes > 0 ? (
                <Text style={styles.penaltyPending}>{t('home_penalty_dispute_pending')}</Text>
              ) : null}
            </View>
            <FontAwesome name="chevron-right" size={13} color="#B91C1C" />
          </Pressable>
        ) : null}

        {nextBooking ? (
          <SurfaceCard style={styles.heroCard}>
            <View style={styles.nextBookingTopRow}>
              <View style={styles.bookingIdentity}>
                <View style={styles.bookingIconBadge}>
                  <FontAwesome
                    name={
                      nextBooking.shopType === 'wash'
                        ? 'tint'
                        : nextBooking.shopType === 'detailing_studio'
                          ? 'shield'
                          : 'wrench'
                    }
                    size={18}
                    color={HOME.accent}
                  />
                </View>
                <View style={styles.bookingTitleBlock}>
                  <Text style={styles.sectionEyebrow}>{t('home_next_booking_title')}</Text>
                  <Text style={styles.cardTitle}>{nextBookingShopName}</Text>
                </View>
              </View>
              {nextStatusTone ? (
                <View
                  style={[
                    styles.confirmedBadge,
                    { backgroundColor: nextStatusTone.bg, borderColor: nextStatusTone.border },
                  ]}>
                  <View style={[styles.confirmedDot, { backgroundColor: nextStatusTone.color }]} />
                  <Text style={[styles.confirmedBadgeText, { color: nextStatusTone.color }]}>
                    {bookingStatusLabel(nextBooking.status, locale)}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={styles.bookingMetaRow}>
              <FontAwesome name="calendar" size={12} color={HOME.muted} />
              <Text style={styles.cardMeta}>{formatBookingDateTime(nextBooking.scheduledAt, locale)}</Text>
            </View>
            <Text style={styles.cardMeta}>{shopTypeLabel(nextBooking.shopType, locale)}</Text>
          </SurfaceCard>
        ) : null}

        <View style={styles.pillsRow}>
          <Pressable
            onPress={() => router.push('/settings/vehicles')}
            style={({ pressed }) => [styles.actionPill, styles.actionPillPrimary, pressed && styles.actionPressed]}>
            <Text style={styles.actionPillPrimaryText}>+ {t('home_manage_vehicles')}</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/bookings')}
            style={({ pressed }) => [styles.actionPill, styles.actionPillGhost, pressed && styles.actionPressed]}>
            <Text style={styles.actionPillGhostText}>{t('book_success_view_bookings')}</Text>
          </Pressable>
        </View>

        <SurfaceCard>
          <Text style={styles.sectionTitle}>{t('home_pick_service')}</Text>
          <Text style={styles.sectionSub}>{t('home_pick_service_lead')}</Text>
          <TextInput
            value={serviceSearch}
            onChangeText={setServiceSearch}
            onFocus={() => setServiceSearchFocused(true)}
            onBlur={() => setServiceSearchFocused(false)}
            placeholder={t('home_search_placeholder')}
            placeholderTextColor={HOME.muted}
            style={[
              styles.searchInput,
              Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
              {
                borderColor: serviceSearchFocused ? HOME.accent : HOME.border,
              },
            ]}
          />

          <View style={styles.serviceList}>
            {serviceCards.map((card) => {
              const available = card.available;
              return (
                <Pressable
                  key={card.type}
                  onPress={() => {
                    if (!available) {
                      setComingSoonVisible(true);
                      return;
                    }
                    router.push(card.href);
                  }}
                  style={({ pressed, hovered }) => [
                    styles.serviceCard,
                    available ? styles.serviceCardActive : styles.serviceCardSoon,
                    isRTL && styles.serviceCardRtl,
                    available && (pressed || hovered) && styles.serviceCardHover,
                  ]}>
                  <Image source={card.image} style={styles.servicePhoto} contentFit="cover" />
                  <View style={styles.serviceCopy}>
                    <View style={[styles.serviceTitleRow, isRTL && styles.serviceCardRtl]}>
                      <Text style={[styles.serviceTitle, !available && styles.serviceTitleSoon]} numberOfLines={1}>
                        {card.title}
                      </Text>
                      {!available ? (
                        <View style={styles.comingSoonPill}>
                          <Text style={styles.comingSoonPillText}>
                            {locale === 'ar' ? 'قريباً' : 'Coming Soon'}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.serviceSub} numberOfLines={2}>
                      {card.subtitle}
                    </Text>
                  </View>
                  {available ? (
                    <FontAwesome
                      name={isRTL ? 'chevron-left' : 'chevron-right'}
                      size={12}
                      color={HOME.accent}
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </SurfaceCard>

        <SurfaceCard>
          <Text style={styles.sectionTitle}>{t('home_offers_carousel')}</Text>
          <Text style={styles.sectionSub}>{t('home_offers_title')}</Text>
          {liveOffers.length === 0 ? (
            <Text style={[styles.offerMeta, { marginBottom: 8 }]}>{t('home_offers_empty')}</Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.offersCarousel}>
              {liveOffers.map(({ shopId, shopName, shopArea, shopType, offer }) => {
                const description = offer.description?.trim();
                return (
                  <Pressable
                    key={offer.id}
                    onPress={() => openFeaturedOffer(shopId, shopType, offer.id)}
                    style={({ pressed, hovered }) => [
                      styles.offerCard,
                      (pressed || hovered) && styles.serviceCardHover,
                    ]}>
                    <Text style={styles.offerEyebrow}>{shopTypeLabel(shopType, locale)}</Text>
                    <View style={styles.offerBadgeCapsule}>
                      <Text style={styles.offerBadgeCapsuleText}>{formatOfferBadge(offer, offerBadgeMessages)}</Text>
                    </View>
                    <Text style={styles.offerTitle} numberOfLines={2}>
                      {locale === 'ar' ? offer.titleAr || offer.title : offer.title}
                    </Text>
                    {description ? (
                      <Text style={styles.offerMeta} numberOfLines={2}>
                        {description}
                      </Text>
                    ) : null}
                    <Text style={styles.offerShop} numberOfLines={1}>
                      {shopName} — {shopArea}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </SurfaceCard>
        </View>
        </View>
      </ScrollView>

      <Modal
        visible={comingSoonVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setComingSoonVisible(false)}>
        <Pressable style={[styles.comingSoonBackdrop, { backgroundColor: theme.overlay }]} onPress={() => setComingSoonVisible(false)}>
          <Pressable
            style={[styles.comingSoonCard, { backgroundColor: HOME.card, borderColor: HOME.border }]}
            onPress={() => undefined}>
            <View style={styles.comingSoonIconWrap}>
              <FontAwesome name="clock-o" size={22} color={HOME.soonPillText} />
            </View>
            <Text style={styles.comingSoonTitle}>{t('home_service_coming_soon')}</Text>
            <Text style={styles.comingSoonBody}>{t('home_service_coming_soon_body')}</Text>
            <Pressable
              onPress={() => setComingSoonVisible(false)}
              style={[styles.comingSoonBtn, { backgroundColor: HOME.accent }]}>
              <Text style={styles.comingSoonBtnText}>{t('welcome_ok')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
