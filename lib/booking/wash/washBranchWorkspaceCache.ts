import type { Booking, ShopReview } from '@/lib/booking/types';
import type { WashAnalyticsSnapshot, WashBranch } from '@/lib/booking/wash/types';
import type { DbBranchEmployee, DbUser } from '@/lib/supabase/database.types';

export type BranchWorkspaceCacheEntry = {
  branch: WashBranch;
  analytics: WashAnalyticsSnapshot;
  employees: DbBranchEmployee[];
  branchManager: DbUser | null;
  hasDedicatedBranchManager: boolean;
  hasAnyBranchManager: boolean;
  updatedAt: number;
};

export type ShopWorkspaceCacheEntry = {
  bookings: Booking[];
  reviews: ShopReview[];
  updatedAt: number;
};

const branchWorkspaceCache = new Map<string, BranchWorkspaceCacheEntry>();
const shopWorkspaceCache = new Map<string, ShopWorkspaceCacheEntry>();

function branchCacheKey(shopId: string, branchId: string): string {
  return `${shopId}:${branchId}`;
}

export function getBranchWorkspaceCache(shopId: string, branchId: string): BranchWorkspaceCacheEntry | null {
  return branchWorkspaceCache.get(branchCacheKey(shopId, branchId)) ?? null;
}

export function setBranchWorkspaceCache(
  shopId: string,
  branchId: string,
  entry: Omit<BranchWorkspaceCacheEntry, 'updatedAt'> & { updatedAt?: number },
): void {
  branchWorkspaceCache.set(branchCacheKey(shopId, branchId), {
    ...entry,
    updatedAt: entry.updatedAt ?? Date.now(),
  });
}

export function getShopWorkspaceCache(shopId: string): ShopWorkspaceCacheEntry | null {
  return shopWorkspaceCache.get(shopId) ?? null;
}

export function setShopWorkspaceCache(shopId: string, entry: Omit<ShopWorkspaceCacheEntry, 'updatedAt'> & { updatedAt?: number }): void {
  shopWorkspaceCache.set(shopId, {
    ...entry,
    updatedAt: entry.updatedAt ?? Date.now(),
  });
}

export function clearWashWorkspaceCache(shopId?: string): void {
  if (!shopId) {
    branchWorkspaceCache.clear();
    shopWorkspaceCache.clear();
    return;
  }
  for (const key of branchWorkspaceCache.keys()) {
    if (key.startsWith(`${shopId}:`)) {
      branchWorkspaceCache.delete(key);
    }
  }
  shopWorkspaceCache.delete(shopId);
}
