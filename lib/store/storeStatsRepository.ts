import { getSupabase } from '@/lib/supabase/client';
import { isStoreLowStock } from '@/lib/store/constants';

export type StoreOwnerStats = {
  totalRevenue: number;
  totalOrders: number;
  pendingOrders: number;
  lowStockCount: number;
  totalProducts: number;
};

const EMPTY_STORE_OWNER_STATS: StoreOwnerStats = {
  totalRevenue: 0,
  totalOrders: 0,
  pendingOrders: 0,
  lowStockCount: 0,
  totalProducts: 0,
};

function mapStats(row: Record<string, unknown> | null | undefined): StoreOwnerStats | null {
  if (!row) return null;
  return {
    totalRevenue: Number(row.totalRevenue ?? row.total_revenue ?? 0),
    totalOrders: Number(row.totalOrders ?? row.total_orders ?? 0),
    pendingOrders: Number(row.pendingOrders ?? row.pending_orders ?? 0),
    lowStockCount: Number(row.lowStockCount ?? row.low_stock_count ?? 0),
    totalProducts: Number(row.totalProducts ?? row.total_products ?? 0),
  };
}

async function loadStatsFromTables(shopId: string): Promise<StoreOwnerStats> {
  const supabase = getSupabase();
  if (!supabase) return { ...EMPTY_STORE_OWNER_STATS };

  const [ordersRes, productsRes] = await Promise.all([
    supabase.from('store_orders').select('total_price, status').eq('shop_id', shopId),
    supabase.from('products').select('stock_quantity, is_active').eq('shop_id', shopId),
  ]);

  const orders = ordersRes.data ?? [];
  const products = productsRes.data ?? [];
  if (ordersRes.error) console.warn('[storeStatsRepository] orders query:', ordersRes.error.message);
  if (productsRes.error) console.warn('[storeStatsRepository] products query:', productsRes.error.message);

  return {
    totalRevenue: orders.reduce((sum, order) => {
      if (order.status !== 'completed') return sum;
      return sum + Number(order.total_price ?? 0);
    }, 0),
    totalOrders: orders.length,
    pendingOrders: orders.filter((order) => order.status === 'pending').length,
    totalProducts: products.length,
    lowStockCount: products.filter((product) => product.is_active && isStoreLowStock(Number(product.stock_quantity ?? 0))).length,
  };
}

export async function getStoreOwnerStats(shopId: string): Promise<StoreOwnerStats> {
  const supabase = getSupabase();
  if (!supabase || !shopId) return { ...EMPTY_STORE_OWNER_STATS };

  const { data, error } = await supabase.rpc('get_store_owner_stats', { p_shop_id: shopId });
  if (!error) {
    const mapped = mapStats(data as Record<string, unknown>);
    if (mapped) return mapped;
  } else {
    console.warn('[storeStatsRepository] RPC unavailable; querying tables:', error.message);
  }

  return loadStatsFromTables(shopId);
}
