import AsyncStorage from '@react-native-async-storage/async-storage';

import { pushOwnerNotification } from '@/lib/booking/commerceEvents';
import { registerCouponUsageRemote } from '@/lib/booking/couponRepository';
import { formatBookingDateTime, shopTypeLabel } from '@/lib/booking/format';
import {
  deductMerchantLoyaltyPointsRemote,
  recordMerchantLoyaltyPointsOnDone,
} from '@/lib/booking/merchantLoyaltyRepository';
import { recordWashBookingDone } from '@/lib/booking/loyaltyStampsStorage';
import { handleBookingConfirmed } from '@/lib/booking/bookingLifecycle';
import {
  applyCampaignPrice,
  computePlatformFee,
  PLATFORM_FEE_RATE,
} from '@/lib/booking/offerPricing';
import {
  OfferValidationError,
  countDoneBookingsForCustomerAtShop,
  validateOfferForBooking,
} from '@/lib/booking/offerRepository';
import type { Booking, BookingStatus, BookingType } from '@/lib/booking/types';
import { resolveRemoteBranchId } from '@/lib/booking/wash/branchRepository';
import { pushWashCenterNotification } from '@/lib/booking/wash/washNotificationCenter';
import { normalizePhoneE164, phoneLookupVariants, phonesEqual } from '@/lib/phone';
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

/** Grace period after scheduled_at before a confirmed booking is treated as done. */
export const AUTO_DONE_AFTER_MS = 60 * 60 * 1000;

export function isConfirmedPastAutoDoneWindow(scheduledAt: string, now = Date.now()): boolean {
  const scheduledMs = new Date(scheduledAt).getTime();
  if (Number.isNaN(scheduledMs)) return false;
  return now - scheduledMs > AUTO_DONE_AFTER_MS;
}

/** Virtual lifecycle: stale confirmed/in_progress slots become done at read time. */
export function resolveEffectiveBookingStatus(booking: Booking, now = Date.now()): BookingStatus {
  if (booking.status === 'suspended_by_shop') return booking.status;
  if (
    (booking.status === 'confirmed' || booking.status === 'in_progress') &&
    isConfirmedPastAutoDoneWindow(booking.scheduledAt, now)
  ) {
    return 'done';
  }
  return booking.status;
}

export function applyVirtualBookingLifecycle(booking: Booking, now = Date.now()): Booking {
  const effectiveStatus = resolveEffectiveBookingStatus(booking, now);
  if (effectiveStatus === booking.status) {
    return booking.lifecycleAutoCompleted ? { ...booking, lifecycleAutoCompleted: undefined } : booking;
  }
  return {
    ...booking,
    status: effectiveStatus,
    lifecycleAutoCompleted: true,
  };
}

export function applyVirtualBookingLifecycleBatch(bookings: Booking[], now = Date.now()): Booking[] {
  return bookings.map((row) => applyVirtualBookingLifecycle(row, now));
}

export function isAutoCompletedBooking(booking: Booking): boolean {
  return !!booking.lifecycleAutoCompleted;
}

/** Revenue reports count only persisted completed washes — never cancelled/no-show or auto-completed placeholders. */
export function countsAsRevenueBooking(booking: Booking): boolean {
  return booking.status === 'done' && !booking.lifecycleAutoCompleted;
}

export function isFinalizedHistoryBooking(booking: Booking): boolean {
  return (
    booking.status === 'done' ||
    booking.status === 'cancelled' ||
    booking.status === 'no_show' ||
    isAutoCompletedBooking(booking)
  );
}

/** Active bookings surface first; finalized history sinks below. */
function bookingDisplayTier(status: BookingStatus): 0 | 1 {
  if (status === 'pending' || status === 'confirmed' || status === 'in_progress') return 0;
  return 1;
}

/**
 * Two-tier display sort:
 * 1) Active (pending/confirmed) above finalized (done/cancelled/no_show)
 * 2) Newest scheduled_at first within each tier
 */
