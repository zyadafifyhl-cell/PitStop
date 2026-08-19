import { getSupabase } from '@/lib/supabase/client';
import type { StoreSalesReport, StoreTopSellingProduct } from '@/lib/store/types';

const EMPTY_REPORT: StoreSalesReport = {
  grossRevenue: 0,
  completedOrdersCount: 0,
  cancelledOrdersCount: 0,
  averageOrderValue: 0,
  topSellingProducts: [],
};

function mapTopProduct(row: Record<string, unknown>): StoreTopSellingProduct {
  return {
    productId: typeof row.product_id === 'string' ? row.product_id : typeof row.productId === 'string' ? row.productId : undefined,
    productName: String(row.product_name ?? row.productName ?? 'Product'),
    unitsSold: Number(row.units_sold ?? row.unitsSold ?? 0),
    totalSales: Number(row.total_sales ?? row.totalSales ?? 0),
  };
}

function mapReport(row: Record<string, unknown> | null | undefined): StoreSalesReport {
  if (!row) return { ...EMPTY_REPORT };
  const top = Array.isArray(row.top_selling_products)
    ? row.top_selling_products
    : Array.isArray(row.topSellingProducts)
      ? row.topSellingProducts
      : [];
  return {
    grossRevenue: Number(row.gross_revenue ?? row.grossRevenue ?? 0),
    completedOrdersCount: Number(row.completed_orders_count ?? row.completedOrdersCount ?? 0),
    cancelledOrdersCount: Number(row.cancelled_orders_count ?? row.cancelledOrdersCount ?? 0),
    averageOrderValue: Number(row.average_order_value ?? row.averageOrderValue ?? 0),
    topSellingProducts: top.map((item) => mapTopProduct((item ?? {}) as Record<string, unknown>)),
  };
}

export async function getStoreSalesReport(input: {
  shopId: string;
  startDate: Date;
  endDate: Date;
}): Promise<StoreSalesReport> {
  const supabase = getSupabase();
  if (!supabase || !input.shopId) return { ...EMPTY_REPORT };

  const { data, error } = await supabase.rpc('get_store_sales_report', {
    p_shop_id: input.shopId,
    p_start_date: input.startDate.toISOString(),
    p_end_date: input.endDate.toISOString(),
  });

  if (error) {
    console.warn('[salesReportRepository] get_store_sales_report:', error.message);
    return { ...EMPTY_REPORT };
  }

  return mapReport(data as Record<string, unknown>);
}
