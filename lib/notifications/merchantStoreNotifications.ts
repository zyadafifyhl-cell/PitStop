import { formatEgp } from '@/lib/booking/reporting';
import type { Locale } from '@/lib/i18n/strings';
import { listPendingStoreOrders, type StoreOrderWithItems } from '@/lib/store/orderRepository';

export type MerchantNotificationItem = {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  type: 'store_order';
  order: StoreOrderWithItems;
};

function fulfillmentLabel(method: StoreOrderWithItems['fulfillmentMethod'], locale: Locale): string {
  if (method === 'pickup') return locale === 'ar' ? 'استلام' : 'Pickup';
  return locale === 'ar' ? 'توصيل' : 'Delivery';
}

/** Pending retail orders for the merchant notification bell / modal. */
export async function fetchMerchantStoreOrderNotifications(
  shopId: string,
  locale: Locale,
): Promise<MerchantNotificationItem[]> {
  if (!shopId) return [];

  const orders = await listPendingStoreOrders(shopId);
  return orders.map((order) => {
    const shortId = order.id.replace(/-/g, '').slice(0, 8).toUpperCase();
    const customer = order.customerName?.trim() || order.customerPhone?.trim() || (locale === 'ar' ? 'عميل' : 'Customer');
    const total = formatEgp(order.totalPrice, locale);
    const fulfillment = fulfillmentLabel(order.fulfillmentMethod, locale);

    return {
      id: order.id,
      title:
        locale === 'ar'
          ? `طلب جديد #${shortId}`
          : `New Order Received / طلب جديد #${shortId}`,
      message: `${customer} • ${total} (${fulfillment})`,
      timestamp: order.createdAt,
      type: 'store_order',
      order,
    };
  });
}

export async function countPendingStoreOrders(shopId: string): Promise<number> {
  const rows = await fetchMerchantStoreOrderNotifications(shopId, 'en');
  return rows.length;
}