export function sortBookingsByScheduledAtDesc(bookings: Booking[]): Booking[] {
  return [...bookings].sort((a, b) => {
    const tierDiff = bookingDisplayTier(a.status) - bookingDisplayTier(b.status);
    if (tierDiff !== 0) return tierDiff;
    return new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime();
  });
}

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
  branch_id?: string | null;
  shop_type: Booking['shopType'];
  customer_id?: string | null;
  customer_phone?: string | null;
  customer_name?: string | null;
  car_type: string;
  car_color: string | null;
  service_id?: string | null;
  service_name?: string | null;
  service_name_ar?: string | null;
  service_price_egp: number | string | null;
  platform_fee_egp: number | string | null;
  original_price_egp?: number | string | null;
  points_redeemed?: number | null;
  discount_applied_egp?: number | string | null;
  final_amount_paid_egp?: number | string | null;
  offer_id?: string | null;
  customer_notes?: string | null;
  owner_rejection_note?: string | null;
  booking_type?: BookingType | null;
  scheduled_at: string;
  status: BookingStatus;
  created_at: string;
};

export type CreateBookingOptions = {
  bookingType?: BookingType;
  initialStatus?: BookingStatus;
  /** Skip owner push notification (walk-in POS). */
  skipOwnerPush?: boolean;
  /** Applied coupon id to lock usage after booking creation. */
  appliedCouponId?: string;
  /** Auth user id for coupon usage logging. */
  couponUsageUserId?: string;
  /** Per-merchant loyalty redemption at checkout. */
  loyaltyCheckout?: {
    originalPriceEgp: number;
    pointsRedeemed: number;
    discountAppliedEgp: number;
    finalAmountPaidEgp: number;
  };
};

export type WalkInBookingInput = {
  shopId: string;
  branchId: string;
  carType: string;
  customerPhone?: string;
  customerId?: string;
  skipPhoneLookup?: boolean;
  serviceId?: string;
  serviceName: string;
  serviceNameAr?: string;
  servicePriceEgp: number;
  serviceDurationMinutes?: number;
  customerNotes?: string;
  initialStatus?: BookingStatus;
};

function mapBookingRow(row: BookingRow): Booking {
  return {
    id: row.id,
    shopId: row.shop_id,
    branchId: row.branch_id ?? undefined,
    shopType: row.shop_type,
    customerId: row.customer_id ?? undefined,
    customerPhone: row.customer_phone ?? '',
    customerName: row.customer_name ?? undefined,
    carType: row.car_type,
    carColor: row.car_color ?? '',
    serviceId: row.service_id ?? undefined,
    serviceName: row.service_name ?? undefined,
    serviceNameAr: row.service_name_ar ?? undefined,
    servicePriceEgp: Number(row.service_price_egp ?? 0),
    platformFeeEgp: Number(row.platform_fee_egp ?? 0),
    originalPriceEgp: row.original_price_egp != null ? Number(row.original_price_egp) : undefined,
    pointsRedeemed: row.points_redeemed ?? undefined,
    discountAppliedEgp:
      row.discount_applied_egp != null ? Number(row.discount_applied_egp) : undefined,
    finalAmountPaidEgp:
      row.final_amount_paid_egp != null ? Number(row.final_amount_paid_egp) : undefined,
    offerId: row.offer_id ?? undefined,
    customerNotes: row.customer_notes ?? undefined,
    ownerRejectionNote: row.owner_rejection_note ?? undefined,
    bookingType: row.booking_type ?? 'app',
    scheduledAt: row.scheduled_at,
    status: row.status,
    createdAt: row.created_at,
  };
}

async function resolveBranchIdForRemote(shopId: string, branchId: string): Promise<string | undefined> {
  if (isUuid(branchId)) return branchId;
  const resolved = await resolveRemoteBranchId(shopId, branchId);
  return resolved ?? undefined;
}

export async function resolveCustomerIdByPhoneRemote(phone?: string): Promise<string | undefined> {
  const trimmed = phone?.trim();
  if (!trimmed) return undefined;

  const supabase = getSupabase();
  if (!supabase) return undefined;

  const normalized = normalizePhoneE164(trimmed) ?? trimmed;
  const { data, error } = await supabase.rpc('resolve_customer_id_by_phone', { p_phone: normalized });
  if (error || !data) return undefined;
  return isUuid(String(data)) ? String(data) : undefined;
}

