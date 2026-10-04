export type PosCarType = 'sedan' | 'suv' | 'truck' | 'hatchback' | 'coupe' | 'van' | 'other';

export type PosOrderSource = 'walk_in' | 'pitstop_app';

export type PosOrderStatus = 'completed' | 'cancelled';

export type PosShiftStatus = 'open' | 'closed';

export type ShopExpenseCategory =
  | 'raw_materials'
  | 'utilities'
  | 'labor_advance'
  | 'staff_advance'
  | 'staff_wage'
  | 'tea_food'
  | 'maintenance'
  | 'other';

export type ShopAnalyticsTimeframe = 'today' | 'month';

export type PosPaymentStatus = 'paid' | 'unpaid';

export type PosPaymentMethod = 'cash' | 'instapay' | 'credit';

export type PayrollRecordType = 'daily_wage' | 'commission' | 'advance_deduction' | 'monthly_salary';

export type InventoryKind = 'retail' | 'supply';

export type ShopPosCustomer = {
  id: string;
  shopId: string;
  phone: string;
  fullName: string;
  licensePlate?: string;
  carType: PosCarType;
  totalVisits: number;
  lastVisitAt?: string;
  notes?: string;
};

export type PosShift = {
  id: string;
  shopId: string;
  openedAt: string;
  closedAt?: string;
  openedBy?: string;
  closedBy?: string;
  openingCashFloat: number;
  systemCashExpected: number;
  actualCashCounted?: number;
  cashDifference: number;
  status: PosShiftStatus;
};

export type PosOrderItemInput = {
  productId: string;
  quantity: number;
  unitPrice: number;
};

export type ShopFinancials = {
  walkInRevenue: number;
  appBookingRevenue: number;
  accessorySales: number;
  rawMaterialPurchases: number;
  operatingExpenses: number;
  payrollAndAdvances: number;
  pitstopCommissions: number;
  pitstopFeesDue: number;
  netProfit: number;
};

export type PeakHourBucket = {
  hour: number;
  count: number;
  isPeak: boolean;
};

export type PeakWeekdayBucket = {
  weekday: number;
  label: string;
  count: number;
};

export const POS_CAR_TYPES: PosCarType[] = [
  'sedan',
  'suv',
  'truck',
  'hatchback',
  'coupe',
  'van',
  'other',
];

export type ShopAnalytics = {
  totalSales: number;
  walkInSales: number;
  appBookingSales: number;
  washRevenue: number;
  accessorySales: number;
  operatingExpenses: number;
  rawMaterials: number;
  operations: number;
  payroll: number;
  employeeCommissions: number;
  pitstopFees: number;
  pitstopFeesDue: number;
  uncollected: number;
  unpaidOrders: number;
  pendingCredits: number;
  netProfit: number;
  usedFallbackRange: boolean;
  isDemo: boolean;
};

export const EMPTY_SHOP_ANALYTICS: ShopAnalytics = {
  totalSales: 0,
  walkInSales: 0,
  appBookingSales: 0,
  washRevenue: 0,
  accessorySales: 0,
  operatingExpenses: 0,
  rawMaterials: 0,
  operations: 0,
  payroll: 0,
  employeeCommissions: 0,
  pitstopFees: 0,
  pitstopFeesDue: 0,
  uncollected: 0,
  unpaidOrders: 0,
  pendingCredits: 0,
  netProfit: 0,
  usedFallbackRange: false,
  isDemo: false,
};

export const DEMO_SHOP_ANALYTICS: ShopAnalytics = {
  totalSales: 4280,
  walkInSales: 2650,
  appBookingSales: 1630,
  washRevenue: 3710,
  accessorySales: 570,
  operatingExpenses: 940,
  rawMaterials: 620,
  operations: 320,
  payroll: 1100,
  employeeCommissions: 180,
  pitstopFees: 196,
  pitstopFeesDue: 196,
  uncollected: 850,
  unpaidOrders: 600,
  pendingCredits: 250,
  netProfit: 2044,
  usedFallbackRange: false,
  isDemo: true,
};

export const EMPTY_SHOP_FINANCIALS: ShopFinancials = {
  walkInRevenue: 0,
  appBookingRevenue: 0,
  accessorySales: 0,
  rawMaterialPurchases: 0,
  operatingExpenses: 0,
  payrollAndAdvances: 0,
  pitstopCommissions: 0,
  pitstopFeesDue: 0,
  netProfit: 0,
};
