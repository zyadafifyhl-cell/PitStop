import type { Booking, BookingStatus } from '@/lib/booking/types';
import { getSupabase } from '@/lib/supabase/client';

import { listBookingsForShop } from '@/lib/booking/storage';

const ARCHIVED_STATUSES: BookingStatus[] = ['done', 'cancelled', 'no_show'];

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
  customer_notes?: string | null;
  owner_rejection_note?: string | null;
  booking_type?: Booking['bookingType'];
  scheduled_at: string;
  status: BookingStatus;
  created_at: string;
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
    servicePriceEgp: row.service_price_egp != null ? Number(row.service_price_egp) : undefined,
    platformFeeEgp: row.platform_fee_egp != null ? Number(row.platform_fee_egp) : undefined,
    customerNotes: row.customer_notes ?? undefined,
    ownerRejectionNote: row.owner_rejection_note ?? undefined,
    bookingType: row.booking_type ?? undefined,
    scheduledAt: row.scheduled_at,
    status: row.status,
    createdAt: row.created_at,
  };
}

/** Archived bookings from Supabase (done / cancelled / no_show), scoped by shop and optional branch. */
export async function listArchivedBookingsForStaff(
  shopId: string,
  branchId?: string | null,
): Promise<Booking[]> {
  const supabase = getSupabase();
  if (supabase) {
    let query = supabase
      .from('bookings')
      .select('*')
      .eq('shop_id', shopId)
      .in('status', ARCHIVED_STATUSES)
      .order('scheduled_at', { ascending: false });

    if (branchId) {
      query = query.eq('branch_id', branchId);
    }

    const { data, error } = await query;
    if (!error && data?.length) {
      return (data as BookingRow[]).map(mapBookingRow);
    }
  }

  const local = await listBookingsForShop(shopId);
  return local
    .filter((row) => ARCHIVED_STATUSES.includes(row.status))
    .filter((row) => !branchId || !row.branchId || row.branchId === branchId)
    .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
}
