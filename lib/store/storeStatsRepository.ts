import { getSupabase } from '@/lib/supabase/client';

export type StoreOwnerStats = {
  totalRevenue: number;
  pendingOrders: number;
  lowStockCount: number;
  totalProducts: number;
};

/**
 * Fetch dashboard analytics for store owner
 */
export async function getStoreOwnerStats(): Promise<StoreOwnerStats> {
  const supabase = getSupabase();
  if (!supabase) {
    return {
      totalRevenue: 0,
      pendingOrders: 0,
      lowStockCount: 0,
      totalProducts: 0,
    };
  }

  const { data, error } = await supabase.rpc('get_store_owner_stats');

  if (error || !data) {
    console.error('[storeStatsRepository] getStoreOwnerStats error:', error);
    return {
      totalRevenue: 0,
      pendingOrders: 0,
      lowStockCount: 0,
      totalProducts: 0,
    };
  }

  return {
    totalRevenue: Number(data.totalRevenue ?? 0),
    pendingOrders: Number(data.pendingOrders ?? 0),
    lowStockCount: Number(data.lowStockCount ?? 0),
    totalProducts: Number(data.totalProducts ?? 0),
  };
}
