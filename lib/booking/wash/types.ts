import type { ShopDayHours, ShopOffer, ShopService, ShopType } from '@/lib/booking/types';

export type WashShopStatus = 'open' | 'closed' | 'busy' | 'vacation';

export type WashCouponDiscountType = 'percent' | 'fixed';

export type WashCoupon = {
  id: string;
  code: string;
  discountType: WashCouponDiscountType;
  discountValue: number;
  startDate: string;
  endDate: string;
  usageLimit?: number;
  perCustomerUsageLimit?: number;
  usageCount: number;
  minOrderEgp?: number;
  active: boolean;
  createdAt: string;
};

export type WashVacationMode = {
  enabled: boolean;
  returnDate?: string;
  customerMessage?: string;
  customerMessageAr?: string;
};

export type WashBranch = {
  id: string;
  name: string;
  nameAr?: string;
  profileName?: string;
  profileNameAr?: string;
  profileAddress?: string;
  profileAddressAr?: string;
  profilePhone?: string;
  profileEmail?: string;
  moreInfo?: string;
  moreInfoAr?: string;
  profileImageUrl?: string;
  imageUrls: string[];
  servicePriceEgp?: number;
  workOpenTime?: string;
  workCloseTime?: string;
  serviceDurationMinutes?: number;
  weeklyHours: ShopDayHours[];
  services: ShopService[];
  offers: ShopOffer[];
  coupons: WashCoupon[];
  shopStatus: WashShopStatus;
  vacationMode: WashVacationMode;
  scheduleSavedAt?: string;
  latitude?: number;
  longitude?: number;
  createdAt: string;
  updatedAt: string;
};

export type WashBranchState = {
  shopId: string;
  activeBranchId: string;
  branches: WashBranch[];
  updatedAt: string;
};

export type WashCenterNotificationKind =
  | 'new_booking'
  | 'cancelled_booking'
  | 'new_review'
  | 'weekly_revenue'
  | 'system_alert';

export type WashCenterNotification = {
  id: string;
  shopId: string;
  branchId?: string;
  kind: WashCenterNotificationKind;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  bookingId?: string;
  reviewId?: string;
  /** Embedded HTML for report preview (weekly_revenue / system_alert). */
  reportHtml?: string;
};

export type WashAnalyticsSnapshot = {
  todayBookings: number;
  pendingRequests: number;
  monthlyRevenue: number;
  averageRating: number;
  totalCustomers: number;
  mostBookedService: string;
  weeklyRevenue: number;
  returningCustomers: number;
  peakHourLabel: string;
  bookingTrend: Array<{ label: string; count: number }>;
};

export const WASH_DAY_LABELS: Record<number, { en: string; ar: string }> = {
  0: { en: 'Sunday', ar: 'الأحد' },
  1: { en: 'Monday', ar: 'الإثنين' },
  2: { en: 'Tuesday', ar: 'الثلاثاء' },
  3: { en: 'Wednesday', ar: 'الأربعاء' },
  4: { en: 'Thursday', ar: 'الخميس' },
  5: { en: 'Friday', ar: 'الجمعة' },
  6: { en: 'Saturday', ar: 'السبت' },
};

export const WASH_SERVICE_CATEGORIES: Array<{
  id: ShopService['category'];
  en: string;
  ar: string;
}> = [
  { id: 'exterior_wash', en: 'Exterior Wash', ar: 'غسيل خارجي' },
  { id: 'interior_cleaning', en: 'Interior Cleaning', ar: 'تنظيف داخلي' },
  { id: 'full_package', en: 'Full Package', ar: 'باقة كاملة' },
  { id: 'detailing', en: 'Detailing', ar: 'تفصيل' },
  { id: 'engine_cleaning', en: 'Engine Cleaning', ar: 'تنظيف محرك' },
  { id: 'custom', en: 'Custom', ar: 'مخصص' },
];

export function isWashShopType(type: ShopType): boolean {
  return type === 'wash';
}
