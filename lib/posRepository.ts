/** Car-wash POS queries and RPCs. */
import type { Booking } from '@/lib/booking/types';
import {
    DEMO_SHOP_ANALYTICS,
    EMPTY_SHOP_ANALYTICS,
    type FinanceCardId,
    type FinanceDetailLine,
    type PayrollRecordType,
    type PeakHourBucket,
    type PeakWeekdayBucket,
    type PosCarType,
    type PosJobOrder,
    type PosOrderItemInput,
    type PosShift,
    type PosWorkflowStage,
    type ShopAnalytics,
    type ShopExpenseCategory,
    type ShopFinancials,
    type ShopPosCustomer
} from '@/lib/posTypes';
import { getSupabase } from '@/lib/supabase/client';
import type { DbBranchEmployee } from '@/lib/supabase/database.types';

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
  depositPaid?: number;
  remainingBalance?: number;
  carChassisNumber?: string;
  estimatedDeliveryDate?: string;
  workflowStage?: PosWorkflowStage;
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
    p_payment_status: (input.remainingBalance ?? 0) > 0 ? 'unpaid' : 'paid',
  });
  if (error || typeof data !== 'string') {
    throw error ?? new Error('Could not create POS order');
  }
  const remaining = Math.max(0, input.remainingBalance ?? 0);
  const deposit = Math.max(0, input.depositPaid ?? 0);
  if (deposit > 0 || remaining > 0 || input.carChassisNumber || input.estimatedDeliveryDate || input.workflowStage) {
    await supabase.rpc('pos_apply_detailing_fields', {
      p_order_id: data,
      p_deposit_paid: deposit,
      p_remaining_balance: remaining,
      p_car_chassis_number: input.carChassisNumber ?? null,
      p_estimated_delivery_date: input.estimatedDeliveryDate ?? null,
      p_workflow_stage: input.workflowStage ?? (remaining > 0 ? 'in_progress' : 'ready_for_delivery'),
    });
  }
  return data;
}

export async function listPosJobOrders(shopId: string): Promise<PosJobOrder[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('pos_orders')
    .select('id, shop_id, car_type, price, total_amount, deposit_paid, remaining_balance, car_chassis_number, estimated_delivery_date, workflow_stage, created_at, notes, customers(full_name, phone)')
    .eq('shop_id', shopId)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(80);
  if (error) {
    console.warn('listPosJobOrders', error.message);
    return [];
  }
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const customer = row.customers as { full_name?: string; phone?: string } | { full_name?: string; phone?: string }[] | null;
    const profile = Array.isArray(customer) ? customer[0] : customer;
    const stage = String(row.workflow_stage ?? 'ready_for_delivery');
    return {
      id: String(row.id),
      shopId: String(row.shop_id),
      carType: String(row.car_type ?? ''),
      price: num(row.total_amount) || num(row.price),
      depositPaid: num(row.deposit_paid),
      remainingBalance: num(row.remaining_balance),
      carChassisNumber: row.car_chassis_number ? String(row.car_chassis_number) : undefined,
      estimatedDeliveryDate: row.estimated_delivery_date ? String(row.estimated_delivery_date) : undefined,
      workflowStage:
        stage === 'curing_inspection' || stage === 'in_progress' || stage === 'ready_for_delivery'
          ? stage
          : 'ready_for_delivery',
      createdAt: String(row.created_at),
      notes: row.notes ? String(row.notes) : undefined,
      customerName: profile?.full_name,
      customerPhone: profile?.phone,
    };
  });
}

export async function updatePosOrderWorkflow(orderId: string, stage: PosWorkflowStage): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase is not configured');
  const { error } = await supabase.rpc('pos_update_order_workflow', {
    p_order_id: orderId,
    p_workflow_stage: stage,
  });
  if (error) throw error;
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

export async function deleteShopExpense(expenseId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase is not configured');
  const { error } = await supabase.from('shop_expenses').delete().eq('id', expenseId);
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
    const mapped = mapAnalytics(data as Record<string, unknown>);
    return overlayDetailingBalances(shopId, fromIso, toIso, mapped);
  }
  return fetchShopAnalyticsFallback(shopId, fromIso, toIso);
}

