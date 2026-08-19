import type { StoreOrderStatus } from '@/lib/store/types';

export type StoreOrderListFilter = 'pending' | 'active' | 'all';

export type StoreInventoryListFilter = 'all' | 'low_stock';

const ACTIVE_ORDER_STATUSES: StoreOrderStatus[] = ['preparing', 'ready', 'completed'];

export function orderMatchesListFilter(status: StoreOrderStatus, filter: StoreOrderListFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'pending') return status === 'pending';
  return ACTIVE_ORDER_STATUSES.includes(status);
}
