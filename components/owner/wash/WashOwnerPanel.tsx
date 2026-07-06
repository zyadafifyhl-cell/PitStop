import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { OwnerHistoryPanel } from '@/components/owner/OwnerHistoryPanel';
import { OwnerProfileHeader } from '@/components/owner/OwnerProfileHeader';
import { MerchantCampaignsPanel } from '@/components/merchant/MerchantCampaignsPanel';
import { OwnerSectionCard } from '@/components/owner/OwnerSectionCard';
import { PremiumFeatureGate } from '@/components/owner/PremiumFeatureGate';
import { PremiumUpgradeModal } from '@/components/owner/PremiumUpgradeModal';
import { useMerchantOrderNotifier } from '@/components/merchant/OrderNotifier';
import { WalkInBookingModal } from '@/components/owner/wash/WalkInBookingModal';
import { OsmLocationPicker } from '@/components/maps/OsmLocationPicker';
import { getFastCurrentPosition } from '@/lib/geolocation/getFastCurrentPosition';
import { useI18n } from '@/context/I18nContext';
import { useShopAuth } from '@/context/ShopAuthContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { uploadImageToBucket } from '@/lib/supabase/storageUpload';
import { getSupabase } from '@/lib/supabase/client';
import {
  deleteCouponRemote,
  listActiveCouponsForShop,
  saveCouponForShopRemote,
  setCouponActiveRemote,
} from '@/lib/booking/couponRepository';
import { pushCustomerNotification } from '@/lib/booking/commerceEvents';
import {
  bookingStatusLabel,
  formatBookingDateTime,
  normalizeTimeHm,
  shopTypeLabel,
} from '@/lib/booking/format';
import {
  cancelBookingReminders,
  scheduleBookingReminders,
} from '@/lib/booking/bookingReminders';
import {
  formatEgp,
  toYmdLocal,
} from '@/lib/booking/reporting';
import {
  listShopReviews,
  setReviewHidden,
  setReviewOwnerReply,
  setReviewReported,
} from '@/lib/booking/reviewsStorage';
import { promptMerchantNoShowOverride } from '@/lib/booking/merchantBookingOverride';
import { listBookingsForShop, updateBookingStatus } from '@/lib/booking/storage';
import { defaultWeeklyHours } from '@/lib/booking/shopSchedule';
import { openPhone } from '@/lib/linking/contact';
import { userAlert, userConfirm } from '@/lib/ui/userAlert';
import type { Booking, BookingStatus, Shop, ShopDayHours, ShopReview, ShopService } from '@/lib/booking/types';
import { computeWashAnalytics } from '@/lib/booking/wash/washAnalytics';
import {
  getBranchWorkspaceCache,
  getShopWorkspaceCache,
  setBranchWorkspaceCache,
  setShopWorkspaceCache,
} from '@/lib/booking/wash/washBranchWorkspaceCache';
import {
  addWashBranch,
  getWashBranchState,
  saveWashBranchServices,
  saveWashBranchStatus,
  saveWashBranchWeeklyHours,
  saveBranchCoordinates,
  setActiveWashBranch,
  updateActiveWashBranch,
  type WashBranchContext,
} from '@/lib/booking/wash/washBranchStorage';
import {
  addBranchEmployeeRemote,
  listBranchEmployeesRemote,
  removeBranchEmployeeRemote,
  updateBranchRemote,
} from '@/lib/booking/wash/branchRepository';
import {
  createBranchManagerAccount,
  fetchBranchManagerRemote,
  hasAnyBranchManagerRemote,
  linkBranchManagerByEmail,
  removeBranchManagerRemote,
} from '@/lib/booking/wash/branchManagerRepository';
import { clearBranchManagerCache } from '@/lib/booking/wash/bookingDispatch';
import {
  WASH_DAY_LABELS,
  type WashAnalyticsSnapshot,
  type WashBranch,
  type WashBranchState,
  type WashCoupon,
  type WashCouponDiscountType,
  type WashShopStatus,
  type WashVacationMode,
} from '@/lib/booking/wash/types';
import type { DbBranchEmployee, DbUser } from '@/lib/supabase/database.types';
import type { ShopStaffUser } from '@/lib/shop/shopStaffUser';

const webListScrollStyle =
  Platform.OS === 'web'
    ? ({ overflowY: 'auto' as const, overflowX: 'hidden' as const } as const)
    : null;

const EDITOR_DAY_ORDER: ShopDayHours['day'][] = [1, 2, 3, 4, 5, 6, 0];
const DEFAULT_BRANCH_MAP_COORDS = { latitude: 30.0444, longitude: 31.2357 };

type Props = {
  shop: Shop;
};

type ServiceDraft = {
  id?: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  priceEgp: string;
  durationMinutes: string;
  category: ShopService['category'];
  visible: boolean;
};

type CouponDraft = {
  id?: string;
  code: string;
  discountType: WashCouponDiscountType;
  discountValue: string;
  liveDays: string;
  usageLimit: string;
  perCustomerUsageLimit: string;
  minOrderEgp: string;
  active: boolean;
};

type RejectTarget = {
  booking: Booking;
};

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function emptyServiceDraft(): ServiceDraft {
  return {
    name: '',
    nameAr: '',
    description: '',
    descriptionAr: '',
    priceEgp: '',
    durationMinutes: '30',
    category: 'exterior_wash',
    visible: true,
  };
}

function emptyCouponDraft(): CouponDraft {
  return {
    code: '',
    discountType: 'percent',
    discountValue: '10',
    liveDays: '30',
    usageLimit: '',
    perCustomerUsageLimit: '',
    minOrderEgp: '',
    active: true,
  };
}

function normalizeNumberText(value: string): string {
  return value
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 1776))
    .replace(/\u066B/g, '.')
    .replace(/\u066C/g, ',')
    .trim();
}

function serviceLabel(service: ShopService, locale: 'en' | 'ar'): string {
  return locale === 'ar' ? service.nameAr || service.name : service.name;
}

function branchDisplayName(branch: WashBranch, locale: 'en' | 'ar'): string {
  if (locale === 'ar') return branch.nameAr || branch.profileNameAr || branch.name;
  return branch.profileName || branch.name;
}

function filterBookingsForStaff(bookings: Booking[], staff: ShopStaffUser | null): Booking[] {
  if (!staff || staff.role !== 'branch_manager' || !staff.branchId) return bookings;
  return bookings.filter((booking) => booking.branchId === staff.branchId);
}

function washStatusLabelKey(status: WashShopStatus): 'wash_status_open' | 'wash_status_closed' | 'wash_status_busy' | 'wash_status_vacation' {
  if (status === 'closed') return 'wash_status_closed';
  if (status === 'busy') return 'wash_status_busy';
  if (status === 'vacation') return 'wash_status_vacation';
  return 'wash_status_open';
}

function applyBranchToForms(branch: WashBranch, setters: {
  setProfileName: (v: string) => void;
  setProfileNameAr: (v: string) => void;
  setProfileAddress: (v: string) => void;
  setProfileAddressAr: (v: string) => void;
  setProfilePhone: (v: string) => void;
  setProfileEmail: (v: string) => void;
  setMoreInfo: (v: string) => void;
  setMoreInfoAr: (v: string) => void;
  setWeeklyHours: (v: ShopDayHours[]) => void;
  setShopStatus: (v: WashShopStatus) => void;
  setVacationMode: (v: WashVacationMode) => void;
  setVacationReturnDate: (v: string) => void;
  setVacationMessage: (v: string) => void;
  setVacationMessageAr: (v: string) => void;
  setBranchLatitude: (v: number | null) => void;
  setBranchLongitude: (v: number | null) => void;
}) {
  setters.setProfileName(branch.profileName ?? branch.name);
  setters.setProfileNameAr(branch.profileNameAr ?? '');
  setters.setProfileAddress(branch.profileAddress ?? '');
  setters.setProfileAddressAr(branch.profileAddressAr ?? '');
  setters.setProfilePhone(branch.profilePhone ?? '');
  setters.setProfileEmail(branch.profileEmail ?? '');
  setters.setMoreInfo(branch.moreInfo ?? '');
  setters.setMoreInfoAr(branch.moreInfoAr ?? '');
  setters.setWeeklyHours(branch.weeklyHours?.length ? branch.weeklyHours : defaultWeeklyHours());
  setters.setShopStatus(branch.shopStatus ?? 'open');
  setters.setVacationMode(branch.vacationMode ?? { enabled: false });
  setters.setVacationReturnDate(branch.vacationMode?.returnDate ?? '');
  setters.setVacationMessage(branch.vacationMode?.customerMessage ?? '');
  setters.setVacationMessageAr(branch.vacationMode?.customerMessageAr ?? '');
  setters.setBranchLatitude(branch.latitude ?? null);
  setters.setBranchLongitude(branch.longitude ?? null);
}