async function overlayDetailingBalances(
  shopId: string,
  fromIso: string,
  toIso: string,
  analytics: ShopAnalytics,
): Promise<ShopAnalytics> {
  const supabase = getSupabase();
  if (!supabase) return analytics;
  const { data } = await supabase
    .from('pos_orders')
    .select('source, deposit_paid, remaining_balance, payment_status, total_amount, price, created_at, status')
    .eq('shop_id', shopId)
    .eq('status', 'completed');
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const inRange = rows.filter((row) => {
    const at = new Date(String(row.created_at ?? ''));
    return at >= new Date(fromIso) && at < new Date(toIso);
  });
  const remaining = rows.reduce((sum, row) => sum + num(row.remaining_balance), 0);
  if (remaining <= 0 && inRange.every((row) => num(row.deposit_paid) <= 0)) return analytics;
  const walkInSales = inRange
    .filter((row) => row.source === 'walk_in')
    .reduce((sum, row) => {
      if (num(row.deposit_paid) > 0) return sum + num(row.deposit_paid);
      if (row.payment_status === 'paid') return sum + (num(row.total_amount) || num(row.price));
      return sum;
    }, 0);
  const unpaidWithoutBalance = rows
    .filter((row) => row.payment_status === 'unpaid' && num(row.remaining_balance) <= 0)
    .reduce((sum, row) => sum + (num(row.total_amount) || num(row.price)), 0);
  const unpaidOrders = remaining + unpaidWithoutBalance;
  return {
    ...analytics,
    walkInSales: walkInSales || analytics.walkInSales,
    totalSales: (walkInSales || analytics.walkInSales) + analytics.appBookingSales,
    unpaidOrders,
    uncollected: unpaidOrders + analytics.pendingCredits,
  };
}

