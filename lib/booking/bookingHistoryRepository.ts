import type { Booking, BookingStatus } from '@/lib/booking/types';
import {
  isFinalizedHistoryBooking,
  listBookingsForShop,
  sortBookingsByScheduledAtDesc,
} from '@/lib/booking/storage';

/**
 * Finalized merchant history archive.
 * Pending and confirmed (still within the slot window) belong on the operational dashboard;
 * stale confirmed rows are auto-completed at read time and appear here for owner review.
 */
const ARCHIVED_DB_STATUSES: BookingStatus[] = ['done', 'cancelled', 'no_show'];

/** History timeline: newest past slots first; future-dated test rows sink to the bottom. */
export function sortArchivedBookingsForDisplay(bookings: Booking[]): Booking[] {
  const now = Date.now();
  const tierSorted = sortBookingsByScheduledAtDesc(bookings);
  return [...tierSorted].sort((a, b) => {
    const aFuture = new Date(a.scheduledAt).getTime() > now;
    const bFuture = new Date(b.scheduledAt).getTime() > now;
    if (aFuture !== bFuture) return aFuture ? 1 : -1;
    return new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime();
  });
}

/** Finalized + auto-completed bookings for merchant history, scoped by shop/branch. */
export async function listArchivedBookingsForStaff(
  shopId: string,
  branchId?: string | null,
): Promise<Booking[]> {
  const all = await listBookingsForShop(shopId);
  const scoped = branchId ? all.filter((row) => row.branchId === branchId) : all;
  return sortArchivedBookingsForDisplay(scoped.filter(isFinalizedHistoryBooking));
}

export function isArchivedBookingStatus(status: BookingStatus): boolean {
  return ARCHIVED_DB_STATUSES.includes(status);
}
