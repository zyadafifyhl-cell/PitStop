/** Car-wash POS queries and RPCs. */
import { getSupabase } from '@/lib/supabase/client';
import type { Booking } from '@/lib/booking/types';
import type { DbBranchEmployee } from '@/lib/supabase/database.types';
import {
  DEMO_SHOP_ANALYTICS,
  EMPTY_SHOP_ANALYTICS,
  EMPTY_SHOP_FINANCIALS,
  type PayrollRecordType,
  type ShopAnalytics,
  type PeakHourBucket,
  type PeakWeekdayBucket,
  type PosCarType,
  type PosOrderItemInput,
  type PosShift,
  type ShopExpenseCategory,
  type ShopFinancials,
  type ShopPosCustomer,
} from '@/lib/posTypes';

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function mapCustomer(row: Record<string, unknown>): ShopPosCustomer {
  return {
    id: String(row.id),
    shopId: String(row.shop_id),
    phone: String(row.phone ?? ''),
    fullName: String(row.full_name ?? ''),
    licensePlate: row.license_plate ? String(row.license_plate) : undefined,
    carType: (row.car_type as PosCarType) || 'sedan',
    totalVisits: num(row.total_visits),
    lastVisitAt: row.last_visit_at ? String(row.last_visit_at) : undefined,
    notes: row.notes ? String(row.notes) : undefined,
  };
}

function mapShift(row: Record<string, unknown>): PosShift {
  return {
    id: String(row.id),
    shopId: String(row.shop_id),
    openedAt: String(row.opened_at),
    closedAt: row.closed_at ? String(row.closed_at) : undefined,
    openedBy: row.opened_by ? String(row.opened_by) : undefined,
    closedBy: row.closed_by ? String(row.closed_by) : undefined,
    openingCashFloat: num(row.opening_cash_float),
    systemCashExpected: num(row.system_cash_expected),
    actualCashCounted: row.actual_cash_counted == null ? undefined : num(row.actual_cash_counted),
    cashDifference: num(row.cash_difference),
    status: row.status === 'closed' ? 'closed' : 'open',
  };
}

export async function lookupShopCustomer(shopId: string, phone: string): Promise<ShopPosCustomer | null> {
  const supabase = getSupabase();
  if (!supabase || !phone.trim()) return null;
  const { data } = await supabase.rpc('pos_normalize_phone', { p_phone: phone.trim() });
  const normalized = typeof data === 'string' ? data : phone.trim();
  const { data: row } = await supabase
    .from('customers')
    .select('*')
    .eq('shop_id', shopId)
    .eq('phone', normalized)
    .maybeSingle();
  return row ? mapCustomer(row as Record<string, unknown>) : null;
}

export async function listShopCustomers(shopId: string, query?: string): Promise<ShopPosCustomer[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  let request = supabase.from('customers').select('*').eq('shop_id', shopId).order('last_visit_at', { ascending: false, nullsFirst: false });
  const q = query?.trim().replace(/[%_\\,()]/g, '');
  if (q) {
    request = request.or(`phone.ilike.%${q}%,license_plate.ilike.%${q}%,full_name.ilike.%${q}%`);
  }
  const { data, error } = await request.limit(80);
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map(mapCustomer);
}

export async function getOpenPosShift(shopId: string): Promise<PosShift | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase
    .from('pos_shifts')
    .select('*')
    .eq('shop_id', shopId)
    .eq('status', 'open')
    .order('opened_at', { ascending: false })
    .maybeSingle();
  return data ? mapShift(data as Record<string, unknown>) : null;
}

export async function ensureOpenPosShift(shopId: string, openingFloat = 0): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('pos_ensure_open_shift', {
    p_shop_id: shopId,
    p_opening_float: openingFloat,
  });
  if (error) throw error;
  return typeof data === 'string' ? data : null;
}

export async function closePosShift(shiftId: string, actualCash: number): Promise<PosShift> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase is not configured');
  const { data, error } = await supabase.rpc('pos_close_shift', {
    p_shift_id: shiftId,
    p_actual_cash: actualCash,
  });
  if (error || !data) throw error ?? new Error('Could not close shift');
  return mapShift(data as Record<string, unknown>);
}

