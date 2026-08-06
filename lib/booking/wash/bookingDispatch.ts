import { fetchBranchManagerRemote } from '@/lib/booking/wash/branchManagerRepository';
import type { WashCenterNotification } from '@/lib/booking/wash/types';
import type { ShopStaffUser } from '@/lib/shop/shopStaffUser';

const managerCache = new Map<string, boolean>();

export async function branchHasAssignedManager(branchId: string): Promise<boolean> {
  if (!branchId) return false;
  if (managerCache.has(branchId)) return managerCache.get(branchId)!;
  const manager = await fetchBranchManagerRemote(branchId);
  const hasManager = !!manager;
  managerCache.set(branchId, hasManager);
  return hasManager;
}

export function clearBranchManagerCache(): void {
  managerCache.clear();
}

const BOOKING_QUEUE_KINDS = new Set<WashCenterNotification['kind']>(['new_booking', 'cancelled_booking']);
const REVIEW_KINDS = new Set<WashCenterNotification['kind']>(['new_review']);

/** Who may receive a wash hub notification based on branch-manager fallback rules. */
export async function shouldStaffReceiveWashNotification(
  staff: ShopStaffUser | null,
  notification: WashCenterNotification,
): Promise<boolean> {
  if (!staff) return false;

  const branchId = notification.branchId?.trim();

  if (staff.role === 'branch_manager') {
    if (!staff.branchId) return false;
    if (REVIEW_KINDS.has(notification.kind)) {
      if (!branchId) return true;
      return branchId === staff.branchId;
    }
    if (!branchId) return BOOKING_QUEUE_KINDS.has(notification.kind);
    return branchId === staff.branchId;
  }

  if (staff.role === 'owner') {
    if (notification.kind === 'cancelled_booking') return true;
    if (BOOKING_QUEUE_KINDS.has(notification.kind)) {
      if (!branchId) return true;
      const hasManager = await branchHasAssignedManager(branchId);
      return !hasManager;
    }
    return true;
  }

  return false;
}

export async function filterWashNotificationsForStaff(
  staff: ShopStaffUser | null,
  rows: WashCenterNotification[],
): Promise<WashCenterNotification[]> {
  const out: WashCenterNotification[] = [];
  for (const row of rows) {
    if (await shouldStaffReceiveWashNotification(staff, row)) {
      out.push(row);
    }
  }
  return out;
}

/**
 * Operational workspace scope:
 * - Branch managers see only their assigned branch.
 * - Owners see unscoped bookings and branches without an active manager (fallback).
 */
export async function filterOperationalBookingsForStaff<T extends { branchId?: string }>(
  staff: ShopStaffUser | null,
  bookings: T[],
): Promise<T[]> {
  if (!staff) return [];

  if (staff.role === 'branch_manager') {
    if (!staff.branchId) return [];
    return bookings.filter((row) => row.branchId === staff.branchId);
  }

  if (staff.role === 'owner') {
    const out: T[] = [];
    for (const row of bookings) {
      if (!row.branchId) {
        out.push(row);
        continue;
      }
      const hasManager = await branchHasAssignedManager(row.branchId);
      if (!hasManager) out.push(row);
    }
    return out;
  }

  return [];
}

/** Pending booking queue scoped by branch-manager primary / owner fallback dispatch rules. */
export async function filterPendingQueueBookingsForStaff<T extends { status: string; branchId?: string }>(
  staff: ShopStaffUser | null,
  bookings: T[],
): Promise<T[]> {
  const operational = await filterOperationalBookingsForStaff(staff, bookings);
  return operational.filter((row) => row.status === 'pending');
}