function buildBookingInsertRow(
  input: Omit<Booking, 'id' | 'status' | 'createdAt'>,
  params: {
    servicePriceEgp: number;
    platformFeeEgp: number;
    status: BookingStatus;
    bookingType: BookingType;
    branchId?: string;
    loyaltyCheckout?: CreateBookingOptions['loyaltyCheckout'];
  },
): Record<string, unknown> {
  const row: Record<string, unknown> = {
    shop_id: input.shopId,
    branch_id: params.branchId ?? null,
    shop_type: input.shopType,
    customer_id: isUuid(input.customerId) ? input.customerId : null,
    customer_phone: input.customerPhone?.trim() || null,
    customer_name: input.customerName ?? null,
    car_type: input.carType,
    car_color: input.carColor || '',
    service_id: isUuid(input.serviceId) ? input.serviceId : null,
    service_name: input.serviceName ?? null,
    service_name_ar: input.serviceNameAr ?? null,
    service_price_egp: params.servicePriceEgp,
    platform_fee_egp: params.platformFeeEgp,
    customer_notes: input.customerNotes ?? null,
    booking_type: params.bookingType,
    scheduled_at: input.scheduledAt,
    status: params.status,
  };
  if (isUuid(input.offerId)) {
    row.offer_id = input.offerId;
  }
  if (params.loyaltyCheckout) {
    row.original_price_egp = params.loyaltyCheckout.originalPriceEgp;
    row.points_redeemed = params.loyaltyCheckout.pointsRedeemed;
    row.discount_applied_egp = params.loyaltyCheckout.discountAppliedEgp;
    row.final_amount_paid_egp = params.loyaltyCheckout.finalAmountPaidEgp;
  } else {
    row.original_price_egp = params.servicePriceEgp;
    row.final_amount_paid_egp = params.servicePriceEgp;
  }
  return row;
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

/** Patch local booking cache after remote bulk status updates. */
export async function syncLocalBookingsFromRemote(bookings: Booking[]): Promise<void> {
  for (const booking of bookings) {
    await upsertLocalBooking(booking);
  }
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
      .order('scheduled_at', { ascending: false });

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
  return sortBookingsByScheduledAtDesc(applyVirtualBookingLifecycleBatch([...dedup.values()]));
}

export async function listBookingsForPhone(phone: string): Promise<Booking[]> {
  const localRows = (await readAll()).filter((b) => phonesEqual(b.customerPhone, phone));
  const remoteRows = await fetchBookingsForPhoneRemote(phone);
  if (remoteRows) {
    return sortBookingsByScheduledAtDesc(mergeBookings(remoteRows, localRows));
  }
  return sortBookingsByScheduledAtDesc(localRows);
}

const HOME_NEXT_BOOKING_STATUSES = new Set<BookingStatus>(['pending', 'confirmed']);

/** True when a booking should appear in the Home "My next booking" card. */
export function isHomeNextUpcomingBooking(booking: Booking, now = Date.now()): boolean {
  const effective = applyVirtualBookingLifecycle(booking, now);
  if (!HOME_NEXT_BOOKING_STATUSES.has(effective.status)) return false;
  const scheduledMs = new Date(effective.scheduledAt).getTime();
  if (Number.isNaN(scheduledMs)) return false;
  return scheduledMs >= now;
}

/** Closest upcoming pending/confirmed booking from an in-memory list. */
export function pickNextUpcomingBooking(bookings: Booking[], now = Date.now()): Booking | null {
  return (
    bookings
      .filter((row) => isHomeNextUpcomingBooking(row, now))
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0] ?? null
  );
}