export async function createWalkInPosOrder(input: {
  shopId: string;
  serviceId: string;
  price: number;
  carType: string;
  phone?: string;
  fullName?: string;
  licensePlate?: string;
  employeeId?: string;
  notes?: string;
  items?: PosOrderItemInput[];
  bookingId?: string;
}): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase is not configured');
  const { data, error } = await supabase.rpc('pos_create_walk_in_order', {
    p_shop_id: input.shopId,
    p_service_id: input.serviceId,
    p_price: input.price,
    p_car_type: input.carType,
    p_phone: input.phone ?? null,
    p_full_name: input.fullName ?? '',
    p_license_plate: input.licensePlate ?? null,
    p_employee_id: input.employeeId ?? null,
    p_notes: input.notes ?? null,
    p_items: (input.items ?? []).map((item) => ({
      product_id: item.productId,
      quantity: item.quantity,
      unit_price: item.unitPrice,
    })),
    p_booking_id: input.bookingId ?? null,
  });
  if (error || typeof data !== 'string') {
    throw error ?? new Error('Could not create POS order');
  }
  return data;
}

export async function logShopExpense(input: {
  shopId: string;
  category: ShopExpenseCategory;
  itemName: string;
  amount: number;
  notes?: string;
  deductCash?: boolean;
}): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase is not configured');
  const { error } = await supabase.rpc('pos_log_expense', {
    p_shop_id: input.shopId,
    p_category: input.category,
    p_item_name: input.itemName,
    p_amount: input.amount,
    p_notes: input.notes ?? null,
    p_deduct_cash: input.deductCash ?? true,
  });
  if (error) throw error;
}

export async function logEmployeePayroll(input: {
  shopId: string;
  employeeId: string;
  type: PayrollRecordType;
  amount: number;
  notes?: string;
}): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase is not configured');
  const { error } = await supabase.from('employee_payroll_records').insert({
    shop_id: input.shopId,
    employee_id: input.employeeId,
    type: input.type,
    amount: input.amount,
    notes: input.notes ?? null,
  });
  if (error) throw error;
  if (input.type === 'advance_deduction') {
    await logShopExpense({
      shopId: input.shopId,
      category: 'labor_advance',
      itemName: 'Employee cash advance',
      amount: input.amount,
      notes: input.notes,
      deductCash: true,
    });
  }
}

export async function updateEmployeePayRates(input: {
  employeeId: string;
  dailyWage: number;
  commissionRate: number;
  monthlySalary: number;
}): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  const { error } = await supabase
    .from('branch_employees')
    .update({
      daily_wage: input.dailyWage,
      commission_rate: input.commissionRate,
      monthly_salary: input.monthlySalary,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.employeeId);
  return !error;
}

function mapAnalytics(row: Record<string, unknown>, extras?: Partial<ShopAnalytics>): ShopAnalytics {
  return {
    totalSales: num(row.totalSales),
    walkInSales: num(row.walkInSales),
    appBookingSales: num(row.appBookingSales),
    washRevenue: num(row.washRevenue),
    accessorySales: num(row.accessorySales),
    operatingExpenses: num(row.operatingExpenses),
    rawMaterials: num(row.rawMaterials),
    operations: num(row.operations),
    payroll: num(row.payroll),
    employeeCommissions: num(row.employeeCommissions),
    pitstopFees: num(row.pitstopFees),
    pitstopFeesDue: num(row.pitstopFeesDue),
    uncollected: num(row.uncollected),
    unpaidOrders: num(row.unpaidOrders),
    pendingCredits: num(row.pendingCredits),
    netProfit: num(row.netProfit),
    usedFallbackRange: false,
    isDemo: false,
    ...extras,
  };
}

function isEmptyAnalytics(row: ShopAnalytics): boolean {
  return (
    row.totalSales === 0 &&
    row.operatingExpenses === 0 &&
    row.payroll === 0 &&
    row.uncollected === 0 &&
    row.pitstopFees === 0
  );
}

export function rangeForAnalyticsTimeframe(
  timeframe: 'today' | 'month',
  now = new Date(),
): { from: Date; to: Date } {
  if (timeframe === 'today') {
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    return { from, to };
  }
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1),
    to: new Date(now.getFullYear(), now.getMonth() + 1, 1),
  };
}

async function fetchShopAnalyticsRange(shopId: string, fromIso: string, toIso: string): Promise<ShopAnalytics> {
  const supabase = getSupabase();
  if (!supabase) return EMPTY_SHOP_ANALYTICS;
  const { data, error } = await supabase.rpc('shop_pos_analytics', {
    p_shop_id: shopId,
    p_from: fromIso,
    p_to: toIso,
  });
  if (!error && data && typeof data === 'object') {
    return mapAnalytics(data as Record<string, unknown>);
  }
  return fetchShopAnalyticsFallback(shopId, fromIso, toIso);
}

