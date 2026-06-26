import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React, { createElement, useCallback, useEffect, useMemo, useState } from 'react';
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
import { useShopAuth } from '@/context/ShopAuthContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
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
  buildOwnerReportHtml,
  filterBookingsByRange,
  formatEgp,
  formatRangeLabel,
  normalizeBookingMoney,
  resolveCustomRange,
  resolveLastNDaysRange,
  toYmdLocal,
} from '@/lib/booking/reporting';
import {
  listShopReviews,
  seedDemoReviews,
  setReviewHidden,
  setReviewOwnerReply,
  setReviewReported,
} from '@/lib/booking/reviewsStorage';
import { listBookingsForShop, updateBookingStatus } from '@/lib/booking/storage';
import { defaultWeeklyHours } from '@/lib/booking/shopSchedule';
import { openPhone } from '@/lib/linking/contact';
import type { Booking, BookingStatus, Shop, ShopDayHours, ShopReview, ShopService } from '@/lib/booking/types';
import { computeWashAnalytics } from '@/lib/booking/wash/washAnalytics';
import {
  addWashBranch,
  getActiveWashBranch,
  getWashBranchState,
  saveWashBranchCoupons,
  saveWashBranchServices,
  saveWashBranchStatus,
  saveWashBranchWeeklyHours,
  setActiveWashBranch,
  updateActiveWashBranch,
  type WashBranchContext,
} from '@/lib/booking/wash/washBranchStorage';
import {
  addBranchEmployeeRemote,
  listBranchEmployeesRemote,
  removeBranchEmployeeRemote,
} from '@/lib/booking/wash/branchRepository';
import {
  createBranchManagerAccount,
  fetchBranchManagerRemote,
  linkBranchManagerByEmail,
} from '@/lib/booking/wash/branchManagerRepository';
import { countUnreadWashNotifications } from '@/lib/booking/wash/washNotificationCenter';
import {
  WASH_DAY_LABELS,
  WASH_SERVICE_CATEGORIES,
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

type Props = {
  shop: Shop;
  onLogout: () => Promise<void>;
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
  startDate: string;
  endDate: string;
  usageLimit: string;
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
  const today = toYmdLocal(new Date());
  const end = new Date();
  end.setDate(end.getDate() + 30);
  return {
    code: '',
    discountType: 'percent',
    discountValue: '10',
    startDate: today,
    endDate: toYmdLocal(end),
    usageLimit: '',
    minOrderEgp: '',
    active: true,
  };
}

function serviceLabel(service: ShopService, locale: 'en' | 'ar'): string {
  return locale === 'ar' ? service.nameAr || service.name : service.name;
}

function categoryLabel(category: ShopService['category'], locale: 'en' | 'ar'): string {
  const row = WASH_SERVICE_CATEGORIES.find((c) => c.id === category);
  if (!row) return category ?? '—';
  return locale === 'ar' ? row.ar : row.en;
}

function branchDisplayName(branch: WashBranch, locale: 'en' | 'ar'): string {
  if (locale === 'ar') return branch.nameAr || branch.profileNameAr || branch.name;
  return branch.profileName || branch.name;
}

function filterBookingsForStaff(bookings: Booking[], staff: ShopStaffUser | null): Booking[] {
  if (!staff || staff.role !== 'branch_manager' || !staff.branchId) return bookings;
  return bookings.filter((booking) => !booking.branchId || booking.branchId === staff.branchId);
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
  setBasePrice: (v: string) => void;
  setWeeklyHours: (v: ShopDayHours[]) => void;
  setShopStatus: (v: WashShopStatus) => void;
  setVacationMode: (v: WashVacationMode) => void;
  setVacationReturnDate: (v: string) => void;
  setVacationMessage: (v: string) => void;
  setVacationMessageAr: (v: string) => void;
}) {
  setters.setProfileName(branch.profileName ?? branch.name);
  setters.setProfileNameAr(branch.profileNameAr ?? branch.nameAr ?? '');
  setters.setProfileAddress(branch.profileAddress ?? '');
  setters.setProfileAddressAr(branch.profileAddressAr ?? '');
  setters.setProfilePhone(branch.profilePhone ?? '');
  setters.setProfileEmail(branch.profileEmail ?? '');
  setters.setMoreInfo(branch.moreInfo ?? '');
  setters.setMoreInfoAr(branch.moreInfoAr ?? '');
  setters.setBasePrice(branch.servicePriceEgp != null ? String(branch.servicePriceEgp) : '');
  setters.setWeeklyHours(branch.weeklyHours?.length ? branch.weeklyHours : defaultWeeklyHours());
  setters.setShopStatus(branch.shopStatus ?? 'open');
  setters.setVacationMode(branch.vacationMode ?? { enabled: false });
  setters.setVacationReturnDate(branch.vacationMode?.returnDate ?? '');
  setters.setVacationMessage(branch.vacationMode?.customerMessage ?? '');
  setters.setVacationMessageAr(branch.vacationMode?.customerMessageAr ?? '');
}

