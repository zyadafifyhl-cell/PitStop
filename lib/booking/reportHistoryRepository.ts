import { pushWashCenterNotification } from '@/lib/booking/wash/washNotificationCenter';
import type { WashCenterNotification } from '@/lib/booking/wash/types';
import { getSupabase } from '@/lib/supabase/client';

export type ShopReportHistoryScope = 'branch' | 'all';

export type ShopReportHistoryInput = {
  shopId: string;
  branchId?: string;
  scope: ShopReportHistoryScope;
  rangeStart: Date;
  rangeEnd: Date;
  locale: 'en' | 'ar';
  grossEgp: number;
  platformFeeEgp: number;
  netEgp: number;
  bookingCount: number;
  title: string;
  body: string;
  reportHtml: string;
};

type DbShopReportHistoryRow = {
  id: string;
  shop_id: string;
  branch_id: string | null;
  scope: ShopReportHistoryScope;
  range_start: string;
  range_end: string;
  generated_at: string;
  locale: 'en' | 'ar';
  gross_egp: number | string;
  platform_fee_egp: number | string;
  net_egp: number | string;
  booking_count: number;
  title: string;
  body: string;
  report_html: string;
  created_at: string;
};

function mapDbRow(row: DbShopReportHistoryRow): WashCenterNotification {
  return {
    id: row.id,
    shopId: row.shop_id,
    branchId: row.branch_id ?? undefined,
    kind: 'weekly_revenue',
    title: row.title,
    body: row.body,
    read: true,
    createdAt: row.generated_at || row.created_at,
    reportHtml: row.report_html,
  };
}

function buildInsertPayload(input: ShopReportHistoryInput) {
  const generatedAt = new Date().toISOString();
  return {
    shop_id: input.shopId,
    branch_id: input.scope === 'all' ? null : input.branchId ?? null,
    scope: input.scope,
    range_start: input.rangeStart.toISOString(),
    range_end: input.rangeEnd.toISOString(),
    generated_at: generatedAt,
    locale: input.locale,
    gross_egp: input.grossEgp,
    platform_fee_egp: input.platformFeeEgp,
    net_egp: input.netEgp,
    booking_count: input.bookingCount,
    title: input.title.trim(),
    body: input.body.trim(),
    report_html: input.reportHtml.trim(),
  };
}

export async function insertShopReportHistory(
  input: ShopReportHistoryInput,
): Promise<WashCenterNotification | null> {
  const supabase = getSupabase();
  const payload = buildInsertPayload(input);

  if (supabase) {
    const { data, error } = await supabase
      .from('shop_report_history')
      .insert(payload)
      .select('*')
      .single();

    if (!error && data) {
      return mapDbRow(data as DbShopReportHistoryRow);
    }
    if (error) {
      console.warn('insertShopReportHistory:', error.message);
    }
  }

  return pushWashCenterNotification({
    shopId: input.shopId,
    branchId: input.scope === 'all' ? undefined : input.branchId,
    kind: 'weekly_revenue',
    title: input.title,
    body: input.body,
    reportHtml: input.reportHtml,
  });
}

export async function listShopReportHistory(shopId: string): Promise<WashCenterNotification[]> {
  const supabase = getSupabase();
  const remoteRows: WashCenterNotification[] = [];

  if (supabase) {
    const { data, error } = await supabase
      .from('shop_report_history')
      .select('*')
      .eq('shop_id', shopId)
      .order('generated_at', { ascending: false })
      .limit(200);

    if (!error && data?.length) {
      remoteRows.push(...data.map((row) => mapDbRow(row as DbShopReportHistoryRow)));
    } else if (error) {
      console.warn('listShopReportHistory:', error.message);
    }
  }

  if (remoteRows.length > 0) {
    return remoteRows;
  }

  const { listWashCenterNotifications } = await import('@/lib/booking/wash/washNotificationCenter');
  const localRows = await listWashCenterNotifications(shopId);
  return localRows.filter((row) => row.kind === 'weekly_revenue' && !!row.reportHtml?.trim());
}
