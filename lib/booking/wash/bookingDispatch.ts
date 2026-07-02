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

/** Who may receive a wash hub notification based on branch-manager fallback rules. */
export async function shouldStaffReceiveWashNotification(
  staff: ShopStaffUser | null,
  notification: WashCenterNotification,
): Promise<boolean> {
  if (!staff) return false;

  const branchId = notification.branchId?.trim();

  if (staff.role === 'branch_manager') {
    if (!staff.branchId) return false;
    if (!branchId) return BOOKING_QUEUE_KINDS.has(notification.kind);
    return branchId === staff.branchId;
  }

  if (staff.role === 'owner') {
    if (!branchId) return true;
    if (!BOOKING_QUEUE_KINDS.has(notification.kind)) return true;
    const hasManager = await branchHasAssignedManager(branchId);
    return !hasManager;
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

/** Pending booking queue scoped by branch-manager primary / owner fallback dispatch rules. */
export async function filterPendingQueueBookingsForStaff<T extends { status: string; branchId?: string }>(
  staff: ShopStaffUser | null,
  bookings: T[],
): Promise<T[]> {
  if (!staff) return [];

  const pending = bookings.filter((row) => row.status === 'pending');

  if (staff.role === 'branch_manager') {
    if (!staff.branchId) return [];
    return pending.filter((row) => row.branchId === staff.branchId);
  }

  if (staff.role === 'owner') {
    const out: T[] = [];
    for (const row of pending) {
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