async function fetchShopAnalyticsFallback(shopId: string, fromIso: string, toIso: string): Promise<ShopAnalytics> {
  const supabase = getSupabase();
  if (!supabase) return EMPTY_SHOP_ANALYTICS;
  const from = new Date(fromIso);
  const to = new Date(toIso);

  const [ordersRes, itemsRes, expensesRes, payrollRes, bookingsRes, creditsRes] = await Promise.all([
    supabase
      .from('pos_orders')
      .select('source, status, price, total_amount, payment_status, pitstop_commission, created_at')
      .eq('shop_id', shopId)
      .eq('status', 'completed')
      .gte('created_at', fromIso)
      .lt('created_at', toIso),
    supabase
      .from('pos_order_items')
      .select('subtotal, pos_orders!inner(shop_id, status, created_at)')
      .eq('pos_orders.shop_id', shopId)
      .eq('pos_orders.status', 'completed')
      .gte('pos_orders.created_at', fromIso)
      .lt('pos_orders.created_at', toIso),
    supabase
      .from('shop_expenses')
      .select('category, amount, created_at, recorded_at')
      .eq('shop_id', shopId),
    supabase
      .from('employee_payroll_records')
      .select('type, amount, date')
      .eq('shop_id', shopId)
      .gte('date', fromIso.slice(0, 10))
      .lt('date', toIso.slice(0, 10)),
    supabase
      .from('bookings')
      .select('booking_type, status, service_price_egp, final_amount_paid_egp, total_price, platform_fee_egp, scheduled_at')
      .eq('shop_id', shopId)
      .eq('booking_type', 'app')
      .in('status', ['done', 'confirmed', 'in_progress'])
      .gte('scheduled_at', fromIso)
      .lt('scheduled_at', toIso),
    supabase.from('customer_credits').select('amount_due, status').eq('shop_id', shopId).eq('status', 'pending'),
  ]);

  const orders = (ordersRes.data ?? []) as Array<Record<string, unknown>>;
  const walkInSales = orders
    .filter((row) => row.source === 'walk_in')
    .reduce((sum, row) => sum + (num(row.total_amount) || num(row.price)), 0);
  const posAppSales = orders
    .filter((row) => row.source === 'pitstop_app')
    .reduce((sum, row) => sum + (num(row.total_amount) || num(row.price)), 0);
  const bookingSales = (bookingsRes.data ?? []).reduce(
    (sum, row) =>
      sum + num((row as { final_amount_paid_egp?: number; service_price_egp?: number; total_price?: number }).final_amount_paid_egp
        ?? (row as { service_price_egp?: number }).service_price_egp
        ?? (row as { total_price?: number }).total_price),
    0,
  );
  const appBookingSales = posAppSales + bookingSales;
  const washRevenue = orders.reduce((sum, row) => sum + num(row.price), 0) + bookingSales;
  const accessorySales = ((itemsRes.data ?? []) as Array<{ subtotal?: number }>).reduce((sum, row) => sum + num(row.subtotal), 0);
  const expenses = (expensesRes.data ?? []) as Array<{ category?: string; amount?: number; created_at?: string; recorded_at?: string }>;
  const inRange = expenses.filter((row) => {
    const at = new Date(String(row.created_at ?? row.recorded_at ?? ''));
    return at >= from && at < to;
  });
  const rawMaterials = inRange.filter((row) => row.category === 'raw_materials').reduce((sum, row) => sum + num(row.amount), 0);
  const operations = inRange
    .filter((row) => ['utilities', 'tea_food', 'maintenance', 'other'].includes(String(row.category)))
    .reduce((sum, row) => sum + num(row.amount), 0);
  const staffExpenses = inRange
    .filter((row) => ['staff_advance', 'staff_wage', 'labor_advance'].includes(String(row.category)))
    .reduce((sum, row) => sum + num(row.amount), 0);
  const payrollRows = (payrollRes.data ?? []) as Array<{ type?: string; amount?: number }>;
  const payrollRecords = payrollRows
    .filter((row) => ['daily_wage', 'monthly_salary', 'commission'].includes(String(row.type)))
    .reduce((sum, row) => sum + num(row.amount), 0);
  const employeeCommissions = payrollRows
    .filter((row) => row.type === 'commission')
    .reduce((sum, row) => sum + num(row.amount), 0);
  const pitstopFees = (bookingsRes.data ?? []).reduce((sum, row) => sum + num((row as { platform_fee_egp?: number }).platform_fee_egp), 0);
  const unpaidOrders = orders
    .filter((row) => row.payment_status === 'unpaid')
    .reduce((sum, row) => sum + (num(row.total_amount) || num(row.price)), 0);
  const pendingCredits = ((creditsRes.data ?? []) as Array<{ amount_due?: number }>).reduce((sum, row) => sum + num(row.amount_due), 0);
  const payroll = staffExpenses + payrollRecords;
  const totalSales = walkInSales + appBookingSales;
  return {
    totalSales,
    walkInSales,
    appBookingSales,
    washRevenue,
    accessorySales,
    operatingExpenses: rawMaterials + operations,
    rawMaterials,
    operations,
    payroll,
    employeeCommissions,
    pitstopFees,
    pitstopFeesDue: pitstopFees,
    uncollected: unpaidOrders + pendingCredits,
    unpaidOrders,
    pendingCredits,
    netProfit: totalSales - (rawMaterials + operations) - payroll - pitstopFees,
    usedFallbackRange: false,
    isDemo: false,
  };
}

