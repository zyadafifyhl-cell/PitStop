import { getSupabase } from '@/lib/supabase/client';
import type { StoreOrder, StoreOrderItem, StoreOrderStatus } from './types';

export type StoreOrderWithItems = StoreOrder & {
  items: StoreOrderItem[];
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  deliveryNotes?: string;
};

/**
 * Fetch all orders for the current store owner's shop
 */
export async function listStoreOwnerOrders(shopId: string): Promise<StoreOrderWithItems[]> {
  const supabase = getSupabase();
  if (!supabase || !shopId) return [];

  const { data: orders, error } = await supabase
    .from('store_orders')
    .select(`
      *,
      items:store_order_items(*)
    `)
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[orderRepository] listStoreOwnerOrders error:', error);
    return [];
  }

  return (orders ?? []).map((order) => ({
    id: order.id,
    userId: order.user_id,
    shopId: order.shop_id,
    subtotal: Number(order.subtotal),
    deliveryFee: Number(order.delivery_fee),
    totalPrice: Number(order.total_price),
    fulfillmentMethod: order.fulfillment_method,
    status: order.status,
    customerName: order.customer_name,
    customerPhone: order.customer_phone,
    deliveryAddress: order.delivery_address,
    deliveryNotes: order.delivery_notes,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    items: (order.items ?? []).map((item: any) => ({
      id: item.id,
      orderId: item.order_id,
      productId: item.product_id,
      productName: item.product_name,
      unitPrice: Number(item.unit_price),
      quantity: item.quantity,
      lineTotal: Number(item.line_total),
    })),
  }));
}

/**
 * Update order status (store owner only)
 */
export async function updateStoreOrderStatus(
  orderId: string,
  newStatus: StoreOrderStatus,
): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  const { error } = await supabase.rpc('update_store_order_status', {
    p_order_id: orderId,
    p_new_status: newStatus,
  });

  if (error) {
    console.error('[orderRepository] updateStoreOrderStatus error:', error);
    return false;
  }

  return true;
}

/**
 * Get single order details
 */
export async function getStoreOrderById(orderId: string, shopId: string): Promise<StoreOrderWithItems | null> {
  const supabase = getSupabase();
  if (!supabase || !shopId) return null;

  const { data: order, error } = await supabase
    .from('store_orders')
    .select(`
      *,
      items:store_order_items(*)
    `)
    .eq('id', orderId)
    .eq('shop_id', shopId)
    .single();

  if (error || !order) {
    console.error('[orderRepository] getStoreOrderById error:', error);
    return null;
  }

  return {
    id: order.id,
    userId: order.user_id,
    shopId: order.shop_id,
    subtotal: Number(order.subtotal),
    deliveryFee: Number(order.delivery_fee),
    totalPrice: Number(order.total_price),
    fulfillmentMethod: order.fulfillment_method,
    status: order.status,
    customerName: order.customer_name,
    customerPhone: order.customer_phone,
    deliveryAddress: order.delivery_address,
    deliveryNotes: order.delivery_notes,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    items: (order.items ?? []).map((item: any) => ({
      id: item.id,
      orderId: item.order_id,
      productId: item.product_id,
      productName: item.product_name,
      unitPrice: Number(item.unit_price),
      quantity: item.quantity,
      lineTotal: Number(item.line_total),
    })),
  };
}