export function WashOwnerPanel({ shop, onLogout }: Props) {
  const theme = useAppTheme();
  const { t, locale } = useI18n();
  const { staff, isOwner, isBranchManager } = useShopAuth();

  const branchCtx = useMemo<WashBranchContext | undefined>(
    () => (staff ? { staff } : undefined),
    [staff],
  );

  const [branchState, setBranchState] = useState<WashBranchState | null>(null);
  const [activeBranch, setActiveBranch] = useState<WashBranch | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [analytics, setAnalytics] = useState<WashAnalyticsSnapshot | null>(null);
  const [reviews, setReviews] = useState<ShopReview[]>([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
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
  const [basePrice, setBasePrice] = useState('');

  const [weeklyHours, setWeeklyHours] = useState<ShopDayHours[]>([]);
  const [selectedHoursDay, setSelectedHoursDay] = useState<ShopDayHours['day']>(1);
  const [shopStatus, setShopStatus] = useState<WashShopStatus>('open');
  const [vacationMode, setVacationMode] = useState<WashVacationMode>({ enabled: false });
  const [vacationReturnDate, setVacationReturnDate] = useState('');
  const [vacationMessage, setVacationMessage] = useState('');
  const [vacationMessageAr, setVacationMessageAr] = useState('');

  const [reportStartYmd, setReportStartYmd] = useState(() => {
    const start = new Date();
    start.setDate(start.getDate() - 29);
    return toYmdLocal(start);
  });
  const [reportEndYmd, setReportEndYmd] = useState(() => toYmdLocal(new Date()));
  const [lastDaysInput, setLastDaysInput] = useState('30');
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [reportPreviewHtml, setReportPreviewHtml] = useState<string | null>(null);
  const [addBranchModalVisible, setAddBranchModalVisible] = useState(false);
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
  const [managerFullName, setManagerFullName] = useState('');
  const [managerEmail, setManagerEmail] = useState('');
  const [managerPassword, setManagerPassword] = useState('');
  const [managerBusy, setManagerBusy] = useState(false);

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
      setBasePrice,
      setWeeklyHours,
      setShopStatus,
      setVacationMode,
      setVacationReturnDate,
      setVacationMessage,
      setVacationMessageAr,
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

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      const [state, branch, bookingRows, reviewRows, unread] = await Promise.all([
        getWashBranchState(shop, branchCtx),
        getActiveWashBranch(shop, branchCtx),
        listBookingsForShop(shop.id),
        listShopReviews(shop.id),
        countUnreadWashNotifications(shop.id),
      ]);
      const scopedBookings = filterBookingsForStaff(bookingRows, staff);
      setBranchState(state);
      syncBranchForms(branch);
      setBookings(scopedBookings);
      setReviews(reviewRows.length ? reviewRows : seedDemoReviews(shop.id));
      setUnreadNotifCount(unread);
      const stats = await computeWashAnalytics(shop.id, scopedBookings);
      setAnalytics(stats);
    } finally {
      setLoading(false);
    }
  }, [shop, branchCtx, staff, syncBranchForms]);

  useEffect(() => {
    if (!activeBranch || !isUuid(activeBranch.id)) {
      setEmployees([]);
      setBranchManager(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const [employeeRows, managerRow] = await Promise.all([
        listBranchEmployeesRemote(activeBranch.id),
        isOwner ? fetchBranchManagerRemote(activeBranch.id) : Promise.resolve(null),
      ]);
      if (cancelled) return;
      setEmployees(employeeRows);
      setBranchManager(managerRow);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeBranch?.id, isOwner]);

  useFocusEffect(
    useCallback(() => {
      refreshAll();
    }, [refreshAll]),
  );

  const fieldStyle = [styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bgElevated }];

  const shopName =
    locale === 'ar'
      ? profileNameAr || profileName || shop.nameAr
      : profileName || shop.name;
  const coverImage = activeBranch?.imageUrls?.[0];
  const profileImage = activeBranch?.profileImageUrl;

  const reportRange = useMemo(
    () => resolveCustomRange(reportStartYmd, reportEndYmd),
    [reportStartYmd, reportEndYmd],
  );
  const reportBookings = useMemo(() => {
    if (!reportRange) return [];
    return filterBookingsByRange(bookings, reportRange);
  }, [bookings, reportRange]);
  const financialTotals = useMemo(
    () =>
      reportBookings.reduce(
        (acc, booking) => {
          const money = normalizeBookingMoney(booking);
          acc.gross += money.servicePriceEgp;
          acc.fee += money.platformFeeEgp;
          acc.net += money.ownerNetEgp;
          return acc;
        },
        { gross: 0, fee: 0, net: 0 },
      ),
    [reportBookings],
  );

  const pendingOrderCount = useMemo(
    () => bookings.filter((b) => b.status === 'pending' || b.status === 'confirmed' || b.status === 'in_progress').length,
    [bookings],
  );

  const historyCount = useMemo(
    () => bookings.filter((b) => b.status === 'done' || b.status === 'cancelled' || b.status === 'no_show').length,
    [bookings],
  );

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

  function showNotice(title: string, body: string) {
    setSaveNotice({ title, body });
  }

  async function onSelectBranch(branchId: string) {
    if (branchId === branchState?.activeBranchId) return;
    const state = await setActiveWashBranch(shop, branchId, branchCtx);
    setBranchState(state);
    const branch = state.branches.find((b) => b.id === branchId);
    if (branch) syncBranchForms(branch);
  }

  async function onAddBranch() {
    const name = newBranchName.trim();
    if (!name) {
      Alert.alert(t('wash_branch_invalid_title'), t('wash_branch_invalid_body'));
      return;
    }
    const state = await addWashBranch(shop, name, newBranchNameAr.trim() || undefined, branchCtx);
    setBranchState(state);
    const branch = state.branches.find((b) => b.id === state.activeBranchId);
    if (branch) syncBranchForms(branch);
    setNewBranchName('');
    setNewBranchNameAr('');
    setAddBranchModalVisible(false);
    showNotice(t('wash_branch_added_title'), t('wash_branch_added_body'));
  }

  async function onAddEmployee() {
    if (!activeBranch || !isUuid(activeBranch.id) || !staff) return;
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
    Alert.alert(t('wash_employee_remove_title'), t('wash_employee_remove_body'), [
      { text: t('alert_cancel'), style: 'cancel' },
      {
        text: t('wash_employee_remove_confirm'),
        style: 'destructive',
        onPress: async () => {
          setEmployeeBusy(true);
          try {
            const ok = await removeBranchEmployeeRemote(employeeId);
            if (ok) setEmployees((prev) => prev.filter((employee) => employee.id !== employeeId));
          } finally {
            setEmployeeBusy(false);
          }
        },
      },
    ]);
  }

  async function finishManagerSave(
    result: Awaited<ReturnType<typeof createBranchManagerAccount>>,
  ) {
    if (!activeBranch) return;
    if (!result.ok) {
      showNotice(t('wash_manager_save_fail_title'), result.message ?? t('wash_manager_save_fail_body'));
      return;
    }
    const managerRow = await fetchBranchManagerRemote(activeBranch.id);
    setBranchManager(managerRow);
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

  async function onSaveProfile() {
    if (!profileName.trim() || !profileAddress.trim() || !profilePhone.trim()) {
      Alert.alert(t('wash_profile_invalid_title'), t('wash_profile_invalid_body'));
      return;
    }
    const branch = await updateActiveWashBranch(shop, {
      profileName: profileName.trim(),
      profileNameAr: profileNameAr.trim() || undefined,
      profileAddress: profileAddress.trim(),
      profileAddressAr: profileAddressAr.trim() || undefined,
      profilePhone: profilePhone.trim(),
      profileEmail: profileEmail.trim() || undefined,
      moreInfo: moreInfo.trim() || undefined,
      moreInfoAr: moreInfoAr.trim() || undefined,
    }, branchCtx);
    syncBranchForms(branch);
    showNotice(t('wash_profile_saved_title'), t('wash_profile_saved_body'));
  }

  async function onSaveBasePrice() {
    const price = Number(basePrice);
    if (Number.isNaN(price) || price < 0) {
      showNotice(t('wash_price_invalid_title'), t('wash_price_invalid_body'));
      return;
    }
    const branch = await updateActiveWashBranch(shop, { servicePriceEgp: price }, branchCtx);
    syncBranchForms(branch);
    showNotice(t('wash_price_saved_title'), t('wash_price_saved_body'));
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
        allowsEditing: true,
        quality: 0.8,
      });
      if (picked.canceled || !picked.assets?.length) return;
      const uri = picked.assets[0].uri;
      if (!uri || !activeBranch) return;
      const branch = await updateActiveWashBranch(shop, {
        imageUrls: [...(activeBranch.imageUrls ?? []), uri],
      }, branchCtx);
      syncBranchForms(branch);
    } finally {
      setPickingImage(false);
    }
  }

  async function onSetProfileImage() {
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
      const uri = picked.assets[0].uri;
      if (!uri) return;
      const branch = await updateActiveWashBranch(shop, { profileImageUrl: uri }, branchCtx);
      syncBranchForms(branch);
    } finally {
      setPickingImage(false);
    }
  }

  async function onRemoveGalleryImage(url: string) {
    if (!activeBranch) return;
    const branch = await updateActiveWashBranch(shop, {
      imageUrls: activeBranch.imageUrls.filter((u) => u !== url),
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
    Alert.alert(t('wash_service_delete_title'), t('wash_service_delete_body'), [
      { text: t('alert_cancel'), style: 'cancel' },
      {
        text: t('wash_service_delete_confirm'),
        style: 'destructive',
        onPress: async () => {
          const services = activeBranch.services.filter((s) => s.id !== serviceId);
          const branch = await saveWashBranchServices(shop, services, branchCtx);
          syncBranchForms(branch);
        },
      },
    ]);
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
      setCouponDraft({
        id: coupon.id,
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: String(coupon.discountValue),
        startDate: coupon.startDate,
        endDate: coupon.endDate,
        usageLimit: coupon.usageLimit != null ? String(coupon.usageLimit) : '',
        minOrderEgp: coupon.minOrderEgp != null ? String(coupon.minOrderEgp) : '',
        active: coupon.active,
      });
    } else {
      setCouponDraft(emptyCouponDraft());
    }
    setCouponModalVisible(true);
  }

  async function onSaveCoupon() {
    if (!activeBranch) return;
    const value = Number(couponDraft.discountValue);
    const usageLimit = couponDraft.usageLimit.trim() ? Number(couponDraft.usageLimit) : undefined;
    const minOrder = couponDraft.minOrderEgp.trim() ? Number(couponDraft.minOrderEgp) : undefined;
    if (
      !couponDraft.code.trim() ||
      Number.isNaN(value) ||
      value <= 0 ||
      (usageLimit != null && (Number.isNaN(usageLimit) || usageLimit < 1)) ||
      (minOrder != null && (Number.isNaN(minOrder) || minOrder < 0))
    ) {
      Alert.alert(t('wash_coupon_invalid_title'), t('wash_coupon_invalid_body'));
      return;
    }
    const coupons = activeBranch.coupons.slice();
    if (couponDraft.id) {
      const idx = coupons.findIndex((c) => c.id === couponDraft.id);
      if (idx >= 0) {
        coupons[idx] = {
          ...coupons[idx],
          code: couponDraft.code.trim().toUpperCase(),
          discountType: couponDraft.discountType,
          discountValue: value,
          startDate: couponDraft.startDate,
          endDate: couponDraft.endDate,
          usageLimit,
          minOrderEgp: minOrder,
          active: couponDraft.active,
        };
      }
    } else {
      coupons.unshift({
        id: newId('cpn'),
        code: couponDraft.code.trim().toUpperCase(),
        discountType: couponDraft.discountType,
        discountValue: value,
        startDate: couponDraft.startDate,
        endDate: couponDraft.endDate,
        usageLimit,
        minOrderEgp: minOrder,
        active: couponDraft.active,
        usageCount: 0,
        createdAt: new Date().toISOString(),
      });
    }
    const branch = await saveWashBranchCoupons(shop, coupons, branchCtx);
    syncBranchForms(branch);
    setCouponModalVisible(false);
    showNotice(t('wash_coupon_saved_title'), t('wash_coupon_saved_body'));
  }

  async function onToggleCoupon(couponId: string) {
    if (!activeBranch) return;
    const coupons = activeBranch.coupons.map((c) =>
      c.id === couponId ? { ...c, active: !c.active } : c,
    );
    const branch = await saveWashBranchCoupons(shop, coupons, branchCtx);
    syncBranchForms(branch);
  }

  async function onDeleteCoupon(couponId: string) {
    if (!activeBranch) return;
    Alert.alert(t('wash_coupon_delete_title'), t('wash_coupon_delete_body'), [
      { text: t('alert_cancel'), style: 'cancel' },
      {
        text: t('wash_coupon_delete_confirm'),
        style: 'destructive',
        onPress: async () => {
          const coupons = activeBranch.coupons.filter((c) => c.id !== couponId);
          const branch = await saveWashBranchCoupons(shop, coupons, branchCtx);
          syncBranchForms(branch);
        },
      },
    ]);
  }

  async function onBookingStatusChange(booking: Booking, status: BookingStatus, note?: string) {
    await updateBookingStatus(booking.id, status, booking, note ? { ownerRejectionNote: note } : undefined);
    if (status === 'confirmed') {
      await pushCustomerNotification({
        customerId: booking.customerId,
        customerPhone: booking.customerPhone,
        kind: 'booking_approved',
        shopId: shop.id,
        bookingId: booking.id,
        scheduledAt: booking.scheduledAt,
      });
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
    await refreshAll();
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

  async function onReportReview(reviewId: string) {
    await setReviewReported(shop.id, reviewId, true);
    const rows = await listShopReviews(shop.id);
    setReviews(rows);
    showNotice(t('wash_review_reported_title'), t('wash_review_reported_body'));
  }

  function applyLastDaysRange() {
    const days = Number(lastDaysInput);
    const range = resolveLastNDaysRange(days);
    if (!range) {
      Alert.alert(t('wash_report_invalid_range_title'), t('wash_report_days_invalid_body'));
      return;
    }
    setReportStartYmd(toYmdLocal(range.start));
    setReportEndYmd(toYmdLocal(range.end));
  }

  function printReportPreview() {
    if (Platform.OS !== 'web') return;
    const iframe = document.getElementById('wash-report-iframe') as HTMLIFrameElement | null;
    iframe?.contentWindow?.print();
  }

  async function onGeneratePdf() {
    if (!reportRange) {
      Alert.alert(t('wash_report_invalid_range_title'), t('wash_report_invalid_range_body'));
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
        setReportPreviewHtml(html);
        return;
      }
      const file = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/pdf',
          dialogTitle: t('wash_report_share_pdf'),
        });
      } else {
        Alert.alert(t('wash_report_pdf_ready_title'), file.uri);
      }
    } catch {
      Alert.alert(t('wash_report_pdf_fail_title'), t('wash_report_pdf_fail_body'));
    } finally {
      setGeneratingPdf(false);
    }
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
            {booking.status === 'confirmed' ? (
              <>
                <Pressable
                  onPress={() => onBookingStatusChange(booking, 'in_progress')}
                  style={[styles.chipBtn, { backgroundColor: theme.accent, borderColor: theme.accent }]}>
                  <Text style={[styles.actionText, { color: theme.onAccent }]}>{t('wash_action_in_progress')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => onBookingStatusChange(booking, 'no_show')}
                  style={[styles.chipBtn, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                  <Text style={[styles.chipBtnText, { color: theme.text }]}>{t('wash_action_no_show')}</Text>
                </Pressable>
              </>
            ) : null}
            {booking.status === 'in_progress' ? (
              <Pressable
                onPress={() => onBookingStatusChange(booking, 'done')}
                style={[styles.chipBtn, { backgroundColor: theme.accent, borderColor: theme.accent }]}>
                <Text style={[styles.actionText, { color: theme.onAccent }]}>{t('wash_action_complete')}</Text>
              </Pressable>
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

  const sortedServices = (activeBranch?.services ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <>
      <ScrollView style={[styles.screen, { backgroundColor: theme.bg }]} contentContainerStyle={styles.page}>
        <OwnerProfileHeader
          theme={theme}
          shopName={shopName}
          typeLabel={shopTypeLabel(shop.type, locale)}
          welcomeLine={t('wash_welcome_back').replace('{name}', shopName)}
          coverImage={coverImage}
          profileImage={profileImage}
          pickingImage={pickingImage}
          coverEditLabel={t('wash_manage_add_image')}
          profileEditLabel={t('wash_manage_set_profile_image')}
          logoutLabel={t('wash_logout')}
          notificationsLabel={t('wash_notifications_button')}
          notificationCount={unreadNotifCount}
          onEditCover={onPickGalleryImage}
          onEditProfile={onSetProfileImage}
          onLogout={onLogout}
          onOpenNotifications={() => router.push('/shop/wash-owner-hub?tab=notifications')}
        />

        {staff ? (
          <View style={[styles.roleBadge, { backgroundColor: theme.accentSoft, borderColor: theme.accent }]}>
            <Text style={[styles.roleBadgeText, { color: theme.accent }]}>
              {t(isOwner ? 'wash_role_owner' : 'wash_role_branch_manager')}
            </Text>
          </View>
        ) : null}

        {isBranchManager && activeBranch ? (
          <View style={[styles.branchBar, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
            <View style={styles.branchSelect}>
              <Text style={[styles.branchLabel, { color: theme.textMuted }]}>{t('wash_branch_label')}</Text>
              <Text style={[styles.branchName, { color: theme.text }]} numberOfLines={1}>
                {branchDisplayName(activeBranch, locale)}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.branchTabsWrap}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.branchTabsRow}>
              {(branchState?.branches ?? []).map((branch) => {
                const active = branch.id === branchState?.activeBranchId;
                return (
                  <Pressable
                    key={branch.id}
                    onPress={() => onSelectBranch(branch.id)}
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
              {isOwner ? (
                <Pressable
                  onPress={() => setAddBranchModalVisible(true)}
                  style={[styles.branchTab, { backgroundColor: theme.card, borderColor: theme.accent, borderStyle: 'dashed' }]}>
                  <Text style={[styles.branchTabText, { color: theme.accent }]}>+ {t('wash_add_branch')}</Text>
                </Pressable>
              ) : null}
            </ScrollView>
          </View>
        )}

        {loading && !analytics ? (
          <ActivityIndicator color={theme.accent} style={{ marginVertical: 16 }} />
        ) : null}

        {/* Dashboard overview */}
        {analytics ? (
          <OwnerSectionCard theme={theme} title={t('wash_dashboard_title')} subtitle={t('wash_dashboard_lead')}>
            <View style={styles.statGrid}>
              {renderStatCard(t('wash_stat_today_bookings'), String(analytics.todayBookings))}
              {renderStatCard(t('wash_stat_pending'), String(analytics.pendingRequests), true)}
              {renderStatCard(t('wash_stat_monthly_revenue'), formatEgp(analytics.monthlyRevenue, locale))}
              {renderStatCard(t('wash_stat_avg_rating'), analytics.averageRating.toFixed(1))}
              {renderStatCard(t('wash_stat_total_customers'), String(analytics.totalCustomers))}
              {renderStatCard(t('wash_stat_returning'), String(analytics.returningCustomers))}
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
          <OwnerSectionCard theme={theme} title={t('wash_analytics_title')} subtitle={t('wash_analytics_lead')}>
            <Text style={[styles.metaStrong, { color: theme.text }]}>
              {t('wash_analytics_weekly_revenue')}: {formatEgp(analytics.weeklyRevenue, locale)}
            </Text>
            <Text style={[styles.meta, { color: theme.textMuted, marginTop: 8 }]}>
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
          <View style={styles.shortcutRow}>
            <Pressable
              onPress={() => router.push('/shop/wash-owner-hub?tab=notifications')}
              style={[styles.shortcutCard, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
              <Text style={[styles.shortcutTitle, { color: theme.text }]}>{t('wash_hub_tab_notifications')}</Text>
              <Text style={[styles.shortcutMeta, { color: theme.textMuted }]}>
                {unreadNotifCount > 0 ? `${unreadNotifCount} ${t('wash_hub_unread')}` : t('wash_notif_empty')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.push('/shop/wash-owner-hub?tab=orders')}
              style={[styles.shortcutCard, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
              <Text style={[styles.shortcutTitle, { color: theme.text }]}>{t('wash_hub_tab_orders')}</Text>
              <Text style={[styles.shortcutMeta, { color: theme.textMuted }]}>
                {pendingOrderCount > 0 ? `${pendingOrderCount} ${t('wash_hub_active')}` : t('wash_active_requests_empty')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.push('/shop/wash-owner-hub?tab=history')}
              style={[styles.shortcutCard, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
              <Text style={[styles.shortcutTitle, { color: theme.text }]}>{t('wash_hub_tab_history')}</Text>
              <Text style={[styles.shortcutMeta, { color: theme.textMuted }]}>
                {historyCount > 0 ? `${historyCount} ${t('wash_hub_records')}` : t('wash_booking_history_empty')}
              </Text>
            </Pressable>
          </View>
        </OwnerSectionCard>

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
          <Pressable onPress={onSaveProfile} style={[styles.primaryBtn, { backgroundColor: theme.accent }]}>
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
          {activeBranch?.imageUrls?.length ? (
            <View style={styles.albumGrid}>
              {activeBranch.imageUrls.map((url) => (
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

        {/* Base price */}
        <OwnerSectionCard theme={theme} title={t('wash_base_price_title')}>
          <TextInput placeholder={t('wash_base_price_placeholder')} placeholderTextColor={theme.textDim} keyboardType="numeric" value={basePrice} onChangeText={setBasePrice} style={fieldStyle} />
          <Pressable onPress={onSaveBasePrice} style={[styles.primaryBtn, { backgroundColor: theme.accent }]}>
            <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>{t('wash_base_price_save')}</Text>
          </Pressable>
        </OwnerSectionCard>

        {/* Services CRUD */}
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
                    {categoryLabel(service.category, locale)} · {formatEgp(service.priceEgp, locale)} · {service.durationMinutes} {t('wash_service_minutes')}
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

        {/* Weekly hours — pick one day */}
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
            <View style={styles.actions}>
              <Pressable
                onPress={() => updateDayHours(selectedDayRow.day, { closed: !selectedDayRow.closed })}
                style={[
                  styles.chipBtn,
                  {
                    backgroundColor: selectedDayRow.closed ? theme.danger : theme.accent,
                    borderColor: selectedDayRow.closed ? theme.danger : theme.accent,
                  },
                ]}>
                <Text style={[styles.chipBtnText, { color: selectedDayRow.closed ? '#fff' : theme.onAccent }]}>
                  {selectedDayRow.closed ? t('wash_hours_closed') : t('wash_hours_open')}
                </Text>
              </Pressable>
            </View>
            {!selectedDayRow.closed ? (
              <>
                <TextInput placeholder={t('wash_hours_open_time')} placeholderTextColor={theme.textDim} value={selectedDayRow.openTime ?? ''} onChangeText={(v) => updateDayHours(selectedDayRow.day, { openTime: v })} style={fieldStyle} />
                <TextInput placeholder={t('wash_hours_close_time')} placeholderTextColor={theme.textDim} value={selectedDayRow.closeTime ?? ''} onChangeText={(v) => updateDayHours(selectedDayRow.day, { closeTime: v })} style={fieldStyle} />
                <TextInput placeholder={t('wash_hours_break_start')} placeholderTextColor={theme.textDim} value={selectedDayRow.breakStartTime ?? ''} onChangeText={(v) => updateDayHours(selectedDayRow.day, { breakStartTime: v })} style={fieldStyle} />
                <TextInput placeholder={t('wash_hours_break_end')} placeholderTextColor={theme.textDim} value={selectedDayRow.breakEndTime ?? ''} onChangeText={(v) => updateDayHours(selectedDayRow.day, { breakEndTime: v })} style={fieldStyle} />
              </>
            ) : null}
          </View>
          <Pressable onPress={onSaveWeeklyHours} style={[styles.primaryBtn, { backgroundColor: theme.accent }]}>
            <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>{t('wash_hours_save')}</Text>
          </Pressable>
        </OwnerSectionCard>

        {/* Coupons */}
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

        {isOwner && activeBranch && isUuid(activeBranch.id) ? (
          <OwnerSectionCard theme={theme} title={t('wash_manager_title')} subtitle={t('wash_manager_lead')}>
            {branchManager ? (
              <View style={[styles.serviceRow, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.metaStrong, { color: theme.text }]}>
                    {branchManager.full_name || branchManager.email}
                  </Text>
                  <Text style={[styles.meta, { color: theme.textMuted }]}>{branchManager.email}</Text>
                </View>
                <Text style={[styles.meta, { color: theme.accent, fontWeight: '800' }]}>
                  {t('wash_role_branch_manager')}
                </Text>
              </View>
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
        ) : null}

        {activeBranch && isUuid(activeBranch.id) ? (
          <OwnerSectionCard theme={theme} title={t('wash_employees_title')} subtitle={t('wash_employees_lead')}>
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
                  style={[styles.serviceRow, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.metaStrong, { color: theme.text }]}>{employee.full_name}</Text>
                    {employee.job_title ? (
                      <Text style={[styles.meta, { color: theme.textMuted }]}>{employee.job_title}</Text>
                    ) : null}
                    {employee.phone ? (
                      <Text style={[styles.meta, { color: theme.textMuted }]}>{employee.phone}</Text>
                    ) : null}
                  </View>
                  <Pressable
                    onPress={() => onRemoveEmployee(employee.id)}
                    disabled={employeeBusy}
                    style={[styles.chipBtn, { backgroundColor: theme.danger, borderColor: theme.danger }]}>
                    <Text style={styles.actionText}>{t('wash_employee_remove')}</Text>
                  </Pressable>
                </View>
              ))
            )}
          </OwnerSectionCard>
        ) : null}

        {/* Reviews */}
        <OwnerSectionCard theme={theme} title={t('wash_reviews_title')} subtitle={t('wash_reviews_lead')}>
          {reviews.filter((r) => !r.hidden).length === 0 ? (
            <Text style={[styles.empty, { color: theme.textMuted }]}>{t('wash_reviews_empty')}</Text>
          ) : (
            reviews
              .filter((r) => !r.hidden)
              .map((review) => (
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
                    <Pressable onPress={() => onReportReview(review.id)} style={[styles.chipBtn, { backgroundColor: theme.danger, borderColor: theme.danger }]}>
                      <Text style={styles.actionText}>{t('wash_review_report')}</Text>
                    </Pressable>
                  </View>
                </View>
              ))
          )}
        </OwnerSectionCard>

        {/* PDF reports */}
        <OwnerSectionCard theme={theme} title={t('wash_report_title')} subtitle={t('wash_report_lead')}>
          <View style={styles.customRangeWrap}>
            <BookingDatePicker
              valueYmd={reportStartYmd}
              onChangeYmd={setReportStartYmd}
              locale={locale}
              label={t('wash_report_start_date')}
              pickHint={t('book_date_pick_hint')}
              minimumDate={new Date('2020-01-01T00:00:00')}
              borderColor={theme.border}
              backgroundColor={theme.bgElevated}
              textColor={theme.text}
            />
            <BookingDatePicker
              valueYmd={reportEndYmd}
              onChangeYmd={setReportEndYmd}
              locale={locale}
              label={t('wash_report_end_date')}
              pickHint={t('book_date_pick_hint')}
              minimumDate={new Date('2020-01-01T00:00:00')}
              borderColor={theme.border}
              backgroundColor={theme.bgElevated}
              textColor={theme.text}
            />
          </View>
          <Text style={[styles.inlineSectionTitle, { color: theme.text }]}>{t('wash_report_last_n_days')}</Text>
          <View style={styles.lastDaysRow}>
            <TextInput
              value={lastDaysInput}
              onChangeText={setLastDaysInput}
              keyboardType="number-pad"
              placeholder={t('wash_report_days_placeholder')}
              placeholderTextColor={theme.textDim}
              style={[fieldStyle, styles.lastDaysInput]}
            />
            <Pressable onPress={applyLastDaysRange} style={[styles.secondaryBtn, { borderColor: theme.border, marginTop: 8 }]}>
              <Text style={[styles.secondaryBtnText, { color: theme.text }]}>{t('wash_report_apply_days')}</Text>
            </Pressable>
          </View>
          <Text style={[styles.reportSummary, { color: theme.textMuted }]}>
            {reportRange
              ? t('wash_report_count')
                  .replace('{count}', String(reportBookings.length))
                  .replace('{range}', formatRangeLabel(reportRange, locale))
              : t('wash_report_invalid_range_body')}
          </Text>
          {reportRange ? (
            <Text style={[styles.reportMoney, { color: theme.text }]}>
              {t('wash_report_money_line')
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
              {generatingPdf
                ? t('wash_report_generating')
                : Platform.OS === 'web'
                  ? t('wash_report_view_report')
                  : t('wash_report_generate_pdf')}
            </Text>
          </Pressable>
        </OwnerSectionCard>
      </ScrollView>

      {/* Add branch modal */}
      <Modal visible={addBranchModalVisible} transparent animationType="fade" onRequestClose={() => setAddBranchModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{t('wash_branch_add_title')}</Text>
            <TextInput placeholder={t('wash_branch_name_placeholder')} placeholderTextColor={theme.textDim} value={newBranchName} onChangeText={setNewBranchName} style={fieldStyle} />
            <TextInput placeholder={t('wash_branch_name_ar_placeholder')} placeholderTextColor={theme.textDim} value={newBranchNameAr} onChangeText={setNewBranchNameAr} style={fieldStyle} />
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
              <TextInput placeholder={t('wash_service_duration_placeholder')} placeholderTextColor={theme.textDim} keyboardType="numeric" value={serviceDraft.durationMinutes} onChangeText={(v) => setServiceDraft((d) => ({ ...d, durationMinutes: v }))} style={fieldStyle} />
              <Text style={[styles.inlineSectionTitle, { color: theme.text }]}>{t('wash_service_category_label')}</Text>
              <View style={styles.actions}>
                {WASH_SERVICE_CATEGORIES.map((cat) => (
                  <Pressable
                    key={cat.id}
                    onPress={() => setServiceDraft((d) => ({ ...d, category: cat.id }))}
                    style={[styles.chipBtn, { backgroundColor: serviceDraft.category === cat.id ? theme.accent : theme.bgElevated, borderColor: serviceDraft.category === cat.id ? theme.accent : theme.border }]}>
                    <Text style={[styles.chipBtnText, { color: serviceDraft.category === cat.id ? theme.onAccent : theme.text }]}>
                      {locale === 'ar' ? cat.ar : cat.en}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.modalActions}>
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
      <Modal visible={couponModalVisible} transparent animationType="fade" onRequestClose={() => setCouponModalVisible(false)}>
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
              <BookingDatePicker valueYmd={couponDraft.startDate} onChangeYmd={(v) => setCouponDraft((d) => ({ ...d, startDate: v }))} locale={locale} label={t('wash_coupon_start_date')} pickHint={t('book_date_pick_hint')} minimumDate={new Date('2020-01-01')} borderColor={theme.border} backgroundColor={theme.bgElevated} textColor={theme.text} />
              <BookingDatePicker valueYmd={couponDraft.endDate} onChangeYmd={(v) => setCouponDraft((d) => ({ ...d, endDate: v }))} locale={locale} label={t('wash_coupon_end_date')} pickHint={t('book_date_pick_hint')} minimumDate={new Date('2020-01-01')} borderColor={theme.border} backgroundColor={theme.bgElevated} textColor={theme.text} />
              <TextInput placeholder={t('wash_coupon_usage_limit_placeholder')} placeholderTextColor={theme.textDim} keyboardType="numeric" value={couponDraft.usageLimit} onChangeText={(v) => setCouponDraft((d) => ({ ...d, usageLimit: v }))} style={fieldStyle} />
              <TextInput placeholder={t('wash_coupon_min_order_placeholder')} placeholderTextColor={theme.textDim} keyboardType="numeric" value={couponDraft.minOrderEgp} onChangeText={(v) => setCouponDraft((d) => ({ ...d, minOrderEgp: v }))} style={fieldStyle} />
              <View style={styles.modalActions}>
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

      {/* PDF preview (web) */}
      <Modal visible={!!reportPreviewHtml} animationType="slide" onRequestClose={() => setReportPreviewHtml(null)}>
        <View style={[styles.reportModalScreen, { backgroundColor: theme.bg }]}>
          <View style={[styles.reportModalHeader, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
            <Pressable onPress={() => setReportPreviewHtml(null)} style={styles.reportModalBtn}>
              <Text style={{ color: theme.text, fontWeight: '700' }}>{t('wash_report_close')}</Text>
            </Pressable>
            <Text style={[styles.reportModalTitle, { color: theme.text }]} numberOfLines={1}>
              {t('wash_report_title')}
            </Text>
            <Pressable onPress={printReportPreview} style={styles.reportModalBtn}>
              <Text style={{ color: theme.accent, fontWeight: '800' }}>{t('wash_report_save_pdf')}</Text>
            </Pressable>
          </View>
          <View style={styles.reportIframeWrap}>
            {Platform.OS === 'web' && reportPreviewHtml
              ? createElement('iframe', {
                  id: 'wash-report-iframe',
                  srcDoc: reportPreviewHtml,
                  style: { width: '100%', height: '100%', border: 'none', display: 'block', backgroundColor: '#ffffff' },
                  title: 'Wash report',
                })
              : null}
          </View>
        </View>
      </Modal>
    </>
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
  shortcutRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  shortcutCard: {
    flexGrow: 1,
    minWidth: '30%',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  shortcutTitle: { fontSize: 14, fontWeight: '800', marginBottom: 4 },
  shortcutMeta: { fontSize: 12, lineHeight: 17 },
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
    maxWidth: 420,
    maxHeight: '85%',
    borderWidth: 1,
    borderRadius: 18,
    padding: 20,
  },
  modalScrollOuter: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: '900', marginBottom: 8 },
  modalScroll: { maxHeight: 320 },
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
});