async function fetchShopAnalyticsFallback(shopId: string, fromIso: string, toIso: string): Promise<ShopAnalytics> {
  const supabase = getSupabase();
  if (!supabase) return EMPTY_SHOP_ANALYTICS;
  const from = new Date(fromIso);
  const to = new Date(toIso);

  const [ordersRes, itemsRes, expensesRes, payrollRes, bookingsRes, creditsRes] = await Promise.all([
    supabase
      .from('pos_orders')
      .select('source, status, price, total_amount, payment_status, pitstop_commission, created_at, deposit_paid, remaining_balance')
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
    .reduce((sum, row) => {
      if (num(row.deposit_paid) > 0) return sum + num(row.deposit_paid);
      if (row.payment_status === 'paid') return sum + (num(row.total_amount) || num(row.price));
      return sum;
    }, 0);
  const posAppSales = orders
    .filter((row) => row.source === 'pitstop_app')
    .reduce((sum, row) => {
      if (num(row.deposit_paid) > 0) return sum + num(row.deposit_paid);
      if (row.payment_status === 'paid') return sum + (num(row.total_amount) || num(row.price));
      return sum;
    }, 0);
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
  const unpaidOrders = orders.reduce((sum, row) => {
    if (num(row.remaining_balance) > 0) return sum + num(row.remaining_balance);
    if (row.payment_status === 'unpaid') return sum + (num(row.total_amount) || num(row.price));
    return sum;
  }, 0);
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

function money(row: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    if (row[key] != null) return num(row[key]);
  }
  return 0;
}

function isoOrUndefined(value: unknown): string | undefined {
  if (!value) return undefined;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export async function fetchFinanceCardDetails(
  shopId: string,
  card: FinanceCardId,
  fromIso: string,
  toIso: string,
): Promise<FinanceDetailLine[]> {
  const supabase = getSupabase();
  if (!supabase || card === 'profit') return [];

  const from = new Date(fromIso);
  const to = new Date(toIso);

  if (card === 'sales') {
    const [ordersRes, bookingsRes] = await Promise.all([
      supabase
        .from('pos_orders')
        .select('id, source, price, total_amount, car_type, created_at, payment_status')
        .eq('shop_id', shopId)
        .eq('status', 'completed')
        .gte('created_at', fromIso)
        .lt('created_at', toIso)
        .order('created_at', { ascending: false })
        .limit(80),
      supabase
        .from('bookings')
        .select('id, booking_type, status, service_name, service_name_ar, customer_phone, scheduled_at, final_amount_paid_egp, service_price_egp, total_price')
        .eq('shop_id', shopId)
        .eq('booking_type', 'app')
        .in('status', ['done', 'confirmed', 'in_progress'])
        .gte('scheduled_at', fromIso)
        .lt('scheduled_at', toIso)
        .order('scheduled_at', { ascending: false })
        .limit(80),
    ]);
    const orders = ((ordersRes.data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: `order:${row.id}`,
      title: row.source === 'walk_in' ? 'walk_in' : 'app',
      subtitle: row.car_type ? String(row.car_type) : undefined,
      amount: money(row, 'total_amount', 'price'),
      at: isoOrUndefined(row.created_at),
    }));
    const bookings = ((bookingsRes.data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: `booking:${row.id}`,
      title: 'booking',
      subtitle: String(row.service_name_ar || row.service_name || row.customer_phone || ''),
      amount: money(row, 'final_amount_paid_egp', 'service_price_egp', 'total_price'),
      at: isoOrUndefined(row.scheduled_at),
    }));
    return [...orders, ...bookings].sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')));
  }

  if (card === 'expenses') {
    const { data } = await supabase
      .from('shop_expenses')
      .select('id, category, item_name, title, amount, created_at, recorded_at')
      .eq('shop_id', shopId)
      .in('category', ['raw_materials', 'utilities', 'tea_food', 'maintenance', 'other'])
      .order('recorded_at', { ascending: false })
      .limit(120);
    return ((data ?? []) as Record<string, unknown>[])
      .filter((row) => {
        const at = new Date(String(row.created_at ?? row.recorded_at ?? ''));
        return at >= from && at < to;
      })
      .map((row) => ({
        id: String(row.id),
        title: String(row.item_name || row.title || row.category || ''),
        subtitle: row.category ? String(row.category) : undefined,
        amount: num(row.amount),
        at: isoOrUndefined(row.recorded_at ?? row.created_at),
      }));
  }

  if (card === 'payroll') {
    const [payrollRes, expenseRes] = await Promise.all([
      supabase
        .from('employee_payroll_records')
        .select('id, type, amount, date, notes, branch_employees(full_name)')
        .eq('shop_id', shopId)
        .gte('date', fromIso.slice(0, 10))
        .lt('date', toIso.slice(0, 10))
        .order('date', { ascending: false })
        .limit(80),
      supabase
        .from('shop_expenses')
        .select('id, category, item_name, title, amount, created_at, recorded_at')
        .eq('shop_id', shopId)
        .in('category', ['staff_advance', 'staff_wage', 'labor_advance'])
        .order('recorded_at', { ascending: false })
        .limit(80),
    ]);
    const payroll = ((payrollRes.data ?? []) as Record<string, unknown>[]).map((row) => {
      const employee = row.branch_employees as { full_name?: string } | { full_name?: string }[] | null;
      const name = Array.isArray(employee) ? employee[0]?.full_name : employee?.full_name;
      return {
        id: `pay:${row.id}`,
        title: String(row.type || 'payroll'),
        subtitle: name || (row.notes ? String(row.notes) : undefined),
        amount: num(row.amount),
        at: isoOrUndefined(row.date),
      };
    });
    const expenses = ((expenseRes.data ?? []) as Record<string, unknown>[])
      .filter((row) => {
        const at = new Date(String(row.created_at ?? row.recorded_at ?? ''));
        return at >= from && at < to;
      })
      .map((row) => ({
        id: `exp:${row.id}`,
        title: String(row.category || 'staff_wage'),
        subtitle: String(row.item_name || row.title || ''),
        amount: num(row.amount),
        at: isoOrUndefined(row.recorded_at ?? row.created_at),
      }));
    return [...payroll, ...expenses].sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')));
  }

  const [ordersRes, creditsRes] = await Promise.all([
    supabase
      .from('pos_orders')
      .select('id, source, price, total_amount, car_type, created_at, payment_status')
      .eq('shop_id', shopId)
      .eq('status', 'completed')
      .eq('payment_status', 'unpaid')
      .order('created_at', { ascending: false })
      .limit(80),
    supabase
      .from('customer_credits')
      .select('id, agency_name, amount_due, created_at, status')
      .eq('shop_id', shopId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(80),
  ]);
  const unpaid = ((ordersRes.data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: `unpaid:${row.id}`,
    title: 'unpaid',
    subtitle: row.car_type ? String(row.car_type) : undefined,
    amount: money(row, 'total_amount', 'price'),
    at: isoOrUndefined(row.created_at),
  }));
  const credits = ((creditsRes.data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: `credit:${row.id}`,
    title: 'credit',
    subtitle: row.agency_name ? String(row.agency_name) : undefined,
    amount: num(row.amount_due),
    at: isoOrUndefined(row.created_at),
  }));
  return [...unpaid, ...credits];
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
