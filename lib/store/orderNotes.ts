import type { StoreFulfillmentMethod, StoreOrder } from '@/lib/store/types';

/** Customer-facing notes: delivery_notes preferred, then notes. */
export function resolveStoreOrderCustomerNotes(
  order: Pick<StoreOrder, 'deliveryNotes' | 'notes'>,
): string {
  return (order.deliveryNotes?.trim() || order.notes?.trim() || '').trim();
}

export function isStoreOrderCodDelivery(method: StoreFulfillmentMethod): boolean {
  return method === 'cod';
}

export function isStoreOrderPickup(method: StoreFulfillmentMethod): boolean {
  return method === 'pickup';
}