export function WashOwnerPanel({ shop }: Props) {
  const theme = useAppTheme();
  const { t, locale, isRTL } = useI18n();
  const { shopStaff, staff, isOwner, isBranchManager, isPremium } = useShopAuth();
  const accountEmail = shopStaff?.email ?? staff?.email ?? shop.ownerEmail;
  const accountRoleLabel = isOwner
    ? t('wash_role_owner')
    : isBranchManager
      ? t('wash_role_branch_manager')
      : undefined;

  const branchCtx = useMemo<WashBranchContext | undefined>(
    () => (shopStaff ? { staff: shopStaff } : undefined),
    [shopStaff],
  );

  const [branchState, setBranchState] = useState<WashBranchState | null>(null);
  const [activeBranch, setActiveBranch] = useState<WashBranch | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [analytics, setAnalytics] = useState<WashAnalyticsSnapshot | null>(null);
  const [reviews, setReviews] = useState<ShopReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickingImage, setPickingImage] = useState(false);

  const [profileName, setProfileName] = useState('');
  const [profileNameAr, setProfileNameAr] = useState('');
  const [profileAddress, setProfileAddress] = useState('');
  const [profileAddressAr, setProfileAddressAr] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [moreInfo, setMoreInfo] = useState('');
  const [moreInfoAr, setMoreInfoAr] = useState('');
  const [branchLatitude, setBranchLatitude] = useState<number | null>(null);
  const [branchLongitude, setBranchLongitude] = useState<number | null>(null);
  const [capturingGps, setCapturingGps] = useState(false);
  const [mapPickerVisible, setMapPickerVisible] = useState(false);
  const [mapDraftLatitude, setMapDraftLatitude] = useState<number>(DEFAULT_BRANCH_MAP_COORDS.latitude);
  const [mapDraftLongitude, setMapDraftLongitude] = useState<number>(DEFAULT_BRANCH_MAP_COORDS.longitude);
  const [mapLocating, setMapLocating] = useState(false);

  const [weeklyHours, setWeeklyHours] = useState<ShopDayHours[]>([]);
  const [selectedHoursDay, setSelectedHoursDay] = useState<ShopDayHours['day']>(1);
  const [shopStatus, setShopStatus] = useState<WashShopStatus>('open');
  const [vacationMode, setVacationMode] = useState<WashVacationMode>({ enabled: false });
  const [vacationReturnDate, setVacationReturnDate] = useState('');
  const [vacationMessage, setVacationMessage] = useState('');
  const [vacationMessageAr, setVacationMessageAr] = useState('');

  const [addBranchModalVisible, setAddBranchModalVisible] = useState(false);
  const [premiumModalVisible, setPremiumModalVisible] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchNameAr, setNewBranchNameAr] = useState('');

  const [serviceModalVisible, setServiceModalVisible] = useState(false);
  const [serviceDraft, setServiceDraft] = useState<ServiceDraft>(emptyServiceDraft());

  const [couponModalVisible, setCouponModalVisible] = useState(false);
  const [couponDraft, setCouponDraft] = useState<CouponDraft>(emptyCouponDraft());

  const [rejectTarget, setRejectTarget] = useState<RejectTarget | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [rejectBusy, setRejectBusy] = useState(false);

  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [saveNotice, setSaveNotice] = useState<{ title: string; body: string } | null>(null);
  const [employees, setEmployees] = useState<DbBranchEmployee[]>([]);
  const [newEmployeeName, setNewEmployeeName] = useState('');
  const [newEmployeePhone, setNewEmployeePhone] = useState('');
  const [newEmployeeJobTitle, setNewEmployeeJobTitle] = useState('');
  const [employeeBusy, setEmployeeBusy] = useState(false);
  const [branchManager, setBranchManager] = useState<DbUser | null>(null);
  const [hasDedicatedBranchManager, setHasDedicatedBranchManager] = useState(false);
  const [hasAnyBranchManager, setHasAnyBranchManager] = useState(false);
  const [managerFullName, setManagerFullName] = useState('');
  const [managerEmail, setManagerEmail] = useState('');
  const [managerPassword, setManagerPassword] = useState('');
  const [managerBusy, setManagerBusy] = useState(false);
  const [managerResolved, setManagerResolved] = useState(false);
  const [pendingBranchSyncId, setPendingBranchSyncId] = useState<string | null>(null);
  const [branchMetaLoading, setBranchMetaLoading] = useState(false);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const hasHydratedWorkspaceRef = useRef(false);
  const branchStateRef = useRef<WashBranchState | null>(null);
  const pendingBranchSyncRef = useRef<string | null>(null);
  const workspaceInitInFlightRef = useRef(false);

  useEffect(() => {
    branchStateRef.current = branchState;
  }, [branchState]);

  useEffect(() => {
    pendingBranchSyncRef.current = pendingBranchSyncId;
  }, [pendingBranchSyncId]);
  const [walkInModalVisible, setWalkInModalVisible] = useState(false);
  const [panelTab, setPanelTab] = useState<'workspace' | 'history'>('workspace');
  const [adminTab, setAdminTab] = useState<'dashboard' | 'profile' | 'operations' | 'management'>('dashboard');

  const orderNotifier = useMerchantOrderNotifier({
    shopId: shop.id,
    staff: shopStaff,
    activeBranchId: activeBranch?.id,
    locale,
  });

  const formSetters = useMemo(
    () => ({
      setProfileName,
      setProfileNameAr,
      setProfileAddress,
      setProfileAddressAr,
      setProfilePhone,
      setProfileEmail,
      setMoreInfo,
      setMoreInfoAr,
      setWeeklyHours,
      setShopStatus,
      setVacationMode,
      setVacationReturnDate,
      setVacationMessage,
      setVacationMessageAr,
      setBranchLatitude,
      setBranchLongitude,
    }),
    [],
  );

  const syncBranchForms = useCallback(
    (branch: WashBranch) => {
      setActiveBranch(branch);
      applyBranchToForms(branch, formSetters);
    },
    [formSetters],
  );

  const fetchBranchManagementMeta = useCallback(
    async (branchId: string) => {
      const employeePromise = isUuid(branchId) ? listBranchEmployeesRemote(branchId) : Promise.resolve([]);
      const [employeeRows, dedicatedManagerRow, anyManagerExists] = await Promise.all([
        employeePromise,
        fetchBranchManagerRemote(branchId, shop.id),
        isOwner ? hasAnyBranchManagerRemote(shop.id) : Promise.resolve(false),
      ]);
      return {
        employees: employeeRows,
        branchManager: dedicatedManagerRow,
        hasDedicatedBranchManager: !!dedicatedManagerRow,
        hasAnyBranchManager: anyManagerExists,
      };
    },
    [isOwner, shop.id],
  );

  const applyBranchWorkspaceCache = useCallback(
    (branchId: string): boolean => {
      const cached = getBranchWorkspaceCache(shop.id, branchId);
      if (!cached) return false;

      const shopCached = getShopWorkspaceCache(shop.id);
      setBranchState((prev) => (prev ? { ...prev, activeBranchId: branchId } : prev));
      syncBranchForms(cached.branch);
      setAnalytics(cached.analytics);
      if (shopCached) {
        setBookings(shopCached.bookings);
        setReviews(shopCached.reviews);
      }
      setEmployees(cached.employees);
      setBranchManager(cached.branchManager);
      setHasDedicatedBranchManager(cached.hasDedicatedBranchManager);
      setHasAnyBranchManager(cached.hasAnyBranchManager);
      setManagerResolved(true);
      setBranchMetaLoading(false);
      return true;
    },
    [shop.id, syncBranchForms],
  );

  const refreshAll = useCallback(
    async (options?: { silent?: boolean; branchId?: string }) => {
      const silent = options?.silent ?? false;
      const targetBranchId =
        options?.branchId ?? branchStateRef.current?.activeBranchId ?? activeBranch?.id ?? undefined;
      if (!silent) setLoading(true);
      try {
        const [state, bookingRows, reviewRows, couponRows] = await Promise.all([
          getWashBranchState(shop, branchCtx, { preferredActiveBranchId: targetBranchId }),
          listBookingsForShop(shop.id),
          listShopReviews(shop.id),
          listActiveCouponsForShop(shop.id),
        ]);
        const resolvedBranchId = targetBranchId ?? state.activeBranchId;
        const branch = state.branches.find((b) => b.id === resolvedBranchId);
        if (!branch) return;

        const scopedBookings = filterBookingsForStaff(bookingRows, shopStaff);
        const branchWithCoupons = { ...branch, coupons: couponRows };
        const stateWithCoupons = {
          ...state,
          activeBranchId: resolvedBranchId,
          branches: state.branches.map((row) =>
            row.id === branch.id ? { ...row, coupons: couponRows } : row,
          ),
        };

        const stats = await computeWashAnalytics(shop.id, scopedBookings, {
          branchId: branch.id,
          branchServices: branch.services ?? [],
          locale,
          noServiceDataLabel: t('wash_analytics_no_service_data'),
        });
        const meta = await fetchBranchManagementMeta(branch.id);

        setBranchState(stateWithCoupons);
        syncBranchForms(branchWithCoupons);
        setBookings(scopedBookings);
        setReviews(reviewRows);
        setAnalytics(stats);
        setEmployees(meta.employees);
        setBranchManager(meta.branchManager);
        setHasDedicatedBranchManager(meta.hasDedicatedBranchManager);
        setHasAnyBranchManager(meta.hasAnyBranchManager);
        setManagerResolved(true);
        setBranchMetaLoading(false);

        setShopWorkspaceCache(shop.id, { bookings: scopedBookings, reviews: reviewRows });
        setBranchWorkspaceCache(shop.id, branch.id, {
          branch: branchWithCoupons,
          analytics: stats,
          employees: meta.employees,
          branchManager: meta.branchManager,
          hasDedicatedBranchManager: meta.hasDedicatedBranchManager,
          hasAnyBranchManager: meta.hasAnyBranchManager,
        });

        await orderNotifier.refresh();
        setWorkspaceReady(true);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [shop, branchCtx, shopStaff, syncBranchForms, locale, t, orderNotifier.refresh, fetchBranchManagementMeta, activeBranch?.id],
  );

  useEffect(() => {
    if (!activeBranch?.id) {
      setEmployees([]);
      setBranchManager(null);
      setHasDedicatedBranchManager(false);
      setHasAnyBranchManager(false);
      setManagerResolved(!isOwner);
      setBranchMetaLoading(false);
      return;
    }

    const cached = getBranchWorkspaceCache(shop.id, activeBranch.id);
    if (cached) {
      setEmployees(cached.employees);
      setBranchManager(cached.branchManager);
      setHasDedicatedBranchManager(cached.hasDedicatedBranchManager);
      setHasAnyBranchManager(cached.hasAnyBranchManager);
      setManagerResolved(true);
      setBranchMetaLoading(false);
      return;
    }

    let cancelled = false;
    setBranchMetaLoading(true);
    (async () => {
      try {
        const meta = await fetchBranchManagementMeta(activeBranch.id);
        if (cancelled) return;
        setEmployees(meta.employees);
        setHasDedicatedBranchManager(meta.hasDedicatedBranchManager);
        setHasAnyBranchManager(meta.hasAnyBranchManager);
        setBranchManager(meta.branchManager);
        setManagerResolved(true);
      } finally {
        if (!cancelled) setBranchMetaLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeBranch?.id, isOwner, shop.id, fetchBranchManagementMeta]);

  useFocusEffect(
    useCallback(() => {
      if (workspaceInitInFlightRef.current) return;
      workspaceInitInFlightRef.current = true;
      const branchId = branchStateRef.current?.activeBranchId;
      const hasCache = branchId ? !!getBranchWorkspaceCache(shop.id, branchId) : false;
      void refreshAll({
        silent: hasHydratedWorkspaceRef.current || hasCache,
        branchId,
      }).finally(() => {
        workspaceInitInFlightRef.current = false;
        hasHydratedWorkspaceRef.current = true;
      });
    }, [refreshAll, shop.id]),
  );

  useEffect(() => {
    if (!pendingBranchSyncId) return;
    if (
      pendingBranchSyncId === branchState?.activeBranchId &&
      pendingBranchSyncId === activeBranch?.id
    ) {
      setPendingBranchSyncId(null);
      return;
    }

    let cancelled = false;
    const branchId = pendingBranchSyncId;
    (async () => {
      try {
        const nextState = await setActiveWashBranch(shop, branchId, branchCtx);
        if (cancelled) return;
        setBranchState(nextState);
        const branch = nextState.branches.find((row) => row.id === branchId);
        if (branch) syncBranchForms(branch);
        await refreshAll({ silent: true, branchId });
      } finally {
        if (!cancelled) {
          setPendingBranchSyncId(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pendingBranchSyncId, shop, branchCtx, refreshAll, syncBranchForms]);

  const fieldStyle = [styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bgElevated }];

  const shopName =
    locale === 'ar'
      ? profileNameAr || profileName || shop.nameAr
      : profileName || shop.name;
  const coverImage = activeBranch?.imageUrls?.[0];
  const profileImage = useMemo(() => {
    const firstBranchImage = (branchState?.branches ?? []).find(
      (branch) => !!branch.profileImageUrl && branch.profileImageUrl.trim().length > 0,
    )?.profileImageUrl;
    return firstBranchImage ?? activeBranch?.profileImageUrl;
  }, [branchState?.branches, activeBranch?.profileImageUrl]);
  const displayLatitude = activeBranch?.latitude ?? branchLatitude;
  const displayLongitude = activeBranch?.longitude ?? branchLongitude;

  const selectedDayRow = useMemo(() => {
    const row = weeklyHours.find((r) => r.day === selectedHoursDay);
    if (row) return row;
    return (
      defaultWeeklyHours().find((r) => r.day === selectedHoursDay) ?? {
        day: selectedHoursDay,
        closed: false,
        openTime: '09:00',
        closeTime: '23:00',
      }
    );
  }, [weeklyHours, selectedHoursDay]);

  const maxTrend = useMemo(
    () => Math.max(1, ...(analytics?.bookingTrend.map((x) => x.count) ?? [1])),
    [analytics],
  );
  const sortedServices = useMemo(
    () => (activeBranch?.services ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder),
    [activeBranch?.services],
  );
  const visibleReviews = useMemo(
    () => reviews.filter((review) => !review.hidden),
    [reviews],
  );

  function requestPremiumUpgrade() {
    setPremiumModalVisible(true);
  }

  function onSelectBranchOrUpgrade(branchId: string) {
    if (!isPremium && branchId !== branchState?.activeBranchId) {
      requestPremiumUpgrade();
      return;
    }
    onSelectBranch(branchId);
  }

  function onAddBranchPress() {
    if (!isPremium) {
      requestPremiumUpgrade();
      return;
    }
    setAddBranchModalVisible(true);
  }

  function showNotice(title: string, body: string) {
    setSaveNotice({ title, body });
  }

  async function persistBranchCoordinates(lat: number, lng: number) {
    setBranchLatitude(lat);
    setBranchLongitude(lng);
    const { branch, remoteSaved } = await saveBranchCoordinates(shop, lat, lng, branchCtx);
    syncBranchForms(branch);
    if (remoteSaved) {
      showNotice(t('wash_branch_gps_saved_title'), t('wash_branch_gps_saved_body_synced'));
    } else {
      showNotice(t('wash_branch_gps_saved_title'), t('wash_branch_gps_saved_body_local_only'));
    }
  }

  function openBranchMapPicker() {
    const lat = displayLatitude ?? DEFAULT_BRANCH_MAP_COORDS.latitude;
    const lng = displayLongitude ?? DEFAULT_BRANCH_MAP_COORDS.longitude;
    setMapDraftLatitude(lat);
    setMapDraftLongitude(lng);
    setMapPickerVisible(true);
  }

  function useSavedBranchMapCoords() {
    const lat = displayLatitude ?? DEFAULT_BRANCH_MAP_COORDS.latitude;
    const lng = displayLongitude ?? DEFAULT_BRANCH_MAP_COORDS.longitude;
    setMapDraftLatitude(lat);
    setMapDraftLongitude(lng);
  }

  async function onDetectMapGps() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('wash_branch_gps_denied_title'), t('wash_branch_gps_denied_body'));
      return;
    }
    setMapLocating(true);
    try {
      const coords = await getFastCurrentPosition();
      setMapDraftLatitude(coords.latitude);
      setMapDraftLongitude(coords.longitude);
    } catch {
      Alert.alert(
        t('wash_branch_gps_fail_title'),
        Platform.OS === 'web' ? t('wash_branch_gps_fail_body_web') : t('wash_branch_gps_fail_body'),
      );
    } finally {
      setMapLocating(false);
    }
  }

  async function onSaveBranchMapLocation() {
    setMapPickerVisible(false);
    setCapturingGps(true);
    try {
      await persistBranchCoordinates(mapDraftLatitude, mapDraftLongitude);
    } catch {
      Alert.alert(t('wash_branch_gps_fail_title'), t('wash_branch_gps_fail_body'));
    } finally {
      setCapturingGps(false);
    }
  }

  async function onCaptureBranchGps() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('wash_branch_gps_denied_title'), t('wash_branch_gps_denied_body'));
      return;
    }
    setCapturingGps(true);
    try {
      const coords = await getFastCurrentPosition();
      await persistBranchCoordinates(coords.latitude, coords.longitude);
    } catch {
      Alert.alert(
        t('wash_branch_gps_fail_title'),
        Platform.OS === 'web' ? t('wash_branch_gps_fail_body_web') : t('wash_branch_gps_fail_body'),
      );
    } finally {
      setCapturingGps(false);
    }
  }

  function branchCoordsPatch():
    | { latitude: number; longitude: number }
    | Record<string, never> {
    if (branchLatitude == null || branchLongitude == null) return {};
    return { latitude: branchLatitude, longitude: branchLongitude };
  }

  async function onSelectBranch(branchId: string) {
    if (branchId === branchState?.activeBranchId && branchId === activeBranch?.id) return;
    if (pendingBranchSyncRef.current === branchId) return;

    const optimisticBranch = branchState?.branches.find((branch) => branch.id === branchId);
    if (optimisticBranch) {
      setBranchState((prev) =>
        prev
          ? {
              ...prev,
              activeBranchId: branchId,
            }
          : prev,
      );
    }

    const cacheHit = applyBranchWorkspaceCache(branchId);
    if (!cacheHit && optimisticBranch) {
      syncBranchForms(optimisticBranch);
      void computeWashAnalytics(shop.id, bookings, {
        branchId: optimisticBranch.id,
        branchServices: optimisticBranch.services ?? [],
        locale,
        noServiceDataLabel: t('wash_analytics_no_service_data'),
      }).then((stats) => {
        setAnalytics(stats);
      });
      if (isUuid(branchId)) {
        setBranchMetaLoading(true);
        setManagerResolved(false);
      }
    }

    setPendingBranchSyncId(branchId);
  }

  async function onAddBranch() {
    const name = newBranchName.trim();
    if (!name) {
      Alert.alert(t('wash_branch_invalid_title'), t('wash_branch_invalid_body'));
      return;
    }
    const state = await addWashBranch(
      shop,
      name,
      newBranchNameAr.trim() || undefined,
      branchCtx,
      branchLatitude != null && branchLongitude != null
        ? { latitude: branchLatitude, longitude: branchLongitude }
        : undefined,
    );
    setBranchState(state);
    const branch = state.branches.find((b) => b.id === state.activeBranchId);
    if (branch) syncBranchForms(branch);
    setNewBranchName('');
    setNewBranchNameAr('');
    setAddBranchModalVisible(false);
    showNotice(t('wash_branch_added_title'), t('wash_branch_added_body'));
  }

  async function onAddEmployee() {
    if (!activeBranch || !isUuid(activeBranch.id) || !shopStaff) return;
    const name = newEmployeeName.trim();
    if (!name) {
      Alert.alert(t('wash_employee_invalid_title'), t('wash_employee_invalid_body'));
      return;
    }
    setEmployeeBusy(true);
    try {
      const row = await addBranchEmployeeRemote({
        shopId: shop.id,
        branchId: activeBranch.id,
        fullName: name,
        phone: newEmployeePhone.trim() || undefined,
        jobTitle: newEmployeeJobTitle.trim() || undefined,
      });
      if (!row) {
        Alert.alert(t('wash_employee_save_fail_title'), t('wash_employee_save_fail_body'));
        return;
      }
      setEmployees((prev) => [...prev, row].sort((a, b) => a.full_name.localeCompare(b.full_name)));
      setNewEmployeeName('');
      setNewEmployeePhone('');
      setNewEmployeeJobTitle('');
      showNotice(t('wash_employee_added_title'), t('wash_employee_added_body'));
    } finally {
      setEmployeeBusy(false);
    }
  }

  async function onRemoveEmployee(employeeId: string) {
    const confirmed = await userConfirm(t('wash_employee_remove_title'), t('wash_employee_remove_body'), {
      confirmLabel: t('wash_employee_remove_confirm'),
      cancelLabel: t('alert_cancel'),
    });
    if (!confirmed) return;
    setEmployeeBusy(true);
    try {
      const ok = await removeBranchEmployeeRemote(employeeId);
      if (ok) {
        setEmployees((prev) => prev.filter((employee) => employee.id !== employeeId));
      } else {
        userAlert(t('wash_employee_save_fail_title'), t('wash_employee_save_fail_body'));
      }
    } finally {
      setEmployeeBusy(false);
    }
  }

  async function finishManagerSave(
    result: Awaited<ReturnType<typeof createBranchManagerAccount>>,
  ) {
    if (!activeBranch) return;
    if (!result.ok) {
      showNotice(t('wash_manager_save_fail_title'), result.message ?? t('wash_manager_save_fail_body'));
      return;
    }
    const managerRow = await fetchBranchManagerRemote(activeBranch.id, shop.id);
    setBranchManager(managerRow);
    setHasDedicatedBranchManager(true);
    clearBranchManagerCache();
    setManagerFullName('');
    setManagerEmail('');
    setManagerPassword('');
    showNotice(
      result.mode === 'linked' ? t('wash_manager_linked_title') : t('wash_manager_created_title'),
      result.mode === 'linked' ? t('wash_manager_linked_body') : t('wash_manager_created_body'),
    );
  }

  async function onLinkBranchManager() {
    if (!activeBranch || !isUuid(activeBranch.id)) return;
    if (!managerFullName.trim() || !managerEmail.trim()) {
      Alert.alert(t('wash_manager_link_invalid_title'), t('wash_manager_link_invalid_body'));
      return;
    }
    setManagerBusy(true);
    try {
      const result = await linkBranchManagerByEmail({
        email: managerEmail,
        fullName: managerFullName,
        branchId: activeBranch.id,
      });
      await finishManagerSave(result);
    } finally {
      setManagerBusy(false);
    }
  }

  async function onCreateBranchManager() {
    if (!activeBranch || !isUuid(activeBranch.id)) return;
    if (!managerFullName.trim() || !managerEmail.trim()) {
      Alert.alert(t('wash_manager_invalid_title'), t('wash_manager_invalid_body'));
      return;
    }
    setManagerBusy(true);
    try {
      const result = await createBranchManagerAccount({
        email: managerEmail,
        password: managerPassword,
        fullName: managerFullName,
        branchId: activeBranch.id,
      });
      await finishManagerSave(result);
    } finally {
      setManagerBusy(false);
    }
  }

  async function onRemoveBranchManager() {
    if (!activeBranch || !branchManager || !isUuid(activeBranch.id)) return;
    const confirmed = await userConfirm(
      t('wash_manager_remove_title'),
      t('wash_manager_remove_body'),
      {
        confirmLabel: t('wash_manager_remove_confirm'),
        cancelLabel: t('alert_cancel'),
      },
    );
    if (!confirmed) return;

    setManagerBusy(true);
    try {
      const ok = await removeBranchManagerRemote({
        shopId: shop.id,
        branchId: activeBranch.id,
        managerUserId: branchManager.id,
      });
      if (!ok) {
        userAlert(t('wash_manager_remove_fail_title'), t('wash_manager_remove_fail_body'));
        return;
      }
      setBranchManager(null);
      setHasDedicatedBranchManager(false);
      setHasAnyBranchManager(await hasAnyBranchManagerRemote(shop.id));
      clearBranchManagerCache();
      userAlert(t('wash_manager_removed_title'), t('wash_manager_removed_body'));
    } finally {
      setManagerBusy(false);
    }
  }

  async function onSaveProfile() {
    if (!profileName.trim() || !profileAddress.trim() || !profilePhone.trim()) {
      Alert.alert(t('wash_profile_invalid_title'), t('wash_profile_invalid_body'));
      return;
    }
    const { branch } = await updateActiveWashBranch(shop, {
      profileName: profileName.trim(),
      profileNameAr: profileNameAr.trim() || undefined,
      profileAddress: profileAddress.trim(),
      profileAddressAr: profileAddressAr.trim() || undefined,
      profilePhone: profilePhone.trim(),
      profileEmail: profileEmail.trim() || undefined,
      moreInfo: moreInfo.trim() || undefined,
      moreInfoAr: moreInfoAr.trim() || undefined,
      ...branchCoordsPatch(),
    }, branchCtx);
    syncBranchForms(branch);
    showNotice(t('wash_profile_saved_title'), t('wash_profile_saved_body'));
  }

  async function onSetCoverImage() {
    if (Platform.OS !== 'web') {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t('wash_image_permission_title'), t('wash_image_permission_body'));
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
      if (picked.canceled || !picked.assets?.length || !activeBranch) return;
      const asset = picked.assets[0];
      const uri = asset.uri;
      if (!uri) return;
      const uploadedUrl = await uploadImageToBucket({
        localUri: uri,
        mimeType: asset.mimeType,
        bucket: 'shop-assets',
        folderPath: `${shop.id}/branches/${activeBranch.id}/cover`,
      });
      const gallery = (activeBranch.imageUrls ?? []).slice(1).filter((url) => url !== uri);
      const { branch } = await updateActiveWashBranch(shop, {
        imageUrls: [uploadedUrl, ...gallery],
      }, branchCtx);
      syncBranchForms(branch);
    } finally {
      setPickingImage(false);
    }
  }

  async function onPickGalleryImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('wash_image_permission_title'), t('wash_image_permission_body'));
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
      if (!activeBranch) return;
      const cover = activeBranch.imageUrls?.[0];
      const gallery = (activeBranch.imageUrls ?? []).slice(1);
      const uploadedUrls: string[] = [];
      for (const asset of picked.assets) {
        if (!asset.uri) continue;
        const uploadedUrl = await uploadImageToBucket({
          localUri: asset.uri,
          mimeType: asset.mimeType,
          bucket: 'shop-gallery',
          folderPath: `${shop.id}/branches/${activeBranch.id}/gallery`,
        });
        if (uploadedUrl && uploadedUrl !== cover && !gallery.includes(uploadedUrl) && !uploadedUrls.includes(uploadedUrl)) {
          uploadedUrls.push(uploadedUrl);
        }
      }
      if (!uploadedUrls.length) return;
      const nextUrls = cover ? [cover, ...gallery, ...uploadedUrls] : [...gallery, ...uploadedUrls];
      const { branch } = await updateActiveWashBranch(shop, {
        imageUrls: nextUrls.slice(0, 8),
      }, branchCtx);
      syncBranchForms(branch);
    } finally {
      setPickingImage(false);
    }
  }

  async function onSetProfileImage() {
    if (!activeBranch) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('wash_image_permission_title'), t('wash_image_permission_body'));
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
      const siblingBranches = (branchState?.branches ?? [])
        .filter((branch) => branch.id !== activeBranch.id)
        .filter((branch) => isUuid(branch.id));
      await Promise.all(
        siblingBranches.map((branch) =>
          updateBranchRemote(branch.id, { profileImageUrl: uploadedUrl }, shop.id),
        ),
      );
      const { branch } = await updateActiveWashBranch(shop, { profileImageUrl: uploadedUrl }, branchCtx);
      setBranchState((prev) =>
        prev
          ? {
              ...prev,
              branches: prev.branches.map((branchRow) => ({ ...branchRow, profileImageUrl: uploadedUrl })),
              updatedAt: new Date().toISOString(),
            }
          : prev,
      );
      syncBranchForms(branch);
    } finally {
      setPickingImage(false);
    }
  }

  async function onRemoveGalleryImage(url: string) {
    if (!activeBranch) return;
    const cover = activeBranch.imageUrls?.[0];
    if (!cover || url === cover) return;
    const gallery = activeBranch.imageUrls.slice(1).filter((u) => u !== url);
    const { branch } = await updateActiveWashBranch(shop, {
      imageUrls: [cover, ...gallery],
    }, branchCtx);
    syncBranchForms(branch);
  }

  function openServiceEditor(service?: ShopService) {
    if (service) {
      setServiceDraft({
        id: service.id,
        name: service.name,
        nameAr: service.nameAr ?? '',
        description: service.description ?? '',
        descriptionAr: service.descriptionAr ?? '',
        priceEgp: String(service.priceEgp),
        durationMinutes: String(service.durationMinutes),
        category: service.category ?? 'exterior_wash',
        visible: service.visible !== false,
      });
    } else {
      setServiceDraft(emptyServiceDraft());
    }
    setServiceModalVisible(true);
  }

  async function onSaveService() {
    if (!activeBranch) return;
    const price = Number(serviceDraft.priceEgp);
    const duration = Number(serviceDraft.durationMinutes);
    if (!serviceDraft.name.trim() || Number.isNaN(price) || price < 0 || Number.isNaN(duration) || duration < 5) {
      Alert.alert(t('wash_service_invalid_title'), t('wash_service_invalid_body'));
      return;
    }
    const services = activeBranch.services.slice();
    if (serviceDraft.id) {
      const idx = services.findIndex((s) => s.id === serviceDraft.id);
      if (idx >= 0) {
        services[idx] = {
          ...services[idx],
          name: serviceDraft.name.trim(),
          nameAr: serviceDraft.nameAr.trim() || undefined,
          description: serviceDraft.description.trim() || undefined,
          descriptionAr: serviceDraft.descriptionAr.trim() || undefined,
          priceEgp: price,
          durationMinutes: duration,
          category: serviceDraft.category,
          visible: serviceDraft.visible,
          active: true,
        };
      }
    } else {
      const sortOrder = services.length ? Math.max(...services.map((s) => s.sortOrder)) + 1 : 0;
      services.push({
        id: newId('svc'),
        name: serviceDraft.name.trim(),
        nameAr: serviceDraft.nameAr.trim() || undefined,
        description: serviceDraft.description.trim() || undefined,
        descriptionAr: serviceDraft.descriptionAr.trim() || undefined,
        priceEgp: price,
        durationMinutes: duration,
        category: serviceDraft.category,
        visible: serviceDraft.visible,
        active: true,
        sortOrder,
      });
    }
    const branch = await saveWashBranchServices(shop, services, branchCtx);
    syncBranchForms(branch);
    setServiceModalVisible(false);
    showNotice(t('wash_service_saved_title'), t('wash_service_saved_body'));
  }

  async function onDeleteService(serviceId: string) {
    if (!activeBranch) return;
    const confirmed = await userConfirm(t('wash_service_delete_title'), t('wash_service_delete_body'), {
      confirmLabel: t('wash_service_delete_confirm'),
      cancelLabel: t('alert_cancel'),
    });
    if (!confirmed) return;
    const services = activeBranch.services.filter((s) => s.id !== serviceId);
    const branch = await saveWashBranchServices(shop, services, branchCtx);
    syncBranchForms(branch);
  }

  async function onToggleServiceVisibility(serviceId: string) {
    if (!activeBranch) return;
    const services = activeBranch.services.map((s) =>
      s.id === serviceId ? { ...s, visible: s.visible === false ? true : false } : s,
    );
    const branch = await saveWashBranchServices(shop, services, branchCtx);
    syncBranchForms(branch);
  }

  async function onMoveService(serviceId: string, direction: -1 | 1) {
    if (!activeBranch) return;
    const services = activeBranch.services.slice().sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = services.findIndex((s) => s.id === serviceId);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= services.length) return;
    const a = services[idx].sortOrder;
    services[idx].sortOrder = services[swapIdx].sortOrder;
    services[swapIdx].sortOrder = a;
    services.sort((x, y) => x.sortOrder - y.sortOrder);
    const branch = await saveWashBranchServices(shop, services, branchCtx);
    syncBranchForms(branch);
  }

  function updateDayHours(day: ShopDayHours['day'], patch: Partial<ShopDayHours>) {
    setWeeklyHours((rows) => {
      const base = rows.length ? rows : defaultWeeklyHours();
      const exists = base.some((row) => row.day === day);
      if (!exists) {
        return [...base, { day, closed: false, openTime: '09:00', closeTime: '23:00', ...patch }];
      }
      return base.map((row) => (row.day === day ? { ...row, ...patch } : row));
    });
  }

  async function onSaveWeeklyHours() {
    for (const row of weeklyHours) {
      if (row.closed) continue;
      const open = normalizeTimeHm(row.openTime ?? '');
      const close = normalizeTimeHm(row.closeTime ?? '');
      if (!open || !close) {
        Alert.alert(t('wash_hours_invalid_title'), t('wash_hours_invalid_body'));
        return;
      }
    }
    const branch = await saveWashBranchWeeklyHours(shop, weeklyHours, branchCtx);
    syncBranchForms(branch);
    showNotice(t('wash_hours_saved_title'), t('wash_hours_saved_body'));
  }

  async function onSaveShopStatus(nextStatus: WashShopStatus) {
    const nextVacation: WashVacationMode =
      nextStatus === 'vacation'
        ? {
            enabled: true,
            returnDate: vacationReturnDate || undefined,
            customerMessage: vacationMessage.trim() || undefined,
            customerMessageAr: vacationMessageAr.trim() || undefined,
          }
        : { enabled: false };
    setShopStatus(nextStatus);
    setVacationMode(nextVacation);
    const branch = await saveWashBranchStatus(shop, nextStatus, nextVacation, branchCtx);
    syncBranchForms(branch);
    showNotice(t('wash_status_saved_title'), t('wash_status_saved_body'));
  }

  async function onSaveVacationDetails() {
    const nextVacation: WashVacationMode = {
      enabled: shopStatus === 'vacation',
      returnDate: vacationReturnDate || undefined,
      customerMessage: vacationMessage.trim() || undefined,
      customerMessageAr: vacationMessageAr.trim() || undefined,
    };
    setVacationMode(nextVacation);
    const branch = await saveWashBranchStatus(shop, shopStatus, nextVacation, branchCtx);
    syncBranchForms(branch);
    showNotice(t('wash_vacation_saved_title'), t('wash_vacation_saved_body'));
  }

  function openCouponEditor(coupon?: WashCoupon) {
    if (coupon) {
      const startMs = new Date(coupon.startDate).getTime();
      const endMs = new Date(coupon.endDate).getTime();
      const derivedDays =
        Number.isNaN(startMs) || Number.isNaN(endMs)
          ? 30
          : Math.max(1, Math.ceil((endMs - startMs) / (24 * 60 * 60 * 1000)));
      setCouponDraft({
        id: coupon.id,
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: String(coupon.discountValue),
        liveDays: String(derivedDays),
        usageLimit: coupon.usageLimit != null ? String(coupon.usageLimit) : '',
        perCustomerUsageLimit:
          coupon.perCustomerUsageLimit != null ? String(coupon.perCustomerUsageLimit) : '',
        minOrderEgp: coupon.minOrderEgp != null ? String(coupon.minOrderEgp) : '',
        active: coupon.active,
      });
    } else {
      setCouponDraft(emptyCouponDraft());
    }
    setCouponModalVisible(true);
  }

  function syncActiveBranchCoupons(coupons: WashCoupon[]) {
    setActiveBranch((prev) => (prev ? { ...prev, coupons } : prev));
    setBranchState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        branches: prev.branches.map((row) =>
          row.id === prev.activeBranchId ? { ...row, coupons } : row,
        ),
      };
    });
  }

  async function reloadCouponsFromRemote() {
    const coupons = await listActiveCouponsForShop(shop.id);
    syncActiveBranchCoupons(coupons);
    return coupons;
  }

  async function onSaveCoupon() {
    if (!activeBranch) return;
    const discountValue = Number(normalizeNumberText(couponDraft.discountValue));
    const globalLimit = couponDraft.usageLimit.trim()
      ? Number.parseInt(normalizeNumberText(couponDraft.usageLimit), 10)
      : undefined;
    const perCustomerUsageLimit = couponDraft.perCustomerUsageLimit.trim()
      ? Number.parseInt(normalizeNumberText(couponDraft.perCustomerUsageLimit), 10)
      : undefined;
    const minOrderValue = couponDraft.minOrderEgp.trim()
      ? Number.parseInt(normalizeNumberText(couponDraft.minOrderEgp), 10)
      : undefined;
    const liveDays = Number.parseInt(normalizeNumberText(couponDraft.liveDays), 10);

    if (
      !couponDraft.code.trim() ||
      Number.isNaN(discountValue) ||
      discountValue <= 0 ||
      (couponDraft.discountType === 'percent' && discountValue > 100) ||
      globalLimit == null ||
      Number.isNaN(globalLimit) ||
      globalLimit <= 0 ||
      Number.isNaN(liveDays) ||
      liveDays <= 0 ||
      (perCustomerUsageLimit != null &&
        (Number.isNaN(perCustomerUsageLimit) || perCustomerUsageLimit < 1)) ||
      (minOrderValue != null && (Number.isNaN(minOrderValue) || minOrderValue < 0))
    ) {
      Alert.alert(t('wash_coupon_invalid_title'), t('wash_coupon_invalid_body'));
      return;
    }

    const saved = await saveCouponForShopRemote({
      shopId: shop.id,
      couponId: couponDraft.id,
      code: couponDraft.code,
      discountType: couponDraft.discountType,
      discountValue,
      globalLimit,
      perUserLimit: perCustomerUsageLimit,
      minValue: minOrderValue,
      liveDays,
      isActive: couponDraft.active,
    });
    if (!saved) {
      Alert.alert(t('wash_coupon_save_fail_title'), t('wash_coupon_save_fail_body'));
      return;
    }
    await reloadCouponsFromRemote();
    setCouponModalVisible(false);
    setCouponDraft(emptyCouponDraft());
    showNotice(t('wash_coupon_saved_title'), t('wash_coupon_saved_body'));
  }

  async function onToggleCoupon(couponId: string) {
    if (!activeBranch) return;
    const target = activeBranch.coupons.find((c) => c.id === couponId);
    if (!target) return;
    const ok = await setCouponActiveRemote(couponId, shop.id, !target.active);
    if (!ok) return;
    await reloadCouponsFromRemote();
  }

  async function onDeleteCoupon(couponId: string) {
    if (!activeBranch) return;
    const confirmed = await userConfirm(t('wash_coupon_delete_title'), t('wash_coupon_delete_body'), {
      confirmLabel: t('wash_coupon_delete_confirm'),
      cancelLabel: t('alert_cancel'),
    });
    if (!confirmed) return;

    const ok = await deleteCouponRemote(couponId, shop.id);
    if (!ok) return;
    syncActiveBranchCoupons(activeBranch.coupons.filter((c) => c.id !== couponId));
  }

  async function onBookingStatusChange(booking: Booking, status: BookingStatus, note?: string) {
    await updateBookingStatus(booking.id, status, booking, note ? { ownerRejectionNote: note } : undefined);
    orderNotifier.patchBookingLocally(booking.id, status);
    orderNotifier.removePendingLocally(booking.id);
    setBookings((prev) =>
      prev.map((row) =>
        row.id === booking.id ? { ...row, status, lifecycleAutoCompleted: undefined } : row,
      ),
    );
    if (status === 'confirmed') {
      await scheduleBookingReminders({
        bookingId: booking.id,
        shopId: shop.id,
        customerId: booking.customerId,
        customerPhone: booking.customerPhone,
        scheduledAt: booking.scheduledAt,
        locale,
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
    if (status === 'done') {
      await cancelBookingReminders(booking.id);
    }
    if (status === 'no_show') {
      await cancelBookingReminders(booking.id);
    }
    await refreshAll();
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

  async function submitReject() {
    if (!rejectTarget) return;
    setRejectBusy(true);
    try {
      await onBookingStatusChange(rejectTarget.booking, 'cancelled', rejectNote.trim() || undefined);
      setRejectTarget(null);
      setRejectNote('');
    } finally {
      setRejectBusy(false);
    }
  }

  async function onContactCustomer(phone: string) {
    try {
      await openPhone(phone);
    } catch {
      Alert.alert(t('wash_contact_fail_title'), t('wash_contact_fail_body'));
    }
  }

  async function onSaveReviewReply(reviewId: string) {
    const reply = replyDrafts[reviewId]?.trim();
    if (!reply) return;
    await setReviewOwnerReply(shop.id, reviewId, reply);
    const rows = await listShopReviews(shop.id);
    setReviews(rows);
    setReplyDrafts((prev) => ({ ...prev, [reviewId]: '' }));
  }

  async function onToggleReviewHidden(reviewId: string, hidden: boolean) {
    await setReviewHidden(shop.id, reviewId, hidden);
    const rows = await listShopReviews(shop.id);
    setReviews(rows);
  }

  async function onReportReview(review: ShopReview) {
    await setReviewReported(shop.id, review.id, true);
    await setReviewHidden(shop.id, review.id, true);
    if (review.customerId) {
      const supabase = getSupabase();
      if (supabase) {
        await supabase.from('notifications').insert({
          user_id: review.customerId,
          shop_id: shop.id,
          review_id: review.id,
          type: 'review_dismissed',
          title: locale === 'ar' ? 'تم حذف التقييم' : 'Review removed',
          body:
            locale === 'ar'
              ? 'تم حذف تقييمك بواسطة إدارة المغسلة لمخالفته السياسات.'
              : 'Your review was removed by the wash merchant moderation team.',
          is_read: false,
          created_at: new Date().toISOString(),
        });
      }
    }
    setReviews((prev) => prev.filter((row) => row.id !== review.id));
    showNotice(t('wash_review_reported_title'), t('wash_review_reported_body'));
  }

  function renderStatCard(label: string, value: string, accent?: boolean) {
    return (
      <View style={[styles.statCard, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
        <Text style={[styles.statValue, { color: accent ? theme.accent : theme.text }]}>{value}</Text>
        <Text style={[styles.statLabel, { color: theme.textMuted }]}>{label}</Text>
      </View>
    );
  }

  function renderBookingCard(booking: Booking, showActions: boolean) {
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
          {t('book_phone_label')}: {booking.customerPhone}
        </Text>
        <Text style={[styles.meta, { color: theme.textMuted }]}>
          {t('wash_booking_vehicle')}: {booking.carType}
          {booking.carColor ? ` · ${booking.carColor}` : ''}
        </Text>
        <Text style={[styles.meta, { color: theme.textMuted }]}>
          {t('wash_booking_service')}: {serviceName}
        </Text>
        {booking.bookingType === 'walk_in' ? (
          <Text style={[styles.meta, { color: theme.accent }]}>
            {t('walk_in_booking_badge')}
          </Text>
        ) : null}
        <Text style={[styles.meta, { color: theme.textMuted }]}>
          {t('wash_booking_price')}: {price}
        </Text>
        {booking.customerNotes ? (
          <Text style={[styles.meta, { color: theme.textMuted }]}>
            {t('wash_booking_notes')}: {booking.customerNotes}
          </Text>
        ) : null}
        {booking.ownerRejectionNote ? (
          <Text style={[styles.meta, { color: theme.danger }]}>
            {t('wash_booking_rejection_note')}: {booking.ownerRejectionNote}
          </Text>
        ) : null}
        <Text style={[styles.status, { color: theme.accent }]}>
          {bookingStatusLabel(booking.status, locale)}
        </Text>
        {showActions ? (
          <View style={styles.actions}>
            {booking.status === 'pending' ? (
              <>
                <Pressable
                  onPress={() => onBookingStatusChange(booking, 'confirmed')}
                  style={[styles.chipBtn, { backgroundColor: theme.accent, borderColor: theme.accent }]}>
                  <Text style={[styles.actionText, { color: theme.onAccent }]}>{t('wash_action_accept')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setRejectNote('');
                    setRejectTarget({ booking });
                  }}
                  style={[styles.chipBtn, { backgroundColor: theme.danger, borderColor: theme.danger }]}>
                  <Text style={styles.actionText}>{t('wash_action_reject')}</Text>
                </Pressable>
              </>
            ) : null}
            {booking.status === 'confirmed' || booking.status === 'in_progress' ? (
              <>
                <Pressable
                  onPress={() => onBookingStatusChange(booking, 'done')}
                  style={[styles.chipBtn, { backgroundColor: theme.accent, borderColor: theme.accent }]}>
                  <Text style={[styles.actionText, { color: theme.onAccent }]}>{t('wash_action_complete')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => onMerchantNoShowOverride(booking)}
                  style={[styles.chipBtn, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                  <Text style={[styles.chipBtnText, { color: theme.text }]}>{t('wash_action_no_show')}</Text>
                </Pressable>
              </>
            ) : null}
            <Pressable
              onPress={() => onContactCustomer(booking.customerPhone)}
              style={[styles.chipBtn, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
              <Text style={[styles.chipBtnText, { color: theme.text }]}>{t('wash_action_contact')}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  }

  const canUseWalkInPos =
    isBranchManager || (isOwner && managerResolved && !hasAnyBranchManager && !hasDedicatedBranchManager);
  const showCoupons = false;

  const TABS = [
    { id: 'dashboard' as const, labelKey: 'wash_tab_dashboard' as const, icon: 'dashboard' as const },
    { id: 'profile' as const, labelKey: 'wash_tab_profile' as const, icon: 'id-card-o' as const },
    { id: 'operations' as const, labelKey: 'wash_tab_operations' as const, icon: 'wrench' as const },
    { id: 'management' as const, labelKey: 'wash_tab_management' as const, icon: 'users' as const },
  ];

  if (!workspaceReady) {
    return (
      <View style={[styles.container, styles.workspaceBoot, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.accent} size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
        {adminTab === 'dashboard' && (
          <>
            <OwnerProfileHeader
              theme={theme}
              shopName={shopName}
              typeLabel={shopTypeLabel(shop.type, locale)}
              welcomeLine={t('wash_welcome_back').replace('{name}', shopName)}
              coverImage={coverImage}
              profileImage={profileImage}
              pickingImage={pickingImage}
              coverEditLabel={t('wash_manage_set_cover_image')}
              notificationsLabel={t('wash_notifications_button')}
              notificationCount={orderNotifier.pendingCount}
              accountRoleLabel={accountRoleLabel}
              accountEmail={accountEmail}
              onEditCover={onSetCoverImage}
              onEditProfile={onSetProfileImage}
              onOpenNotifications={() => router.push('/shop/wash-owner-hub?tab=orders')}
            />

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
              <OwnerHistoryPanel
                shop={shop}
                staff={shopStaff}
                variant="wash"
                mode="history"
                selectedBranchId={activeBranch?.id ?? branchState?.activeBranchId ?? 'all'}
              />
            ) : (
              <>
                {isBranchManager && activeBranch ? (
                  <View style={[styles.branchBar, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                    <View style={styles.branchSelect}>
                      <Text style={[styles.branchLabel, { color: theme.textMuted }]}>{t('wash_branch_label')}</Text>
                      <Text style={[styles.branchName, { color: theme.text }]} numberOfLines={1}>
                        {branchDisplayName(activeBranch, locale)}
                      </Text>
                      <Text style={[styles.emptyHint, { color: theme.textDim, marginTop: 6 }, isRTL && styles.textRtl]}>
                        {t('wash_branch_manager_scope_hint')}
                      </Text>
                    </View>
                  </View>
                ) : isOwner ? (
                  <View style={styles.branchTabsWrap}>
                    {!isPremium ? (
                      <Text style={[styles.emptyHint, { color: theme.textDim, marginBottom: 8 }, isRTL && styles.textRtl]}>
                        {t('premium_branch_free_hint')}
                      </Text>
                    ) : null}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.branchTabsRow}>
                      {(branchState?.branches ?? []).map((branch) => {
                        const active = branch.id === branchState?.activeBranchId;
                        return (
                          <Pressable
                            key={branch.id}
                            onPress={() => onSelectBranchOrUpgrade(branch.id)}
                            style={[
                              styles.branchTab,
                              {
                                backgroundColor: active ? theme.accent : theme.bgElevated,
                                borderColor: active ? theme.accent : theme.border,
                              },
                            ]}>
                            <Text
                              style={[styles.branchTabText, { color: active ? theme.onAccent : theme.text }]}
                              numberOfLines={1}>
                              {branchDisplayName(branch, locale)}
                            </Text>
                          </Pressable>
                        );
                      })}
                      <Pressable
                        onPress={onAddBranchPress}
                        style={[styles.branchTab, { backgroundColor: theme.card, borderColor: theme.accent, borderStyle: 'dashed' }]}>
                        <Text style={[styles.branchTabText, { color: theme.accent }]}>+ {t('wash_add_branch')}</Text>
                      </Pressable>
                    </ScrollView>
                  </View>
                ) : null}

                {loading && !analytics ? (
                  <ActivityIndicator color={theme.accent} style={{ marginVertical: 16 }} />
                ) : null}

                {/* Dashboard overview */}
                {analytics ? (
                  <OwnerSectionCard theme={theme} title={t('wash_dashboard_title')} subtitle={t('wash_dashboard_lead')}>
                    <View style={styles.statGrid}>
                      {renderStatCard(t('wash_stat_today_bookings'), String(analytics.todayBookings))}
                      {renderStatCard(t('wash_stat_pending'), String(analytics.pendingRequests), true)}
                      {isOwner && isPremium ? (
                        <>
                          {renderStatCard(t('wash_stat_monthly_revenue'), formatEgp(analytics.monthlyRevenue, locale))}
                          {renderStatCard(t('wash_stat_avg_rating'), analytics.averageRating.toFixed(1))}
                          {renderStatCard(t('wash_stat_total_customers'), String(analytics.totalCustomers))}
                          {renderStatCard(t('wash_stat_returning'), String(analytics.returningCustomers))}
                        </>
                      ) : null}
                    </View>
                  </OwnerSectionCard>
                ) : null}

                {/* Shop status */}
                <OwnerSectionCard theme={theme} title={t('wash_status_title')} subtitle={t('wash_status_lead')}>
                  <View style={styles.actions}>
                    {(['open', 'closed', 'busy', 'vacation'] as WashShopStatus[]).map((status) => (
                      <Pressable
                        key={status}
                        onPress={() => onSaveShopStatus(status)}
                        style={[
                          styles.chipBtn,
                          {
                            backgroundColor: shopStatus === status ? theme.accent : theme.bgElevated,
                            borderColor: shopStatus === status ? theme.accent : theme.border,
                          },
                        ]}>
                        <Text
                          style={[
                            styles.chipBtnText,
                            { color: shopStatus === status ? theme.onAccent : theme.text },
                          ]}>
                          {t(washStatusLabelKey(status))}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {shopStatus === 'vacation' ? (
                    <>
                      <BookingDatePicker
                        valueYmd={vacationReturnDate || toYmdLocal(new Date())}
                        onChangeYmd={setVacationReturnDate}
                        locale={locale}
                        label={t('wash_vacation_return_date')}
                        pickHint={t('book_date_pick_hint')}
                        minimumDate={new Date()}
                        borderColor={theme.border}
                        backgroundColor={theme.bgElevated}
                        textColor={theme.text}
                      />
                      <TextInput
                        placeholder={t('wash_vacation_message_placeholder')}
                        placeholderTextColor={theme.textDim}
                        value={vacationMessage}
                        onChangeText={setVacationMessage}
                        multiline
                        style={[fieldStyle, styles.noteInput]}
                      />
                      <TextInput
                        placeholder={t('wash_vacation_message_ar_placeholder')}
                        placeholderTextColor={theme.textDim}
                        value={vacationMessageAr}
                        onChangeText={setVacationMessageAr}
                        multiline
                        style={[fieldStyle, styles.noteInput]}
                      />
                      <Pressable onPress={onSaveVacationDetails} style={[styles.primaryBtn, { backgroundColor: theme.accent }]}>
                        <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>{t('wash_vacation_save')}</Text>
                      </Pressable>
                    </>
                  ) : null}
                </OwnerSectionCard>

                {/* Analytics widgets */}
                {analytics ? (
                  <OwnerSectionCard
                    theme={theme}
                    title={t('wash_analytics_title')}
                    subtitle={t(isBranchManager ? 'wash_analytics_lead_manager' : 'wash_analytics_lead')}>
                    {isOwner && isPremium ? (
                      <Text style={[styles.metaStrong, { color: theme.text }]}>
                        {t('wash_analytics_weekly_revenue')}: {formatEgp(analytics.weeklyRevenue, locale)}
                      </Text>
                    ) : null}
                    <Text style={[styles.meta, { color: theme.textMuted, marginTop: isOwner && isPremium ? 8 : 0 }]}>
                      {t('wash_analytics_peak_hour')}: {analytics.peakHourLabel}
                    </Text>
                    <Text style={[styles.meta, { color: theme.textMuted }]}>
                      {t('wash_analytics_top_service')}: {analytics.mostBookedService}
                    </Text>
                    <Text style={[styles.inlineSectionTitle, { color: theme.text, marginTop: 12 }]}>
                      {t('wash_analytics_trend_title')}
                    </Text>
                    {analytics.bookingTrend.map((point) => (
                      <View key={point.label} style={styles.trendRow}>
                        <Text style={[styles.trendLabel, { color: theme.textMuted }]}>{point.label}</Text>
                        <View style={[styles.trendBarTrack, { backgroundColor: theme.bgElevated }]}>
                          <View
                            style={[
                              styles.trendBarFill,
                              {
                                backgroundColor: theme.accent,
                                width: `${Math.round((point.count / maxTrend) * 100)}%`,
                              },
                            ]}
                          />
                        </View>
                        <Text style={[styles.trendCount, { color: theme.text }]}>{point.count}</Text>
                      </View>
                    ))}
                  </OwnerSectionCard>
                ) : null}

                {/* Orders & history shortcuts */}
                <OwnerSectionCard theme={theme} title={t('wash_hub_shortcuts_title')} subtitle={t('wash_hub_shortcuts_lead')}>
                  {canUseWalkInPos ? (
                    <Pressable
                      onPress={() => setWalkInModalVisible(true)}
                      style={[styles.walkInBtn, { backgroundColor: theme.accent, borderColor: theme.accent }]}>
                      <Text style={[styles.walkInBtnText, { color: theme.onAccent }]}>{t('walk_in_quick_button')}</Text>
                    </Pressable>
                  ) : null}
                  <View style={styles.shortcutRow}>
                    <Pressable
                      onPress={() => router.push('/shop/wash-reports')}
                      style={[styles.shortcutCard, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
                      <View style={styles.shortcutCardRow}>
                        <Text style={[styles.shortcutTitle, { color: theme.text }]}>{t('wash_hub_subtab_reports')}</Text>
                        <FontAwesome name={isRTL ? 'chevron-left' : 'chevron-right'} size={13} color={theme.textMuted} />
                      </View>
                    </Pressable>
                    <Pressable
                      onPress={() => router.push('/shop/wash-owner-hub?tab=reviews')}
                      style={[styles.shortcutCard, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
                      <View style={styles.shortcutCardRow}>
                        <Text style={[styles.shortcutTitle, { color: theme.text }]}>{t('wash_hub_subtab_reviews')}</Text>
                        <FontAwesome name={isRTL ? 'chevron-left' : 'chevron-right'} size={13} color={theme.textMuted} />
                      </View>
                    </Pressable>
                    <Pressable
                      onPress={() => router.push('/shop/wash-owner-hub?tab=queue')}
                      style={[styles.shortcutCard, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
                      <View style={styles.shortcutCardRow}>
                        <Text style={[styles.shortcutTitle, { color: theme.text }]}>{t('wash_stat_pending')}</Text>
                        <FontAwesome name={isRTL ? 'chevron-left' : 'chevron-right'} size={13} color={theme.textMuted} />
                      </View>
                    </Pressable>
                    <Pressable
                      onPress={() => router.push('/shop/wash-history')}
                      style={[styles.shortcutCard, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
                      <View style={styles.shortcutCardRow}>
                        <Text style={[styles.shortcutTitle, { color: theme.text }]}>{t('wash_hub_tab_history')}</Text>
                        <FontAwesome name={isRTL ? 'chevron-left' : 'chevron-right'} size={13} color={theme.textMuted} />
                      </View>
                    </Pressable>
                  </View>
                </OwnerSectionCard>
              </>
            )}
          </>
        )}

        {adminTab === 'profile' && (
          <>
            {/* Profile */}
            <OwnerSectionCard theme={theme} title={t('wash_profile_title')} subtitle={t('wash_profile_lead')}>
              <TextInput placeholder={t('wash_profile_name_placeholder')} placeholderTextColor={theme.textDim} value={profileName} onChangeText={setProfileName} style={fieldStyle} />
              <TextInput placeholder={t('wash_profile_name_ar_placeholder')} placeholderTextColor={theme.textDim} value={profileNameAr} onChangeText={setProfileNameAr} style={fieldStyle} />
              <TextInput placeholder={t('wash_profile_phone_placeholder')} placeholderTextColor={theme.textDim} keyboardType="phone-pad" value={profilePhone} onChangeText={setProfilePhone} style={fieldStyle} />
              <TextInput placeholder={t('wash_profile_email_placeholder')} placeholderTextColor={theme.textDim} keyboardType="email-address" autoCapitalize="none" value={profileEmail} onChangeText={setProfileEmail} style={fieldStyle} />
              <TextInput placeholder={t('wash_profile_address_placeholder')} placeholderTextColor={theme.textDim} value={profileAddress} onChangeText={setProfileAddress} style={fieldStyle} />
              <TextInput placeholder={t('wash_profile_address_ar_placeholder')} placeholderTextColor={theme.textDim} value={profileAddressAr} onChangeText={setProfileAddressAr} style={fieldStyle} />
              <TextInput placeholder={t('wash_profile_more_info_placeholder')} placeholderTextColor={theme.textDim} value={moreInfo} onChangeText={setMoreInfo} multiline style={[fieldStyle, styles.noteInput]} />
              <TextInput placeholder={t('wash_profile_more_info_ar_placeholder')} placeholderTextColor={theme.textDim} value={moreInfoAr} onChangeText={setMoreInfoAr} multiline style={[fieldStyle, styles.noteInput]} />
              <Pressable
                onPress={onCaptureBranchGps}
                disabled={capturingGps}
                style={[styles.secondaryBtn, { borderColor: theme.accent, opacity: capturingGps ? 0.65 : 1 }]}>
                <Text style={[styles.secondaryBtnText, { color: theme.accent }]}>
                  {capturingGps ? t('wash_branch_gps_capturing') : t('wash_branch_gps_button')}
                </Text>
              </Pressable>
              <Pressable
                onPress={openBranchMapPicker}
                disabled={capturingGps}
                style={[styles.secondaryBtn, { borderColor: theme.border, opacity: capturingGps ? 0.65 : 1 }]}>
                <Text style={[styles.secondaryBtnText, { color: theme.text }]}>{t('wash_branch_gps_pick_on_map')}</Text>
              </Pressable>
              {displayLatitude != null && displayLongitude != null ? (
                <View style={[styles.gpsCard, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                  <Text style={[styles.gpsCardLabel, { color: theme.textMuted }, isRTL && styles.textRtl]}>
                    {t('wash_branch_gps_coords_label')}
                  </Text>
                  <Text style={[styles.gpsCardValue, { color: theme.text }, isRTL && styles.textRtl]}>
                    {t('wash_branch_gps_coords')
                      .replace('{lat}', displayLatitude.toFixed(5))
                      .replace('{lng}', displayLongitude.toFixed(5))}
                  </Text>
                </View>
              ) : (
                <Text style={[styles.emptyHint, { color: theme.textDim }, isRTL && styles.textRtl]}>{t('wash_branch_gps_empty')}</Text>
              )}
              <Pressable onPress={onSaveProfile} style={[styles.primaryBtn, { backgroundColor: theme.accent, marginTop: 12 }]}>
                <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>{t('wash_profile_save')}</Text>
              </Pressable>
            </OwnerSectionCard>

            {/* Gallery */}
            <OwnerSectionCard theme={theme} title={t('wash_gallery_title')} subtitle={t('wash_gallery_lead')}>
              <Pressable onPress={onPickGalleryImage} disabled={pickingImage} style={[styles.secondaryBtn, { borderColor: theme.border, opacity: pickingImage ? 0.65 : 1 }]}>
                <Text style={[styles.secondaryBtnText, { color: theme.text }]}>
                  {pickingImage ? t('wash_manage_picking_image') : t('wash_manage_add_image')}
                </Text>
              </Pressable>
              {(activeBranch?.imageUrls?.length ?? 0) > 1 ? (
                <View style={styles.albumGrid}>
                  {(activeBranch?.imageUrls ?? []).slice(1).map((url) => (
                    <View key={url} style={[styles.albumTile, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                      <Image source={{ uri: url }} style={styles.albumImage} contentFit="cover" />
                      <Pressable onPress={() => onRemoveGalleryImage(url)} style={[styles.removePhotoBtn, { backgroundColor: theme.danger }]}>
                        <Text style={styles.actionText}>{t('wash_manage_remove_image')}</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={[styles.emptyHint, { color: theme.textMuted }]}>{t('wash_gallery_empty')}</Text>
              )}
            </OwnerSectionCard>
          </>
        )}

        {adminTab === 'operations' && (
          <>
            {/* Services CRUD */}
            <PremiumFeatureGate>
              <OwnerSectionCard theme={theme} title={t('wash_services_title')} subtitle={t('wash_services_lead')}>
                <Pressable onPress={() => openServiceEditor()} style={[styles.primaryBtn, { backgroundColor: theme.accent }]}>
                  <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>{t('wash_service_add')}</Text>
                </Pressable>
                {sortedServices.length === 0 ? (
                  <Text style={[styles.emptyHint, { color: theme.textMuted }]}>{t('wash_services_empty')}</Text>
                ) : (
                  sortedServices.map((service, index) => (
                    <View key={service.id} style={[styles.serviceRow, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.metaStrong, { color: theme.text }]}>
                          {serviceLabel(service, locale)}
                          {service.visible === false ? ` (${t('wash_service_hidden')})` : ''}
                        </Text>
                        <Text style={[styles.meta, { color: theme.textMuted }]}>
                          {formatEgp(service.priceEgp, locale)} · {service.durationMinutes} {t('wash_service_minutes')}
                        </Text>
                      </View>
                      <View style={styles.actions}>
                        <Pressable onPress={() => onMoveService(service.id, -1)} disabled={index === 0} style={[styles.chipBtn, { borderColor: theme.border, opacity: index === 0 ? 0.4 : 1 }]}>
                          <Text style={[styles.chipBtnText, { color: theme.text }]}>↑</Text>
                        </Pressable>
                        <Pressable onPress={() => onMoveService(service.id, 1)} disabled={index === sortedServices.length - 1} style={[styles.chipBtn, { borderColor: theme.border, opacity: index === sortedServices.length - 1 ? 0.4 : 1 }]}>
                          <Text style={[styles.chipBtnText, { color: theme.text }]}>↓</Text>
                        </Pressable>
                        <Pressable onPress={() => openServiceEditor(service)} style={[styles.chipBtn, { borderColor: theme.border }]}>
                          <Text style={[styles.chipBtnText, { color: theme.text }]}>{t('wash_service_edit')}</Text>
                        </Pressable>
                        <Pressable onPress={() => onToggleServiceVisibility(service.id)} style={[styles.chipBtn, { borderColor: theme.border }]}>
                          <Text style={[styles.chipBtnText, { color: theme.text }]}>
                            {service.visible === false ? t('wash_service_show') : t('wash_service_hide')}
                          </Text>
                        </Pressable>
                        <Pressable onPress={() => onDeleteService(service.id)} style={[styles.chipBtn, { backgroundColor: theme.danger, borderColor: theme.danger }]}>
                          <Text style={styles.actionText}>{t('wash_service_delete')}</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))
                )}
              </OwnerSectionCard>
            </PremiumFeatureGate>

            <OwnerSectionCard theme={theme} title={t('campaign_panel_title')} subtitle={t('campaign_panel_lead')}>
              <MerchantCampaignsPanel shopId={shop.id} />
            </OwnerSectionCard>

            {/* Weekly hours */}
            <OwnerSectionCard theme={theme} title={t('wash_hours_title')} subtitle={t('wash_hours_lead')}>
              <Text style={[styles.inlineSectionTitle, { color: theme.text }]}>{t('wash_hours_pick_day')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                {EDITOR_DAY_ORDER.map((day) => (
                  <Pressable
                    key={day}
                    onPress={() => setSelectedHoursDay(day)}
                    style={[
                      styles.filterChip,
                      {
                        backgroundColor: selectedHoursDay === day ? theme.accent : theme.bgElevated,
                        borderColor: selectedHoursDay === day ? theme.accent : theme.border,
                      },
                    ]}>
                    <Text style={{ color: selectedHoursDay === day ? theme.onAccent : theme.text, fontWeight: '800', fontSize: 12 }}>
                      {WASH_DAY_LABELS[day][locale === 'ar' ? 'ar' : 'en']}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              <View style={[styles.dayRow, { borderColor: theme.border }]}>
                <Text style={[styles.dayName, { color: theme.text }]}>
                  {WASH_DAY_LABELS[selectedDayRow.day][locale === 'ar' ? 'ar' : 'en']}
                </Text>
                <View style={[styles.dayToggleRow, styles.actions]}>
                  <Pressable
                    onPress={() => updateDayHours(selectedDayRow.day, { closed: false })}
                    style={[
                      styles.chipBtn,
                      styles.dayToggleBtn,
                      {
                        backgroundColor: !selectedDayRow.closed ? theme.accent : theme.bgElevated,
                        borderColor: !selectedDayRow.closed ? theme.accent : theme.border,
                      },
                    ]}>
                    <Text
                      style={[
                        styles.chipBtnText,
                        { color: !selectedDayRow.closed ? theme.onAccent : theme.text },
                      ]}>
                      {t('wash_hours_open')}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => updateDayHours(selectedDayRow.day, { closed: true })}
                    style={[
                      styles.chipBtn,
                      styles.dayToggleBtn,
                      {
                        backgroundColor: selectedDayRow.closed ? theme.danger : theme.bgElevated,
                        borderColor: selectedDayRow.closed ? theme.danger : theme.border,
                      },
                    ]}>
                    <Text style={[styles.chipBtnText, { color: selectedDayRow.closed ? '#fff' : theme.text }]}>
                      {t('wash_hours_closed')}
                    </Text>
                  </Pressable>
                </View>
                {!selectedDayRow.closed ? (
                  <>
                    <TextInput placeholder={t('wash_hours_open_time')} placeholderTextColor={theme.textDim} value={selectedDayRow.openTime ?? ''} onChangeText={(v) => updateDayHours(selectedDayRow.day, { openTime: v })} style={fieldStyle} />
                    <TextInput placeholder={t('wash_hours_close_time')} placeholderTextColor={theme.textDim} value={selectedDayRow.closeTime ?? ''} onChangeText={(v) => updateDayHours(selectedDayRow.day, { closeTime: v })} style={fieldStyle} />
                  </>
                ) : null}
              </View>
              <Pressable onPress={onSaveWeeklyHours} style={[styles.primaryBtn, { backgroundColor: theme.accent, marginTop: 12 }]}>
                <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>{t('wash_hours_save')}</Text>
              </Pressable>
            </OwnerSectionCard>

            {/* Coupons hidden by request */}
            {showCoupons ? (
              <PremiumFeatureGate>
                <OwnerSectionCard theme={theme} title={t('wash_coupons_title')} subtitle={t('wash_coupons_lead')}>
                  <Pressable onPress={() => openCouponEditor()} style={[styles.primaryBtn, { backgroundColor: theme.accent }]}>
                    <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>{t('wash_coupon_add')}</Text>
                  </Pressable>
                  {(activeBranch?.coupons ?? []).length === 0 ? (
                    <Text style={[styles.emptyHint, { color: theme.textMuted }]}>{t('wash_coupons_empty')}</Text>
                  ) : (
                    activeBranch!.coupons.map((coupon) => (
                      <View key={coupon.id} style={[styles.couponRow, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                        <Text style={[styles.metaStrong, { color: theme.text }]}>{coupon.code}</Text>
                        <Text style={[styles.meta, { color: theme.textMuted }]}>
                          {coupon.discountType === 'percent'
                            ? `${coupon.discountValue}%`
                            : formatEgp(coupon.discountValue, locale)}{' '}
                          · {coupon.startDate} → {coupon.endDate}
                        </Text>
                        <Text style={[styles.meta, { color: theme.textMuted }]}>
                          {t('wash_coupon_usage')}: {coupon.usageCount}
                          {coupon.usageLimit != null ? ` / ${coupon.usageLimit}` : ''}
                          {coupon.perCustomerUsageLimit != null
                            ? ` · /${coupon.perCustomerUsageLimit} ${locale === 'ar' ? 'لكل عميل' : 'per customer'}`
                            : ''}
                          {coupon.minOrderEgp != null ? ` · min ${formatEgp(coupon.minOrderEgp, locale)}` : ''}
                        </Text>
                        <View style={styles.actions}>
                          <Pressable onPress={() => openCouponEditor(coupon)} style={[styles.chipBtn, { borderColor: theme.border }]}>
                            <Text style={[styles.chipBtnText, { color: theme.text }]}>{t('wash_coupon_edit')}</Text>
                          </Pressable>
                          <Pressable onPress={() => onToggleCoupon(coupon.id)} style={[styles.chipBtn, { borderColor: theme.border }]}>
                            <Text style={[styles.chipBtnText, { color: coupon.active ? theme.danger : theme.accent }]}>
                              {coupon.active ? t('wash_coupon_disable') : t('wash_coupon_enable')}
                            </Text>
                          </Pressable>
                          <Pressable onPress={() => onDeleteCoupon(coupon.id)} style={[styles.chipBtn, { backgroundColor: theme.danger, borderColor: theme.danger }]}>
                            <Text style={styles.actionText}>{t('wash_coupon_delete')}</Text>
                          </Pressable>
                        </View>
                      </View>
                    ))
                  )}
                </OwnerSectionCard>
              </PremiumFeatureGate>
            ) : null}
          </>
        )}

        {adminTab === 'management' && (
          <>
            {/* Branch manager */}
            {isOwner && activeBranch && isUuid(activeBranch.id) ? (
              <PremiumFeatureGate>
                <OwnerSectionCard theme={theme} title={t('wash_manager_title')} subtitle={t('wash_manager_lead')}>
                  {branchManager ? (
                    <>
                      <View style={[styles.serviceRow, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.metaStrong, { color: theme.text }]}>
                            {branchManager.full_name || branchManager.email}
                          </Text>
                          <Text style={[styles.meta, { color: theme.textMuted }]}>{branchManager.email}</Text>
                        </View>
                        <Text style={[styles.meta, { color: theme.accent, fontWeight: '800' }]}>
                          {branchManager.role === 'owner'
                            ? t('wash_role_owner')
                            : t('wash_role_branch_manager')}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => void onRemoveBranchManager()}
                        disabled={managerBusy}
                        style={[
                          styles.secondaryBtn,
                          {
                            borderColor: theme.danger,
                            marginTop: 10,
                            opacity: managerBusy ? 0.65 : 1,
                          },
                        ]}>
                        <Text style={[styles.secondaryBtnText, { color: theme.danger }]}>
                          {t('wash_manager_remove_action')}
                        </Text>
                      </Pressable>
                    </>
                  ) : (
                    <>
                      <Text style={[styles.meta, { color: theme.textMuted, marginBottom: 4 }]}>
                        {t('wash_manager_empty')}
                      </Text>
                      <TextInput
                        placeholder={t('wash_manager_name_placeholder')}
                        placeholderTextColor={theme.textDim}
                        value={managerFullName}
                        onChangeText={setManagerFullName}
                        style={fieldStyle}
                      />
                      <TextInput
                        placeholder={t('wash_manager_email_placeholder')}
                        placeholderTextColor={theme.textDim}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        value={managerEmail}
                        onChangeText={setManagerEmail}
                        style={fieldStyle}
                      />
                      <TextInput
                        placeholder={t('wash_manager_password_placeholder')}
                        placeholderTextColor={theme.textDim}
                        secureTextEntry
                        value={managerPassword}
                        onChangeText={setManagerPassword}
                        style={fieldStyle}
                      />
                      <Text style={[styles.meta, { color: theme.textMuted, marginTop: 4 }]}>
                        {t('wash_manager_hint')}
                      </Text>
                      <Pressable
                        onPress={onLinkBranchManager}
                        disabled={managerBusy}
                        style={[styles.primaryBtn, { backgroundColor: theme.accent, opacity: managerBusy ? 0.65 : 1 }]}>
                        <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>{t('wash_manager_link')}</Text>
                      </Pressable>
                      <Pressable
                        onPress={onCreateBranchManager}
                        disabled={managerBusy}
                        style={[styles.secondaryBtn, { borderColor: theme.border, marginTop: 10, opacity: managerBusy ? 0.65 : 1 }]}>
                        <Text style={[styles.secondaryBtnText, { color: theme.text }]}>{t('wash_manager_create')}</Text>
                      </Pressable>
                    </>
                  )}
                </OwnerSectionCard>
              </PremiumFeatureGate>
            ) : null}

            {/* Branch employees */}
            {activeBranch && isUuid(activeBranch.id) ? (
              <OwnerSectionCard
                theme={theme}
                title={t('wash_employees_title')}
                subtitle={t(isBranchManager ? 'wash_employees_lead_manager' : 'wash_employees_lead')}>
                {branchMetaLoading ? (
                  <View style={styles.inlineLoadingRow}>
                    <ActivityIndicator size="small" color={theme.accent} />
                    <Text style={[styles.inlineLoadingText, { color: theme.textMuted }]}>
                      {t('wash_employees_title')}...
                    </Text>
                  </View>
                ) : null}
                <TextInput
                  placeholder={t('wash_employee_name_placeholder')}
                  placeholderTextColor={theme.textDim}
                  value={newEmployeeName}
                  onChangeText={setNewEmployeeName}
                  style={fieldStyle}
                />
                <TextInput
                  placeholder={t('wash_employee_phone_placeholder')}
                  placeholderTextColor={theme.textDim}
                  keyboardType="phone-pad"
                  value={newEmployeePhone}
                  onChangeText={setNewEmployeePhone}
                  style={fieldStyle}
                />
                <TextInput
                  placeholder={t('wash_employee_job_placeholder')}
                  placeholderTextColor={theme.textDim}
                  value={newEmployeeJobTitle}
                  onChangeText={setNewEmployeeJobTitle}
                  style={fieldStyle}
                />
                <Pressable
                  onPress={onAddEmployee}
                  disabled={employeeBusy}
                  style={[styles.primaryBtn, { backgroundColor: theme.accent, opacity: employeeBusy ? 0.65 : 1 }]}>
                  <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>{t('wash_employee_add')}</Text>
                </Pressable>
                {employees.length === 0 ? (
                  <Text style={[styles.emptyHint, { color: theme.textMuted }]}>{t('wash_employees_empty')}</Text>
                ) : (
                  employees.map((employee) => (
                    <View
                      key={employee.id}
                      style={[styles.serviceRow, styles.employeeCardRow, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                      <View style={styles.employeeMetaCol}>
                        <Text style={[styles.metaStrong, { color: theme.text }]}>{employee.full_name}</Text>
                        {employee.job_title ? (
                          <Text style={[styles.meta, { color: theme.textMuted }]}>{employee.job_title}</Text>
                        ) : null}
                        {employee.phone ? (
                          <Text style={[styles.meta, { color: theme.textMuted }]}>{employee.phone}</Text>
                        ) : null}
                      </View>
                      <Pressable
                        onPress={() => void onRemoveEmployee(employee.id)}
                        disabled={employeeBusy}
                        accessibilityRole="button"
                        accessibilityLabel={t('wash_employee_remove')}
                        style={[
                          styles.employeeRemoveBtn,
                          {
                            backgroundColor: 'rgba(239, 68, 68, 0.10)',
                            borderColor: 'rgba(239, 68, 68, 0.26)',
                            opacity: employeeBusy ? 0.7 : 1,
                          },
                        ]}>
                        <FontAwesome name="trash-o" size={14} color={theme.danger} />
                      </Pressable>
                    </View>
                  ))
                )}
              </OwnerSectionCard>
            ) : null}

            {/* Reviews */}
            <OwnerSectionCard
              theme={theme}
              title={t('wash_reviews_title')}
              subtitle={t(isBranchManager ? 'wash_reviews_lead_manager' : 'wash_reviews_lead')}>
              {visibleReviews.length === 0 ? (
                <Text style={[styles.empty, { color: theme.textMuted }]}>{t('wash_reviews_empty')}</Text>
              ) : (
                visibleReviews.map((review) => (
                    <View key={review.id} style={[styles.reviewRow, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                      <Text style={[styles.metaStrong, { color: theme.text }]}>
                        {'★'.repeat(review.rating)}{' '}
                        {review.customerName}
                      </Text>
                      <Text style={[styles.meta, { color: theme.textMuted }]}>{review.body}</Text>
                      {review.ownerReply ? (
                        <Text style={[styles.meta, { color: theme.accent }]}>
                          {t('wash_review_owner_reply')}: {review.ownerReply}
                        </Text>
                      ) : null}
                      <TextInput
                        placeholder={t('wash_review_reply_placeholder')}
                        placeholderTextColor={theme.textDim}
                        value={replyDrafts[review.id] ?? ''}
                        onChangeText={(v) => setReplyDrafts((prev) => ({ ...prev, [review.id]: v }))}
                        style={fieldStyle}
                      />
                      <View style={styles.actions}>
                        <Pressable onPress={() => onSaveReviewReply(review.id)} style={[styles.chipBtn, { backgroundColor: theme.accent, borderColor: theme.accent }]}>
                          <Text style={[styles.actionText, { color: theme.onAccent }]}>{t('wash_review_reply_save')}</Text>
                        </Pressable>
                        <Pressable onPress={() => onToggleReviewHidden(review.id, true)} style={[styles.chipBtn, { borderColor: theme.border }]}>
                          <Text style={[styles.chipBtnText, { color: theme.text }]}>{t('wash_review_hide')}</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => void onReportReview(review)}
                          style={[styles.chipBtn, { backgroundColor: theme.danger, borderColor: theme.danger }]}>
                          <Text style={styles.actionText}>{t('wash_review_report')}</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))
              )}
            </OwnerSectionCard>
          </>
        )}
      </ScrollView>

      {/* Persistent Bottom Tab Bar */}
      <View style={[styles.bottomTabBar, { backgroundColor: theme.bgElevated, borderTopColor: theme.border }]}>
        {TABS.map((tabItem) => {
          const active = adminTab === tabItem.id;
          return (
            <Pressable
              key={tabItem.id}
              onPress={() => setAdminTab(tabItem.id)}
              style={styles.bottomTabItem}>
              <FontAwesome
                name={tabItem.icon}
                size={20}
                color={active ? theme.accent : theme.textDim}
              />
              <Text
                style={[
                  styles.bottomTabLabel,
                  { color: active ? theme.accent : theme.textDim },
                ]}>
                {t(tabItem.labelKey)}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => router.push('/shop/merchant-settings')}
          style={styles.bottomTabItem}>
          <FontAwesome name="cog" size={20} color={theme.textDim} />
          <Text style={[styles.bottomTabLabel, { color: theme.textDim }]}>{t('tab_settings')}</Text>
        </Pressable>
      </View>

      <PremiumUpgradeModal visible={premiumModalVisible} onClose={() => setPremiumModalVisible(false)} />

      {activeBranch && canUseWalkInPos ? (
        <WalkInBookingModal
          visible={walkInModalVisible}
          onClose={() => setWalkInModalVisible(false)}
          shop={shop}
          branchId={activeBranch.id}
          branchLabel={branchDisplayName(activeBranch, locale)}
          services={sortedServices}
          onCreated={() => {
            void refreshAll();
          }}
        />
      ) : null}

      <Modal
        visible={mapPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMapPickerVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }, isRTL && styles.textRtl]}>
              {t('wash_branch_gps_pick_on_map')}
            </Text>
            <Text style={[styles.modalLead, { color: theme.textMuted }, isRTL && styles.textRtl]}>
              {t('wash_branch_gps_map_hint')}
            </Text>
            <View style={styles.mapDraftStatsRow}>
              <View style={[styles.mapDraftStatCard, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                <Text style={[styles.mapDraftStatLabel, { color: theme.textMuted }, isRTL && styles.textRtl]}>
                  {t('wash_branch_map_saved_pin')}
                </Text>
                <Text style={[styles.mapDraftStatValue, { color: theme.text }, isRTL && styles.textRtl]}>
                  {displayLatitude != null && displayLongitude != null
                    ? `${displayLatitude.toFixed(5)}, ${displayLongitude.toFixed(5)}`
                    : '—'}
                </Text>
              </View>
              <View style={[styles.mapDraftStatCard, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                <Text style={[styles.mapDraftStatLabel, { color: theme.textMuted }, isRTL && styles.textRtl]}>
                  {t('wash_branch_map_selected_pin')}
                </Text>
                <Text style={[styles.mapDraftStatValue, { color: theme.accent }, isRTL && styles.textRtl]}>
                  {mapDraftLatitude.toFixed(5)}, {mapDraftLongitude.toFixed(5)}
                </Text>
              </View>
            </View>
            <View style={styles.mapQuickActionsRow}>
              <Pressable
                onPress={useSavedBranchMapCoords}
                style={[styles.mapQuickBtn, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                <Text style={[styles.mapQuickBtnText, { color: theme.text }]}>{t('wash_branch_map_use_saved')}</Text>
              </Pressable>
              <Pressable
                onPress={() => void onDetectMapGps()}
                disabled={mapLocating}
                style={[styles.mapQuickBtn, { borderColor: theme.accent, backgroundColor: theme.accentSoft, opacity: mapLocating ? 0.65 : 1 }]}>
                <Text style={[styles.mapQuickBtnText, { color: theme.accent }]}>
                  {mapLocating ? t('wash_branch_gps_capturing') : t('wash_branch_map_use_device')}
                </Text>
              </Pressable>
            </View>
            <View style={[styles.mapPickerWrap, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
            <OsmLocationPicker
              initialLatitude={mapDraftLatitude}
              initialLongitude={mapDraftLongitude}
              onChange={(lat, lng) => {
                setMapDraftLatitude(lat);
                setMapDraftLongitude(lng);
              }}
              height={360}
            />
            </View>
            <Text style={[styles.modalHelp, { color: theme.textMuted }, isRTL && styles.textRtl]}>
              {t('wash_branch_gps_coords')
                .replace('{lat}', mapDraftLatitude.toFixed(5))
                .replace('{lng}', mapDraftLongitude.toFixed(5))}
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setMapPickerVisible(false)}
                style={[styles.modalBtnSecondary, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                <Text style={[styles.modalBtnSecondaryText, { color: theme.text }]}>{t('add_cancel')}</Text>
              </Pressable>
              <Pressable
                onPress={() => void onSaveBranchMapLocation()}
                style={[styles.modalBtnPrimary, { backgroundColor: theme.accent }]}>
                <Text style={[styles.modalBtnPrimaryText, { color: theme.onAccent }]}>{t('wash_branch_gps_save_map_location')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add branch modal */}
      <Modal visible={addBranchModalVisible} transparent animationType="fade" onRequestClose={() => setAddBranchModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{t('wash_branch_add_title')}</Text>
            <TextInput placeholder={t('wash_branch_name_placeholder')} placeholderTextColor={theme.textDim} value={newBranchName} onChangeText={setNewBranchName} style={fieldStyle} />
            <TextInput placeholder={t('wash_branch_name_ar_placeholder')} placeholderTextColor={theme.textDim} value={newBranchNameAr} onChangeText={setNewBranchNameAr} style={fieldStyle} />
            <Pressable
              onPress={onCaptureBranchGps}
              disabled={capturingGps}
              style={[styles.secondaryBtn, { borderColor: theme.accent, marginTop: 8, opacity: capturingGps ? 0.65 : 1 }]}>
              <Text style={[styles.secondaryBtnText, { color: theme.accent }]}>
                {capturingGps ? t('wash_branch_gps_capturing') : t('wash_branch_gps_button')}
              </Text>
            </Pressable>
            {branchLatitude != null && branchLongitude != null ? (
              <Text style={[styles.meta, { color: theme.textMuted, marginTop: 8 }]}>
                {t('wash_branch_gps_coords')
                  .replace('{lat}', branchLatitude.toFixed(5))
                  .replace('{lng}', branchLongitude.toFixed(5))}
              </Text>
            ) : null}
            <View style={styles.modalActions}>
              <Pressable onPress={() => setAddBranchModalVisible(false)} style={[styles.modalBtnSecondary, { borderColor: theme.border }]}>
                <Text style={[styles.modalBtnSecondaryText, { color: theme.text }]}>{t('alert_cancel')}</Text>
              </Pressable>
              <Pressable onPress={onAddBranch} style={[styles.modalBtnPrimary, { backgroundColor: theme.accent }]}>
                <Text style={[styles.modalBtnPrimaryText, { color: theme.onAccent }]}>{t('wash_branch_add_confirm')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Service editor modal */}
      <Modal visible={serviceModalVisible} transparent animationType="fade" onRequestClose={() => setServiceModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <ScrollView contentContainerStyle={styles.modalScrollOuter}>
            <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {serviceDraft.id ? t('wash_service_edit_title') : t('wash_service_add_title')}
              </Text>
              <TextInput placeholder={t('wash_service_name_placeholder')} placeholderTextColor={theme.textDim} value={serviceDraft.name} onChangeText={(v) => setServiceDraft((d) => ({ ...d, name: v }))} style={fieldStyle} />
              <TextInput placeholder={t('wash_service_name_ar_placeholder')} placeholderTextColor={theme.textDim} value={serviceDraft.nameAr} onChangeText={(v) => setServiceDraft((d) => ({ ...d, nameAr: v }))} style={fieldStyle} />
              <TextInput placeholder={t('wash_service_desc_placeholder')} placeholderTextColor={theme.textDim} value={serviceDraft.description} onChangeText={(v) => setServiceDraft((d) => ({ ...d, description: v }))} multiline style={[fieldStyle, styles.noteInput]} />
              <TextInput placeholder={t('wash_service_desc_ar_placeholder')} placeholderTextColor={theme.textDim} value={serviceDraft.descriptionAr} onChangeText={(v) => setServiceDraft((d) => ({ ...d, descriptionAr: v }))} multiline style={[fieldStyle, styles.noteInput]} />
              <TextInput placeholder={t('wash_service_price_placeholder')} placeholderTextColor={theme.textDim} keyboardType="numeric" value={serviceDraft.priceEgp} onChangeText={(v) => setServiceDraft((d) => ({ ...d, priceEgp: v }))} style={fieldStyle} />
              <Text style={[styles.inlineSectionTitle, { color: theme.text }]}>{t('wash_service_duration_picker_label')}</Text>
              <View style={styles.actions}>
                {[10, 15, 20, 30, 45, 60, 90, 120].map((minutes) => (
                  <Pressable
                    key={minutes}
                    onPress={() => setServiceDraft((d) => ({ ...d, durationMinutes: String(minutes) }))}
                    style={[
                      styles.chipBtn,
                      {
                        backgroundColor:
                          Number(serviceDraft.durationMinutes) === minutes ? theme.accent : theme.bgElevated,
                        borderColor:
                          Number(serviceDraft.durationMinutes) === minutes ? theme.accent : theme.border,
                        minWidth: '23%',
                        alignItems: 'center',
                      },
                    ]}>
                    <Text
                      style={[
                        styles.chipBtnText,
                        {
                          color: Number(serviceDraft.durationMinutes) === minutes ? theme.onAccent : theme.text,
                        },
                      ]}>
                      {minutes} {locale === 'ar' ? 'د' : 'min'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={[styles.modalActions, styles.serviceModalActions]}>
                <Pressable onPress={() => setServiceModalVisible(false)} style={[styles.modalBtnSecondary, { borderColor: theme.border }]}>
                  <Text style={[styles.modalBtnSecondaryText, { color: theme.text }]}>{t('alert_cancel')}</Text>
                </Pressable>
                <Pressable onPress={onSaveService} style={[styles.modalBtnPrimary, { backgroundColor: theme.accent }]}>
                  <Text style={[styles.modalBtnPrimaryText, { color: theme.onAccent }]}>{t('wash_service_save')}</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Coupon editor modal */}
      <Modal visible={showCoupons && couponModalVisible} transparent animationType="fade" onRequestClose={() => setCouponModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <ScrollView contentContainerStyle={styles.modalScrollOuter}>
            <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {couponDraft.id ? t('wash_coupon_edit_title') : t('wash_coupon_add_title')}
              </Text>
              <TextInput placeholder={t('wash_coupon_code_placeholder')} placeholderTextColor={theme.textDim} autoCapitalize="characters" value={couponDraft.code} onChangeText={(v) => setCouponDraft((d) => ({ ...d, code: v }))} style={fieldStyle} />
              <View style={styles.actions}>
                {(['percent', 'fixed'] as WashCouponDiscountType[]).map((type) => (
                  <Pressable
                    key={type}
                    onPress={() => setCouponDraft((d) => ({ ...d, discountType: type }))}
                    style={[styles.chipBtn, { backgroundColor: couponDraft.discountType === type ? theme.accent : theme.bgElevated, borderColor: couponDraft.discountType === type ? theme.accent : theme.border }]}>
                    <Text style={[styles.chipBtnText, { color: couponDraft.discountType === type ? theme.onAccent : theme.text }]}>
                      {t(type === 'percent' ? 'wash_coupon_type_percent' : 'wash_coupon_type_fixed')}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <TextInput placeholder={t('wash_coupon_value_placeholder')} placeholderTextColor={theme.textDim} keyboardType="numeric" value={couponDraft.discountValue} onChangeText={(v) => setCouponDraft((d) => ({ ...d, discountValue: v }))} style={fieldStyle} />
              <Text style={[styles.couponFieldLabel, { color: theme.textMuted }, isRTL && styles.textRtl]}>
                {t('wash_coupon_live_days_label')}
              </Text>
              <TextInput
                placeholder={t('wash_coupon_live_days_placeholder')}
                placeholderTextColor={theme.textDim}
                keyboardType="numeric"
                value={couponDraft.liveDays}
                onChangeText={(v) => setCouponDraft((d) => ({ ...d, liveDays: v }))}
                style={fieldStyle}
              />
              <Text style={[styles.couponFieldLabel, { color: theme.textMuted }, isRTL && styles.textRtl]}>
                {t('wash_coupon_global_limit_label')}
              </Text>
              <TextInput
                placeholder={t('wash_coupon_global_limit_placeholder')}
                placeholderTextColor={theme.textDim}
                keyboardType="numeric"
                value={couponDraft.usageLimit}
                onChangeText={(v) => setCouponDraft((d) => ({ ...d, usageLimit: v }))}
                style={fieldStyle}
              />
              <Text style={[styles.couponFieldLabel, { color: theme.textMuted }, isRTL && styles.textRtl]}>
                {t('wash_coupon_per_user_limit_label')}
              </Text>
              <TextInput
                placeholder={t('wash_coupon_per_user_limit_placeholder')}
                placeholderTextColor={theme.textDim}
                keyboardType="numeric"
                value={couponDraft.perCustomerUsageLimit}
                onChangeText={(v) => setCouponDraft((d) => ({ ...d, perCustomerUsageLimit: v }))}
                style={fieldStyle}
              />
              <Text style={[styles.couponFieldLabel, { color: theme.textMuted }, isRTL && styles.textRtl]}>
                {t('wash_coupon_min_value_label')}
              </Text>
              <TextInput
                placeholder={t('wash_coupon_min_value_placeholder')}
                placeholderTextColor={theme.textDim}
                keyboardType="numeric"
                value={couponDraft.minOrderEgp}
                onChangeText={(v) => setCouponDraft((d) => ({ ...d, minOrderEgp: v }))}
                style={fieldStyle}
              />
              <View style={[styles.modalActions, styles.couponModalActions]}>
                <Pressable onPress={() => setCouponModalVisible(false)} style={[styles.modalBtnSecondary, { borderColor: theme.border }]}>
                  <Text style={[styles.modalBtnSecondaryText, { color: theme.text }]}>{t('alert_cancel')}</Text>
                </Pressable>
                <Pressable onPress={onSaveCoupon} style={[styles.modalBtnPrimary, { backgroundColor: theme.accent }]}>
                  <Text style={[styles.modalBtnPrimaryText, { color: theme.onAccent }]}>{t('wash_coupon_save')}</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Save notice */}
      <Modal visible={!!saveNotice} transparent animationType="fade" onRequestClose={() => setSaveNotice(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{saveNotice?.title}</Text>
            <Text style={[styles.meta, { color: theme.textMuted }]}>{saveNotice?.body}</Text>
            <Pressable onPress={() => setSaveNotice(null)} style={[styles.primaryBtn, { backgroundColor: theme.accent, marginTop: 16 }]}>
              <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>{t('welcome_ok')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  page: { padding: 16, paddingBottom: 40 },
  branchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    gap: 10,
  },
  branchSelect: { flex: 1 },
  branchLabel: { fontSize: 11, fontWeight: '700', marginBottom: 2 },
  branchName: { fontSize: 16, fontWeight: '900' },
  addBranchBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  addBranchText: { fontSize: 13, fontWeight: '800' },
  branchTabsWrap: { marginBottom: 12 },
  branchTabsRow: { gap: 8, paddingVertical: 4 },
  inlineLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  inlineLoadingText: { fontSize: 12, fontWeight: '600' },
  branchTab: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: 180,
  },
  branchTabText: { fontSize: 13, fontWeight: '800' },
  roleBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 12,
  },
  roleBadgeText: { fontSize: 12, fontWeight: '800' },
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
  walkInBtn: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  walkInBtnText: { fontSize: 14, fontWeight: '800', textAlign: 'center' },
  shortcutRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  shortcutCard: {
    flexGrow: 1,
    minWidth: '30%',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  shortcutCardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  shortcutTitle: { flex: 1, fontSize: 14, fontWeight: '800' },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statCard: {
    width: '47%',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  statValue: { fontSize: 20, fontWeight: '900' },
  statLabel: { fontSize: 12, marginTop: 4, lineHeight: 16 },
  inlineSectionTitle: { fontSize: 14, fontWeight: '800', marginTop: 14, marginBottom: 8 },
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
  noteInput: { minHeight: 88, textAlignVertical: 'top' },
  albumGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  albumTile: {
    width: '47%',
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  albumImage: { width: '100%', height: 120 },
  removePhotoBtn: { paddingVertical: 8, alignItems: 'center' },
  emptyHint: { fontSize: 13, lineHeight: 19, marginTop: 10 },
  textRtl: {
    writingDirection: 'rtl',
    textAlign: 'right',
  },
  gpsCard: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
    gap: 4,
  },
  gpsCardLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  gpsCardValue: {
    fontSize: 14,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  empty: { textAlign: 'center', marginTop: 8 },
  serviceRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  couponRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  dayRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  dayName: { fontSize: 15, fontWeight: '800', marginBottom: 4 },
  dayToggleRow: { marginBottom: 4 },
  dayToggleBtn: { flex: 1, alignItems: 'center' },
  reviewRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
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
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chipBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  chipBtnText: { fontSize: 13, fontWeight: '800' },
  actionText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  filterRow: { gap: 8, paddingVertical: 8 },
  filterChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  trendLabel: { width: 36, fontSize: 12, fontWeight: '700' },
  trendBarTrack: { flex: 1, height: 10, borderRadius: 5, overflow: 'hidden' },
  trendBarFill: { height: '100%', borderRadius: 5, minWidth: 4 },
  trendCount: { width: 24, fontSize: 12, fontWeight: '800', textAlign: 'right' },
  customRangeWrap: { marginTop: 6 },
  lastDaysRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  lastDaysInput: { flex: 1, minWidth: 120, marginTop: 0 },
  reportSummary: { marginTop: 12, fontSize: 13, lineHeight: 19 },
  reportMoney: { marginTop: 6, fontSize: 13, lineHeight: 19, fontWeight: '800' },
  historyScroll: { maxHeight: 280, marginTop: 12 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '85%',
    borderWidth: 1,
    borderRadius: 18,
    padding: 20,
  },
  modalScrollOuter: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: '900', marginBottom: 8 },
  modalLead: { fontSize: 13, lineHeight: 19, marginBottom: 10 },
  modalHelp: { fontSize: 12, lineHeight: 18, marginTop: 10 },
  mapDraftStatsRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  mapDraftStatCard: { flex: 1, borderWidth: 1, borderRadius: 10, padding: 10 },
  mapDraftStatLabel: { fontSize: 11, fontWeight: '700', marginBottom: 4 },
  mapDraftStatValue: { fontSize: 12, fontWeight: '800' },
  mapQuickActionsRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  mapQuickBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapQuickBtnText: { fontSize: 12, fontWeight: '800' },
  mapPickerWrap: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 6,
    overflow: 'hidden',
  },
  modalScroll: { maxHeight: 320 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  couponModalActions: { gap: 12, width: '100%' },
  serviceModalActions: {
    marginTop: 18,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(148,163,184,0.35)',
  },
  couponFieldLabel: { fontSize: 12, fontWeight: '700', marginTop: 4, marginBottom: 6 },
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
  employeeCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  employeeMetaCol: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  employeeRemoveBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  branchOption: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
  },
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
  container: {
    flex: 1,
  },
  workspaceBoot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 90,
  },
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
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
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