/** Fetch the single closest upcoming booking for the Home card (Supabase-first, local fallback). */
export async function fetchNextUpcomingBookingForPhone(phone: string, now = Date.now()): Promise<Booking | null> {
  const nowIso = new Date(now).toISOString();
  const supabase = getSupabase();

  if (supabase) {
    const phoneVariants = phoneLookupVariants(phone);
    const response = await withRemoteTimeout(
      supabase
        .from('bookings')
        .select('*')
        .in('customer_phone', phoneVariants.length ? phoneVariants : [phone])
        .in('status', ['pending', 'confirmed'])
        .gte('scheduled_at', nowIso)
        .order('scheduled_at', { ascending: true })
        .limit(1),
      null,
    );

    if (response && !response.error && response.data?.length) {
      const candidate = applyVirtualBookingLifecycle(mapBookingRow(response.data[0] as BookingRow), now);
      if (isHomeNextUpcomingBooking(candidate, now)) return candidate;
    }
  }

  const localRows = (await readAll()).filter((b) => phonesEqual(b.customerPhone, phone));
  return pickNextUpcomingBooking(localRows, now);
}

export async function getBookingForCustomer(bookingId: string, phone: string): Promise<Booking | null> {
  const rows = await listBookingsForPhone(phone);
  return rows.find((row) => row.id === bookingId) ?? null;
}

export async function createBooking(
  input: Omit<Booking, 'id' | 'status' | 'createdAt'>,
  options?: CreateBookingOptions,
): Promise<Booking> {
  const bookingType = options?.bookingType ?? input.bookingType ?? 'app';
  const initialStatus = options?.initialStatus ?? 'pending';
  const branchId = input.branchId ? await resolveBranchIdForRemote(input.shopId, input.branchId) : undefined;
  const baseServicePriceEgp = Math.max(
    0,
    Math.round((input.servicePriceEgp ?? defaultServicePriceEgp(input.shopType)) * 100) / 100,
  );
  let servicePriceEgp = baseServicePriceEgp;
  let resolvedOfferId = input.offerId;

  if (input.offerId) {
    try {
      const offer = await validateOfferForBooking(input.shopId, input.offerId);
      const doneCount =
        offer.offerType === 'buy_x_get_y'
          ? await countDoneBookingsForCustomerAtShop({
              shopId: input.shopId,
              customerId: input.customerId,
              customerPhone: input.customerPhone,
            })
          : 0;
      servicePriceEgp = applyCampaignPrice(baseServicePriceEgp, offer, doneCount);
      resolvedOfferId = offer.id;
    } catch (error) {
      if (error instanceof OfferValidationError) {
        throw error;
      }
      throw error;
    }
  }

  const platformFeeEgp = computePlatformFee(
    options?.loyaltyCheckout?.finalAmountPaidEgp ?? servicePriceEgp,
    PLATFORM_FEE_RATE,
  );
  const booking: Booking = {
    ...input,
    offerId: resolvedOfferId,
    branchId: branchId ?? input.branchId,
    bookingType,
    servicePriceEgp: options?.loyaltyCheckout?.finalAmountPaidEgp ?? servicePriceEgp,
    platformFeeEgp,
    originalPriceEgp: options?.loyaltyCheckout?.originalPriceEgp ?? servicePriceEgp,
    pointsRedeemed: options?.loyaltyCheckout?.pointsRedeemed ?? 0,
    discountAppliedEgp: options?.loyaltyCheckout?.discountAppliedEgp ?? 0,
    finalAmountPaidEgp: options?.loyaltyCheckout?.finalAmountPaidEgp ?? servicePriceEgp,
    id: newId(),
    status: initialStatus,
    createdAt: new Date().toISOString(),
  };

  const supabase = getSupabase();
  if (supabase) {
    const insertRow = buildBookingInsertRow(
      { ...input, offerId: resolvedOfferId },
      {
        servicePriceEgp: booking.servicePriceEgp ?? servicePriceEgp,
        platformFeeEgp,
        status: initialStatus,
        bookingType,
        branchId,
        loyaltyCheckout: options?.loyaltyCheckout,
      },
    );
    const { data, error } = await supabase.from('bookings').insert(insertRow).select('*').single();

    if (!error && data) {
      const created = mapBookingRow(data as BookingRow);
      if (options?.appliedCouponId && options?.couponUsageUserId) {
        const usageSaved = await registerCouponUsageRemote({
          couponId: options.appliedCouponId,
          userId: options.couponUsageUserId,
          bookingId: created.id,
        });
        if (!usageSaved) {
          await supabase.from('bookings').delete().eq('id', created.id);
          throw new Error('Coupon usage log failed');
        }
      }
      await upsertLocalBooking(created);
      if (
        options?.loyaltyCheckout &&
        options.loyaltyCheckout.pointsRedeemed > 0 &&
        isUuid(created.id) &&
        isUuid(input.customerId)
      ) {
        try {
          await deductMerchantLoyaltyPointsRemote({
            userId: input.customerId,
            shopId: created.shopId,
            bookingId: created.id,
            pointsToRedeem: options.loyaltyCheckout.pointsRedeemed,
            discountEgp: options.loyaltyCheckout.discountAppliedEgp,
          });
        } catch (loyaltyError) {
          console.warn('Merchant loyalty deduction failed (non-blocking):', loyaltyError);
        }
      }
      if (bookingType !== 'walk_in') {
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
        if (!options?.skipOwnerPush) {
          await sendOwnerBookingPush(created);
        }
      } else {
        await notifyWashOwnerBooking(created, 'new_booking');
      }
      return created;
    }
    if (error) {
      throw new Error(error.message);
    }
  }

  await upsertLocalBooking(booking);
  if (bookingType !== 'walk_in') {
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
    if (!options?.skipOwnerPush) {
      await sendOwnerBookingPush(booking);
    }
  } else {
    await notifyWashOwnerBooking(booking, 'new_booking');
  }
  return booking;
}

