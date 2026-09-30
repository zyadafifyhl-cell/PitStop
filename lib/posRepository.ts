/** Car-wash POS queries and RPCs. */
import { getSupabase } from '@/lib/supabase/client';
import type { Booking } from '@/lib/booking/types';
import type { DbBranchEmployee } from '@/lib/supabase/database.types';
import {
  EMPTY_SHOP_FINANCIALS,
  type PayrollRecordType,
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
  const q = query?.trim();
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

export async function fetchShopFinancials(
  shopId: string,
  fromIso: string,
  toIso: string,
): Promise<ShopFinancials> {
  const supabase = getSupabase();
  if (!supabase) return EMPTY_SHOP_FINANCIALS;
  const { data, error } = await supabase.rpc('shop_pos_financials', {
    p_shop_id: shopId,
    p_from: fromIso,
    p_to: toIso,
  });
  if (error || !data || typeof data !== 'object') return EMPTY_SHOP_FINANCIALS;
  const row = data as Record<string, unknown>;
  return {
    walkInRevenue: num(row.walkInRevenue),
    appBookingRevenue: num(row.appBookingRevenue),
    accessorySales: num(row.accessorySales),
    rawMaterialPurchases: num(row.rawMaterialPurchases),
    operatingExpenses: num(row.operatingExpenses),
    payrollAndAdvances: num(row.payrollAndAdvances),
    pitstopCommissions: num(row.pitstopCommissions),
    pitstopFeesDue: num(row.pitstopFeesDue),
    netProfit: num(row.netProfit),
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
