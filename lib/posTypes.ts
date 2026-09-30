export type PosCarType = 'sedan' | 'suv' | 'truck' | 'hatchback' | 'coupe' | 'van' | 'other';

export type PosOrderSource = 'walk_in' | 'pitstop_app';

export type PosOrderStatus = 'completed' | 'cancelled';

export type PosShiftStatus = 'open' | 'closed';

export type ShopExpenseCategory =
  | 'raw_materials'
  | 'utilities'
  | 'labor_advance'
  | 'tea_food'
  | 'maintenance'
  | 'other';

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
