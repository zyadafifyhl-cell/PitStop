import AsyncStorage from '@react-native-async-storage/async-storage';

import { pushOwnerNotification } from '@/lib/booking/commerceEvents';
import { formatBookingDateTime, shopTypeLabel } from '@/lib/booking/format';
import { recordWashBookingDone } from '@/lib/booking/loyaltyStampsStorage';
import type { Booking, BookingStatus } from '@/lib/booking/types';
import { pushWashCenterNotification } from '@/lib/booking/wash/washNotificationCenter';
import { phoneLookupVariants, phonesEqual } from '@/lib/phone';
import { sendShopPushForBooking } from '@/lib/push/shopPush';
import { getSupabase } from '@/lib/supabase/client';

const REMOTE_QUERY_TIMEOUT_MS = 6000;

async function withRemoteTimeout<T>(promise: PromiseLike<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), REMOTE_QUERY_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchBookingsForPhoneRemote(phone: string): Promise<Booking[] | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const phoneVariants = phoneLookupVariants(phone);
  const response = await withRemoteTimeout(
    supabase
      .from('bookings')
      .select('*')
      .in('customer_phone', phoneVariants.length ? phoneVariants : [phone])
      .order('scheduled_at', { ascending: false }),
    null,
  );
  if (!response || response.error || !response.data) return null;
  return (response.data as BookingRow[]).map(mapBookingRow);
}

const BOOKINGS_KEY = '@pitstop/bookings/v1';
const CUSTOMER_PHONE_KEY = '@pitstop/bookings/customer-phone';
const PLATFORM_FEE_RATE = 0.12;

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function notifyWashOwnerBooking(
  booking: Booking,
  kind: 'new_booking' | 'cancelled_booking',
): Promise<void> {
  if (booking.shopType !== 'wash') return;
  const when = formatBookingDateTime(booking.scheduledAt, 'en');
  await pushWashCenterNotification({
    shopId: booking.shopId,
    branchId: booking.branchId,
    kind,
    title: kind === 'new_booking' ? 'New booking request' : 'Booking cancelled',
    body: `${booking.customerPhone} · ${booking.carType} · ${when}`,
    bookingId: booking.id,
  });
}

function defaultServicePriceEgp(shopType: Booking['shopType']): number {
  if (shopType === 'maintenance') return 650;
  if (shopType === 'wash') return 220;
  if (shopType === 'winch') return 500;
  return 420;
}