export async function fetchShopAnalytics(
  shopId: string,
  fromIso: string,
  toIso: string,
  options?: { allowFallbackRange?: boolean; allowDemo?: boolean },
): Promise<ShopAnalytics> {
  const primary = await fetchShopAnalyticsRange(shopId, fromIso, toIso);
  if (!isEmptyAnalytics(primary) || !options?.allowFallbackRange) {
    if (isEmptyAnalytics(primary) && options?.allowDemo && typeof __DEV__ !== 'undefined' && __DEV__) {
      return { ...DEMO_SHOP_ANALYTICS };
    }
    return primary;
  }

  const fallbackTo = new Date(toIso);
  const fallbackFrom = new Date(fallbackTo);
  fallbackFrom.setDate(fallbackFrom.getDate() - 30);
  const recent = await fetchShopAnalyticsRange(shopId, fallbackFrom.toISOString(), fallbackTo.toISOString());
  if (!isEmptyAnalytics(recent)) {
    return { ...recent, usedFallbackRange: true };
  }
  if (options?.allowDemo && typeof __DEV__ !== 'undefined' && __DEV__) {
    return { ...DEMO_SHOP_ANALYTICS };
  }
  return primary;
}

export async function fetchShopFinancials(
  shopId: string,
  fromIso: string,
  toIso: string,
): Promise<ShopFinancials> {
  const row = await fetchShopAnalytics(shopId, fromIso, toIso, { allowFallbackRange: true });
  return {
    walkInRevenue: row.walkInSales,
    appBookingRevenue: row.appBookingSales,
    accessorySales: row.accessorySales,
    rawMaterialPurchases: row.rawMaterials,
    operatingExpenses: row.operations,
    payrollAndAdvances: row.payroll,
    pitstopCommissions: row.pitstopFees,
    pitstopFeesDue: row.pitstopFeesDue,
    netProfit: row.netProfit,
  };
}

export async function fetchPeakAnalytics(
  shopId: string,
  bookings: Booking[],
): Promise<{ hours: PeakHourBucket[]; weekdays: PeakWeekdayBucket[] }> {
  const supabase = getSupabase();
  const hourCounts = Array.from({ length: 24 }, () => 0);
  const weekdayCounts = Array.from({ length: 7 }, () => 0);

  for (const booking of bookings) {
    if (booking.status === 'cancelled' || booking.status === 'no_show') continue;
    const at = new Date(booking.scheduledAt);
    hourCounts[at.getHours()] += 1;
    weekdayCounts[at.getDay()] += 1;
  }

  if (supabase) {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const { data } = await supabase
      .from('pos_orders')
      .select('created_at, status')
      .eq('shop_id', shopId)
      .gte('created_at', since.toISOString())
      .neq('status', 'cancelled');
    for (const row of data ?? []) {
      const at = new Date(String((row as { created_at: string }).created_at));
      hourCounts[at.getHours()] += 1;
      weekdayCounts[at.getDay()] += 1;
    }
  }

  const hourAvg = hourCounts.reduce((sum, n) => sum + n, 0) / 24;
  const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return {
    hours: hourCounts.map((count, hour) => ({
      hour,
      count,
      isPeak: count > 0 && count >= Math.max(1, hourAvg * 1.25),
    })),
    weekdays: weekdayCounts.map((count, weekday) => ({
      weekday,
      label: weekdayLabels[weekday],
      count,
    })),
  };
}

export function employeePayDefaults(employee: DbBranchEmployee): {
  dailyWage: string;
  commissionRate: string;
  monthlySalary: string;
} {
  return {
    dailyWage: String(employee.daily_wage ?? 0),
    commissionRate: String(employee.commission_rate ?? 0),
    monthlySalary: String(employee.monthly_salary ?? 0),
  };
}
