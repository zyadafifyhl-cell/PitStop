import type { Booking, ShopReview } from '@/lib/booking/types';
import type { ShopBranchLabel } from '@/lib/booking/wash/branchRepository';

export function resolveBranchIdForReview(
  review: ShopReview,
  bookings: Booking[],
  reviewBranchById?: Record<string, string | undefined>,
): string | undefined {
  if (reviewBranchById?.[review.id]) return reviewBranchById[review.id];
  if (!review.customerId) return undefined;
  const match = bookings.find(
    (row) =>
      row.customerId === review.customerId &&
      row.shopId === review.shopId &&
      row.status === 'done' &&
      row.branchId,
  );
  return match?.branchId;
}

export function formatBranchBadgeLabel(
  branchId: string | undefined,
  branchLabels: ShopBranchLabel[],
  locale: 'en' | 'ar',
): string | null {
  if (!branchId) return null;
  const branch = branchLabels.find((row) => row.id === branchId);
  if (!branch) return null;
  const name = locale === 'ar' ? branch.nameAr || branch.name : branch.name;
  return name;
}