export async function createWalkInBooking(input: WalkInBookingInput): Promise<Booking> {
  const carType = input.carType.trim();
  if (!carType) {
    throw new Error('Car type is required');
  }
  if (!input.serviceName.trim()) {
    throw new Error('Service is required');
  }

  const phoneRaw = input.customerPhone?.trim();
  const customerPhone = phoneRaw ? normalizePhoneE164(phoneRaw) ?? phoneRaw : undefined;
  const customerId =
    input.customerId ??
    (input.skipPhoneLookup ? undefined : customerPhone ? await resolveCustomerIdByPhoneRemote(customerPhone) : undefined);

  return createBooking(
    {
      shopId: input.shopId,
      shopType: 'wash',
      branchId: input.branchId,
      customerId,
      customerPhone: customerPhone ?? '',
      carType,
      carColor: '',
      scheduledAt: new Date().toISOString(),
      serviceId: input.serviceId,
      serviceName: input.serviceName,
      serviceNameAr: input.serviceNameAr,
      serviceDurationMinutes: input.serviceDurationMinutes,
      servicePriceEgp: input.servicePriceEgp,
      customerNotes: input.customerNotes?.trim() || undefined,
      bookingType: 'walk_in',
    },
    {
      bookingType: 'walk_in',
      initialStatus: input.initialStatus ?? 'confirmed',
      skipOwnerPush: true,
    },
  );
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

  let remoteSynced = false;

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
      remoteSynced = true;
    }
  } else {
    remoteSynced = true;
  }

  if (updated && status === 'cancelled' && previousStatus !== 'cancelled') {
    await notifyWashOwnerBooking(updated, 'cancelled_booking');
  }

  if (updated && status === 'confirmed' && previousStatus !== 'confirmed') {
    await handleBookingConfirmed({ booking: updated, previousStatus });
  }

  if (updated && status === 'done' && previousStatus !== 'done' && remoteSynced) {
    try {
      await recordWashBookingDone(updated, previousStatus);
    } catch (error) {
      console.warn('Wash loyalty stamp sync failed (non-blocking):', error);
    }
    try {
      await recordMerchantLoyaltyPointsOnDone(updated, previousStatus);
    } catch (error) {
      console.warn('Merchant loyalty points sync failed (non-blocking):', error);
    }
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