function isUuid(value: string | undefined): value is string {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

type BookingRow = {
  id: string;
  shop_id: string;
  shop_type: Booking['shopType'];
  customer_id?: string | null;
  customer_phone: string;
  car_type: string;
  car_color: string | null;
  service_price_egp: number | string | null;
  platform_fee_egp: number | string | null;
  scheduled_at: string;
  status: BookingStatus;
  created_at: string;
};

function mapBookingRow(row: BookingRow): Booking {
  return {
    id: row.id,
    shopId: row.shop_id,
    shopType: row.shop_type,
    customerId: row.customer_id ?? undefined,
    customerPhone: row.customer_phone,
    carType: row.car_type,
    carColor: row.car_color ?? '',
    servicePriceEgp: Number(row.service_price_egp ?? 0),
    platformFeeEgp: Number(row.platform_fee_egp ?? 0),
    scheduledAt: row.scheduled_at,
    status: row.status,
    createdAt: row.created_at,
  };
}

async function readAll(): Promise<Booking[]> {
  try {
    const raw = await AsyncStorage.getItem(BOOKINGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Booking[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAll(bookings: Booking[]): Promise<void> {
  await AsyncStorage.setItem(BOOKINGS_KEY, JSON.stringify(bookings));
}

async function upsertLocalBooking(booking: Booking): Promise<void> {
  const rows = await readAll();
  const idx = rows.findIndex((b) => b.id === booking.id);
  if (idx >= 0) rows[idx] = booking;
  else rows.push(booking);
  await writeAll(rows);
}

function mergeBookings(remote: Booking[], local: Booking[]): Booking[] {
  const localById = new Map(local.map((row) => [row.id, row]));
  const merged = remote.map((row) => {
    const cached = localById.get(row.id);
    if (!cached) return row;
    if (cached.status === row.status) return row;
    return { ...row, status: cached.status };
  });
  for (const row of local) {
    if (!merged.some((item) => item.id === row.id)) merged.push(row);
  }
  return merged;
}

async function sendOwnerBookingPush(booking: Booking): Promise<void> {
  const when = new Date(booking.scheduledAt);
  const whenEn = when.toLocaleString('en-EG');
  const whenAr = when.toLocaleString('ar-EG');
  await sendShopPushForBooking({
    shopId: booking.shopId,
    serviceLabelEn: shopTypeLabel(booking.shopType, 'en'),
    serviceLabelAr: shopTypeLabel(booking.shopType, 'ar'),
    customerPhone: booking.customerPhone,
    whenEn,
    whenAr,
    bookingId: booking.id,
  });
}

export async function listBookingsForShop(shopId: string): Promise<Booking[]> {
  const supabase = getSupabase();
  let rows: Booking[] = [];
  if (supabase) {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('shop_id', shopId)
      .order('scheduled_at', { ascending: true });

    if (!error && data) rows = (data as BookingRow[]).map(mapBookingRow);
  }

  if (rows.length === 0) {
    const localRows = await readAll();
    rows = localRows.filter((b) => b.shopId === shopId);
  } else {
    const localRows = (await readAll()).filter((b) => b.shopId === shopId);
    rows = mergeBookings(rows, localRows);
  }

  const dedup = new Map<string, Booking>();
  for (const row of rows) dedup.set(row.id, row);
  return [...dedup.values()].sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
}

export async function listBookingsForPhone(phone: string): Promise<Booking[]> {
  const localRows = (await readAll()).filter((b) => phonesEqual(b.customerPhone, phone));
  const remoteRows = await fetchBookingsForPhoneRemote(phone);
  if (remoteRows) {
    return mergeBookings(remoteRows, localRows).sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
  }
  return localRows.sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
}

export async function createBooking(
  input: Omit<Booking, 'id' | 'status' | 'createdAt'>,
): Promise<Booking> {
  const servicePriceEgp = Math.max(
    0,
    Math.round((input.servicePriceEgp ?? defaultServicePriceEgp(input.shopType)) * 100) / 100,
  );
  const platformFeeEgp = Math.round(servicePriceEgp * PLATFORM_FEE_RATE * 100) / 100;
  const booking: Booking = {
    ...input,
    servicePriceEgp,
    platformFeeEgp,
    id: newId(),
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from('bookings')
      .insert({
        shop_id: input.shopId,
        shop_type: input.shopType,
        customer_id: isUuid(input.customerId) ? input.customerId : null,
        customer_phone: input.customerPhone,
        car_type: input.carType,
        car_color: input.carColor,
        service_price_egp: servicePriceEgp,
        platform_fee_egp: platformFeeEgp,
        scheduled_at: input.scheduledAt,
        status: 'pending',
      })
      .select('*')
      .single();

    if (!error && data) {
      const created = mapBookingRow(data as BookingRow);
      await upsertLocalBooking(created);
      await pushOwnerNotification({
        shopId: created.shopId,
        kind: 'service_booking',
        customerPhone: created.customerPhone,
        bookingId: created.id,
        shopType: created.shopType,
        carType: created.carType,
        scheduledAt: created.scheduledAt,
        totalEgp: created.servicePriceEgp,
      });
      await notifyWashOwnerBooking(created, 'new_booking');
      await sendOwnerBookingPush(created);
      return created;
    }
    if (error) {
      throw new Error(error.message);
    }
  }

  await upsertLocalBooking(booking);
  await pushOwnerNotification({
    shopId: booking.shopId,
    kind: 'service_booking',
    customerPhone: booking.customerPhone,
    bookingId: booking.id,
    shopType: booking.shopType,
    carType: booking.carType,
    scheduledAt: booking.scheduledAt,
    totalEgp: booking.servicePriceEgp,
  });
  await notifyWashOwnerBooking(booking, 'new_booking');
  await sendOwnerBookingPush(booking);
  return booking;
}

export async function updateBookingStatus(
  bookingId: string,
  status: BookingStatus,
  fallback?: Booking,
  patch?: Partial<Pick<Booking, 'ownerRejectionNote'>>,
): Promise<Booking | null> {
  const rows = await readAll();
  const localIdx = rows.findIndex((b) => b.id === bookingId);
  const previousStatus = localIdx >= 0 ? rows[localIdx].status : fallback?.status;
  let updated: Booking | null = localIdx >= 0 ? { ...rows[localIdx], status, ...patch } : null;

  if (!updated && fallback && fallback.id === bookingId) {
    updated = { ...fallback, status, ...patch };
  }

  if (!updated) {
    const supabase = getSupabase();
    if (supabase) {
      const { data } = await supabase.from('bookings').select('*').eq('id', bookingId).maybeSingle();
      if (data) updated = { ...mapBookingRow(data as BookingRow), status };
    }
  }

  if (!updated) return null;

  await upsertLocalBooking(updated);

  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from('bookings')
      .update({ status })
      .eq('id', bookingId)
      .select('*')
      .maybeSingle();

    if (!error && data) {
      updated = mapBookingRow(data as BookingRow);
      await upsertLocalBooking(updated);
    }
  }

  if (updated && status === 'cancelled' && previousStatus !== 'cancelled') {
    await notifyWashOwnerBooking(updated, 'cancelled_booking');
  }

  if (updated && status === 'done' && previousStatus !== 'done') {
    await recordWashBookingDone(updated, previousStatus);
  }

  return updated;
}

export async function deleteBookingForShop(shopId: string, bookingId: string): Promise<boolean> {
  const rows = await readAll();
  const target = rows.find((b) => b.id === bookingId && b.shopId === shopId);
  if (!target) return false;
  await writeAll(rows.filter((b) => b.id !== bookingId));

  const supabase = getSupabase();
  if (supabase && isUuid(bookingId)) {
    await supabase.from('bookings').delete().eq('id', bookingId).eq('shop_id', shopId);
  }
  return true;
}

export async function clearShopBookingHistory(shopId: string): Promise<number> {
  const rows = await readAll();
  const removed = rows.filter((b) => b.shopId === shopId);
  await writeAll(rows.filter((b) => b.shopId !== shopId));

  const supabase = getSupabase();
  if (supabase) {
    await supabase.from('bookings').delete().eq('shop_id', shopId);
  }
  return removed.length;
}

export async function getSavedCustomerPhone(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(CUSTOMER_PHONE_KEY);
  } catch {
    return null;
  }
}

export async function saveCustomerPhone(phone: string): Promise<void> {
  await AsyncStorage.setItem(CUSTOMER_PHONE_KEY, phone);
}

export async function clearCustomerBookingHistory(input: {
  phone: string;
  customerId?: string;
}): Promise<void> {
  const normalizedPhone = input.phone.trim();
  const rows = await readAll();
  const kept = rows.filter((booking) => {
    if (booking.customerPhone.trim() === normalizedPhone) return false;
    if (input.customerId && booking.customerId === input.customerId) return false;
    return true;
  });
  await writeAll(kept);

  const supabase = getSupabase();
  if (supabase && input.customerId && isUuid(input.customerId)) {
    const { error } = await supabase.from('bookings').delete().eq('customer_id', input.customerId);
    if (error) console.warn('Failed to delete remote bookings:', error.message);
  }
}
