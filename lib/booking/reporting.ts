import type { Shop, Booking } from '@/lib/booking/types';
import { APP_BRAND_NAME } from '@/constants/Brand';

export type ReportPreset = '2d' | '3d' | '7d' | '30d' | 'custom';

export type DateRange = {
  start: Date;
  end: Date;
};

export function resolveLastNDaysRange(days: number, now = new Date()): DateRange | null {
  const safeDays = Math.floor(days);
  if (!Number.isFinite(safeDays) || safeDays < 1 || safeDays > 366) return null;
  const end = endOfDay(now);
  const start = startOfDay(now);
  start.setDate(start.getDate() - (safeDays - 1));
  return { start, end };
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function safeJsonForHtml(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

export function estimateDefaultPriceEgp(type: Booking['shopType']): number {
  if (type === 'maintenance') return 650;
  if (type === 'wash') return 220;
  if (type === 'winch') return 500;
  return 420;
}

export function normalizeBookingMoney(booking: Booking): {
  servicePriceEgp: number;
  platformFeeEgp: number;
  ownerNetEgp: number;
} {
  const servicePriceEgp = Math.max(0, booking.servicePriceEgp ?? estimateDefaultPriceEgp(booking.shopType));
  const platformFeeEgp = Math.max(0, booking.platformFeeEgp ?? servicePriceEgp * 0.12);
  const ownerNetEgp = Math.max(0, servicePriceEgp - platformFeeEgp);
  return { servicePriceEgp, platformFeeEgp, ownerNetEgp };
}

export function formatEgp(value: number, locale: 'en' | 'ar'): string {
  const safe = Number.isFinite(value) ? value : 0;
  return safe.toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-EG', {
    style: 'currency',
    currency: 'EGP',
    maximumFractionDigits: 2,
  });
}

export function dateFromYmdLocal(ymd: string): Date | null {
  const d = new Date(`${ymd}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toYmdLocal(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function resolvePresetRange(preset: ReportPreset, now = new Date()): DateRange {
  const end = endOfDay(now);
  const start = startOfDay(now);
  const daysBack = preset === '2d' ? 2 : preset === '3d' ? 3 : preset === '7d' ? 7 : 30;
  start.setDate(start.getDate() - (daysBack - 1));
  return { start, end };
}

export function resolveCustomRange(startYmd: string, endYmd: string): DateRange | null {
  const start = dateFromYmdLocal(startYmd);
  const end = dateFromYmdLocal(endYmd);
  if (!start || !end) return null;
  if (start.getTime() > end.getTime()) return null;
  return { start: startOfDay(start), end: endOfDay(end) };
}

export function filterBookingsByRange(bookings: Booking[], range: DateRange): Booking[] {
  return bookings.filter((b) => {
    const time = new Date(b.scheduledAt).getTime();
    if (Number.isNaN(time)) return false;
    return time >= range.start.getTime() && time <= range.end.getTime();
  });
}

/** PDF / revenue totals — completed bookings only (excludes cancelled, no-show, pending, auto-completed). */
export function filterRevenueBookings(bookings: Booking[]): Booking[] {
  return bookings.filter((b) => b.status === 'done' && !b.lifecycleAutoCompleted);
}

export function formatRangeLabel(range: DateRange, locale: 'en' | 'ar'): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  return `${fmt(range.start)} - ${fmt(range.end)}`;
}

function sourceBadgeHtml(sourceLabel: string, isWalkIn: boolean): string {
  const badgeClass = isWalkIn ? 'badge badge-walkin' : 'badge badge-app';
  return `<span class="${badgeClass}">${escapeHtml(sourceLabel)}</span>`;
}

function formatReportPercent(value: number, locale: 'en' | 'ar'): string {
  const safe = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  return `${safe.toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-EG', { maximumFractionDigits: 1 })}%`;
}

export function computeOperationalInsights(params: {
  totalBookings: number;
  grossRevenue: number;
  appCount: number;
  walkInCount: number;
  appRevenueEgp: number;
  walkInRevenueEgp: number;
  cancelledNoShowCount: number;
  locale: 'en' | 'ar';
}): {
  aovLabel: string;
  aovValue: string;
  channelLabel: string;
  channelValue: string;
  vehiclesLabel: string;
  vehiclesValue: string;
  appRevenueLabel: string;
  appRevenueValue: string;
  walkInRevenueLabel: string;
  walkInRevenueValue: string;
  cancelledLabel: string;
  cancelledValue: string;
} {
  const {
    totalBookings,
    grossRevenue,
    appCount,
    walkInCount,
    appRevenueEgp,
    walkInRevenueEgp,
    cancelledNoShowCount,
    locale,
  } = params;
  const isAr = locale === 'ar';
  const aov = totalBookings > 0 ? grossRevenue / totalBookings : 0;
  const appPct = totalBookings > 0 ? (appCount / totalBookings) * 100 : 0;
  const walkPct = totalBookings > 0 ? (walkInCount / totalBookings) * 100 : 0;
  const bookingsWord = isAr ? 'حجز' : 'Bookings';

  return {
    aovLabel: isAr ? 'متوسط قيمة الطلب' : 'Average Order Value',
    aovValue: formatEgp(aov, locale),
    channelLabel: isAr ? 'توزيع القنوات' : 'Channel Split',
    channelValue: isAr
      ? `تطبيق ${formatReportPercent(appPct, locale)} · مباشر ${formatReportPercent(walkPct, locale)}`
      : `App ${formatReportPercent(appPct, locale)} · Walk-In ${formatReportPercent(walkPct, locale)}`,
    vehiclesLabel: isAr ? 'إجمالي المركبات المخدومة' : 'Total Vehicles Serviced',
    vehiclesValue: totalBookings.toLocaleString(isAr ? 'ar-EG' : 'en-EG'),
    appRevenueLabel: isAr ? 'إيرادات التطبيق' : 'App Revenue',
    appRevenueValue: formatEgp(appRevenueEgp, locale),
    walkInRevenueLabel: isAr ? 'إيرادات الزيارة المباشرة' : 'Walk-In Revenue',
    walkInRevenueValue: formatEgp(walkInRevenueEgp, locale),
    cancelledLabel: isAr ? 'ملغي / عدم حضور' : 'Cancelled / No-Shows',
    cancelledValue: `${cancelledNoShowCount.toLocaleString(isAr ? 'ar-EG' : 'en-EG')} ${bookingsWord}`,
  };
}

export function renderOperationalInsightsGridHtml(insights: ReturnType<typeof computeOperationalInsights>): string {
  return `<div class="insights-grid">
      <div class="insight-card">
        <div class="label">${escapeHtml(insights.aovLabel)}</div>
        <div class="value">${escapeHtml(insights.aovValue)}</div>
      </div>
      <div class="insight-card">
        <div class="label">${escapeHtml(insights.channelLabel)}</div>
        <div class="value">${escapeHtml(insights.channelValue)}</div>
      </div>
      <div class="insight-card">
        <div class="label">${escapeHtml(insights.vehiclesLabel)}</div>
        <div class="value">${escapeHtml(insights.vehiclesValue)}</div>
      </div>
      <div class="insight-card">
        <div class="label">${escapeHtml(insights.appRevenueLabel)}</div>
        <div class="value">${escapeHtml(insights.appRevenueValue)}</div>
      </div>
      <div class="insight-card">
        <div class="label">${escapeHtml(insights.walkInRevenueLabel)}</div>
        <div class="value">${escapeHtml(insights.walkInRevenueValue)}</div>
      </div>
      <div class="insight-card">
        <div class="label">${escapeHtml(insights.cancelledLabel)}</div>
        <div class="value">${escapeHtml(insights.cancelledValue)}</div>
      </div>
    </div>`;
}

export function buildOwnerReportHtml(params: {
  shop: Shop;
  bookings: Booking[];
  range: DateRange;
  rangeLabel: string;
  generatedAt: Date;
  locale: 'en' | 'ar';
}): string {
  const { shop, bookings, rangeLabel, generatedAt, locale } = params;
  const isAr = locale === 'ar';

  const sortedBookings = bookings
    .slice()
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

  const statusCount = { pending: 0, confirmed: 0, done: 0, cancelled: 0 };
  const typeCount = { maintenance: 0, wash: 0, parts: 0, winch: 0 };
  let walkInCount = 0;
  let appRevenueEgp = 0;
  let walkInRevenueEgp = 0;
  let cancelledNoShowCount = 0;
  const totals = { gross: 0, fee: 0, net: 0 };
  const htmlRows: string[] = [];
  const payloadRows: Array<{
    bookingId: string;
    dateText: string;
    serviceType: string;
    amountEgp: number;
    platformFeeEgp: number;
    netEgp: number;
  }> = [];

  for (let idx = 0; idx < sortedBookings.length; idx += 1) {
    const booking = sortedBookings[idx];
    const money = normalizeBookingMoney(booking);
    const isRevenue = booking.status === 'done' && !booking.lifecycleAutoCompleted;

    if (isRevenue) {
      totals.gross += money.servicePriceEgp;
      totals.fee += money.platformFeeEgp;
      totals.net += money.ownerNetEgp;
    }

    const isWalkIn = booking.bookingType === 'walk_in';
    if (isRevenue) {
      if (isWalkIn) walkInRevenueEgp += money.servicePriceEgp;
      else appRevenueEgp += money.servicePriceEgp;
    }
    if (booking.status === 'cancelled' || booking.status === 'no_show') {
      cancelledNoShowCount += 1;
    }

    if (booking.status === 'pending') statusCount.pending += 1;
    else if (booking.status === 'confirmed') statusCount.confirmed += 1;
    else if (booking.status === 'done') statusCount.done += 1;
    else if (booking.status === 'cancelled') statusCount.cancelled += 1;

    if (booking.shopType === 'maintenance') typeCount.maintenance += 1;
    else if (booking.shopType === 'wash') typeCount.wash += 1;
    else if (booking.shopType === 'parts') typeCount.parts += 1;
    else if (booking.shopType === 'winch') typeCount.winch += 1;

    if (isWalkIn) walkInCount += 1;
    const when = new Date(booking.scheduledAt).toLocaleString(isAr ? 'ar-EG' : 'en-EG');
    const sourceLabel = isWalkIn
      ? isAr
        ? 'زيارة مباشرة'
        : 'Walk-in'
      : isAr
        ? 'تطبيق'
        : 'App';

    htmlRows.push(`
      <tr data-booking-id="${escapeHtml(booking.id)}">
        <td class="col-index">${idx + 1}</td>
        <td>${escapeHtml(when)}</td>
        <td>${sourceBadgeHtml(sourceLabel, isWalkIn)}</td>
        <td>${escapeHtml(booking.customerPhone || (isAr ? '—' : '-'))}</td>
        <td>${escapeHtml(booking.carType)}</td>
        <td>${escapeHtml(booking.carColor || (isAr ? '—' : '-'))}</td>
        <td><span class="status-pill status-${escapeHtml(booking.status)}">${escapeHtml(booking.status)}</span></td>
        <td class="col-money">${escapeHtml(formatEgp(money.servicePriceEgp, locale))}</td>
        <td class="col-money col-fee">${escapeHtml(formatEgp(money.platformFeeEgp, locale))}</td>
        <td class="col-money col-net">${escapeHtml(formatEgp(money.ownerNetEgp, locale))}</td>
      </tr>`);

    payloadRows.push({
      bookingId: booking.id,
      dateText: when,
      serviceType: isWalkIn ? 'Walk-In' : 'App',
      amountEgp: money.servicePriceEgp,
      platformFeeEgp: money.platformFeeEgp,
      netEgp: money.ownerNetEgp,
    });
  }

  const rows = htmlRows.join('');
  const appCount = bookings.length - walkInCount;

  const generatedLabel = generatedAt.toLocaleString(isAr ? 'ar-EG' : 'en-EG');
  const reportPayload = safeJsonForHtml({
    shopName: isAr ? shop.nameAr : shop.name,
    reportTitle: isAr ? 'فاتورة/تقرير الحجوزات' : 'Bookings Invoice/Report',
    rangeLabel,
    generatedAt: generatedLabel,
    totals: {
      gross: totals.gross,
      fee: totals.fee,
      net: totals.net,
    },
    insights: {
      totalBookings: bookings.length,
      grossRevenue: totals.gross,
      appCount: bookings.length - walkInCount,
      walkInCount,
      appRevenueEgp,
      walkInRevenueEgp,
      cancelledNoShowCount,
    },
    rows: payloadRows,
  });

  const reportTitle = isAr ? 'فاتورة/تقرير الحجوزات' : 'Bookings Invoice/Report';
  const shopLabel = isAr ? 'المحل' : 'Shop';
  const periodLabel = isAr ? 'الفترة' : 'Date range';
  const generatedLabelKey = isAr ? 'تم الإنشاء' : 'Generated at';
  const insights = computeOperationalInsights({
    totalBookings: bookings.length,
    grossRevenue: totals.gross,
    appCount: bookings.length - walkInCount,
    walkInCount,
    appRevenueEgp,
    walkInRevenueEgp,
    cancelledNoShowCount,
    locale,
  });
  const insightsTitle = isAr ? 'رؤى تشغيلية' : 'Operational Insights';

  return `<!doctype html>
<html lang="${isAr ? 'ar' : 'en'}" dir="${isAr ? 'rtl' : 'ltr'}">
<head>
  <meta charset="utf-8" />
  <meta name="color-scheme" content="light" />
  <title>${escapeHtml(reportTitle)}</title>
  <style>
    :root {
      color-scheme: light;
      --radius: 0;
      --navy: #080D1A;
      --slate: #1e293b;
      --slate-soft: #334155;
      --cyan: #00D4FF;
      --green: #34D399;
      --ink: #0f172a;
      --muted: #64748b;
      --line: #eaecf0;
      --surface: #f8fafc;
      --surface-alt: #f1f5f9;
      --card-shadow: 0 1px 2px rgba(8, 13, 26, 0.06), 0 8px 24px rgba(8, 13, 26, 0.06);
    }
    * { box-sizing: border-box; border-radius: 0 !important; }
    html, body {
      margin: 0;
      min-height: 100%;
      height: auto;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      background: #ffffff !important;
      color: var(--ink) !important;
    }
    body {
      font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif;
      padding: 0 0 32px;
      letter-spacing: -0.01em;
    }
    .report-shell { max-width: 980px; margin: 0 auto; padding: 28px 28px 0; }
    .report-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 20px;
      padding: 22px 24px;
      background: linear-gradient(135deg, var(--navy) 0%, #0f172a 55%, #162033 100%);
      box-shadow: var(--card-shadow);
      margin-bottom: 22px;
    }
    .brand { display: flex; align-items: center; gap: 14px; min-width: 0; }
    .brand-mark {
      width: 46px;
      height: 46px;
      background: rgba(0, 212, 255, 0.12);
      border: 1px solid rgba(0, 212, 255, 0.35);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .brand-mark svg { display: block; }
    .brand-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .brand-name {
      font-size: 26px;
      font-weight: 800;
      line-height: 1;
      letter-spacing: -0.04em;
      color: #ffffff !important;
    }
    .brand-name span { color: var(--cyan) !important; }
    .brand-sub {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: rgba(197, 209, 227, 0.82) !important;
    }
    .header-copy { text-align: ${isAr ? 'left' : 'right'}; min-width: 0; }
    .header-copy h1 {
      margin: 0 0 6px;
      font-size: 18px;
      font-weight: 700;
      color: #ffffff !important;
      letter-spacing: -0.02em;
    }
    .header-copy .doc-type {
      font-size: 12px;
      font-weight: 600;
      color: rgba(197, 209, 227, 0.78) !important;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .meta-panel {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 22px;
    }
    .meta-item {
      padding: 14px 16px;
      background: var(--surface);
      border: 1px solid var(--line);
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
    }
    .meta-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted) !important;
      margin-bottom: 6px;
    }
    .meta-value {
      font-size: 14px;
      font-weight: 600;
      line-height: 1.45;
      color: var(--ink) !important;
      word-break: break-word;
    }
    .section-title {
      margin: 0 0 12px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted) !important;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(120px, 1fr));
      gap: 10px;
      margin-bottom: 22px;
    }
    .stat-card {
      padding: 12px 14px;
      background: #ffffff !important;
      border: 1px solid var(--line);
      box-shadow: var(--card-shadow);
    }
    .stat-card .label {
      color: var(--muted) !important;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .stat-card .value {
      font-weight: 800;
      margin-top: 6px;
      font-size: 20px;
      color: var(--ink) !important;
      letter-spacing: -0.03em;
    }
    .financial-summary {
      display: grid;
      grid-template-columns: repeat(3, minmax(160px, 1fr));
      gap: 12px;
      margin-bottom: 24px;
    }
    .metric-card {
      padding: 16px 18px;
      background: var(--surface) !important;
      border: 1px solid var(--line);
      box-shadow: var(--card-shadow);
    }
    .metric-card .label {
      color: var(--muted) !important;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .metric-card .value {
      font-weight: 800;
      margin-top: 8px;
      font-size: 24px;
      color: var(--ink) !important;
      letter-spacing: -0.03em;
    }
    .metric-card--net {
      background: linear-gradient(145deg, var(--navy) 0%, var(--slate) 100%) !important;
      border: 1px solid rgba(0, 212, 255, 0.22);
      box-shadow: 0 10px 28px rgba(8, 13, 26, 0.18);
    }
    .metric-card--net .label { color: rgba(197, 209, 227, 0.82) !important; }
    .metric-card--net .value { color: var(--green) !important; font-size: 26px; }
    .insights-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 24px;
    }
    .insight-card {
      padding: 14px 16px;
      background: #ffffff !important;
      border: 1px solid var(--line);
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
    }
    .insight-card .label {
      color: var(--muted) !important;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    .insight-card .value {
      font-size: 18px;
      font-weight: 700;
      line-height: 1.35;
      color: var(--ink) !important;
      letter-spacing: -0.02em;
      word-break: break-word;
    }
    .table-wrap {
      width: 100%;
      overflow: hidden;
      border: 1px solid var(--line);
      box-shadow: var(--card-shadow);
      background: #ffffff !important;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: #ffffff !important;
      table-layout: fixed;
    }
    th, td {
      border: none;
      border-bottom: 1px solid var(--line);
      padding: 11px 10px;
      font-size: 11px;
      text-align: ${isAr ? 'right' : 'left'};
      white-space: normal;
      word-break: break-word;
      overflow-wrap: anywhere;
      color: var(--ink) !important;
      vertical-align: middle;
    }
    th {
      background: var(--surface-alt) !important;
      color: #475569 !important;
      font-weight: 700;
      font-size: 10px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      position: sticky;
      top: 0;
      z-index: 1;
    }
    tbody tr:last-child td { border-bottom: none; }
    tbody tr:nth-child(even) td { background: #fafbfc !important; }
    tbody tr:nth-child(odd) td { background: #ffffff !important; }
    .col-index, .col-money { font-variant-numeric: tabular-nums; }
    .col-money { font-weight: 600; white-space: nowrap; }
    .col-fee { color: #64748b !important; }
    .col-net { color: #0f766e !important; font-weight: 700; }
    .badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 4px 10px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .badge-app {
      background: rgba(0, 212, 255, 0.14) !important;
      color: #0369a1 !important;
      border: 1px solid rgba(0, 212, 255, 0.28);
    }
    .badge-walkin {
      background: rgba(100, 116, 139, 0.12) !important;
      color: #334155 !important;
      border: 1px solid rgba(100, 116, 139, 0.22);
    }
    .status-pill {
      display: inline-flex;
      padding: 3px 8px;
      font-size: 10px;
      font-weight: 700;
      text-transform: capitalize;
      background: #eef2ff;
      color: #3730a3;
    }
    .status-done { background: rgba(52, 211, 153, 0.14) !important; color: #047857 !important; }
    .status-cancelled { background: rgba(239, 68, 68, 0.12) !important; color: #b91c1c !important; }
    .status-pending { background: rgba(245, 158, 11, 0.14) !important; color: #b45309 !important; }
    .status-confirmed { background: rgba(0, 212, 255, 0.12) !important; color: #0369a1 !important; }
    .empty-row td {
      text-align: center;
      padding: 28px 16px;
      color: var(--muted) !important;
      font-size: 13px;
    }
    @media print {
      html, body, table, td, th, .metric-card, .stat-card, .report-header, .badge {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      body { padding: 0; }
      .report-shell { padding: 12px 12px 0; max-width: none; }
      .report-header { break-inside: avoid; }
      .financial-summary, .stats-grid, .insights-grid { break-inside: avoid; }
    }
    @media (max-width: 760px) {
      .meta-panel, .stats-grid, .financial-summary, .insights-grid { grid-template-columns: 1fr; }
      .report-header { flex-direction: column; }
      .header-copy { text-align: ${isAr ? 'right' : 'left'}; width: 100%; }
    }
  </style>
</head>
<body>
  <script id="pitstop-report-payload" type="application/json">${reportPayload}</script>
  <div class="report-shell">
    <header class="report-header">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 14h16l-1.2 4H5.2L4 14Z" fill="#00D4FF" opacity="0.95"/>
            <path d="M6 10h12l-1.5 4H7.5L6 10Z" fill="#C5D1E3"/>
            <circle cx="7.5" cy="18.5" r="1.6" fill="#ffffff"/>
            <circle cx="16.5" cy="18.5" r="1.6" fill="#ffffff"/>
          </svg>
        </div>
        <div class="brand-text">
          <div class="brand-name">Pit<span>Stop</span></div>
          <div class="brand-sub">${escapeHtml(APP_BRAND_NAME.replace(/^PitStop\s*/i, '').trim() || 'Executive Report')}</div>
        </div>
      </div>
      <div class="header-copy">
        <div class="doc-type">${isAr ? 'تقرير مالي تنفيذي' : 'Executive Financial Report'}</div>
        <h1>${escapeHtml(reportTitle)}</h1>
      </div>
    </header>

    <section class="meta-panel">
      <div class="meta-item">
        <div class="meta-label">${shopLabel}</div>
        <div class="meta-value">${escapeHtml(isAr ? shop.nameAr : shop.name)}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">${periodLabel}</div>
        <div class="meta-value">${escapeHtml(rangeLabel)}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">${generatedLabelKey}</div>
        <div class="meta-value">${escapeHtml(generatedLabel)}</div>
      </div>
    </section>

    <h2 class="section-title">${isAr ? 'ملخص العمليات' : 'Operations summary'}</h2>
    <div class="stats-grid">
      <div class="stat-card"><div class="label">${isAr ? 'إجمالي الحجوزات' : 'Total bookings'}</div><div class="value">${bookings.length}</div></div>
      <div class="stat-card"><div class="label">${isAr ? 'تم التنفيذ' : 'Done'}</div><div class="value">${statusCount.done}</div></div>
      <div class="stat-card"><div class="label">${isAr ? 'حجوزات التطبيق' : 'App bookings'}</div><div class="value">${appCount}</div></div>
      <div class="stat-card"><div class="label">${isAr ? 'زيارات مباشرة' : 'Walk-in POS'}</div><div class="value">${walkInCount}</div></div>
      <div class="stat-card"><div class="label">${isAr ? 'مؤكد' : 'Confirmed'}</div><div class="value">${statusCount.confirmed}</div></div>
      <div class="stat-card"><div class="label">${isAr ? 'ملغي' : 'Cancelled'}</div><div class="value">${statusCount.cancelled}</div></div>
      <div class="stat-card"><div class="label">${isAr ? 'صيانة' : 'Maintenance'}</div><div class="value">${typeCount.maintenance}</div></div>
      <div class="stat-card"><div class="label">${isAr ? 'غسيل / قطع / ونش' : 'Wash / Parts / Winch'}</div><div class="value">${typeCount.wash + typeCount.parts + typeCount.winch}</div></div>
    </div>

    <h2 class="section-title">${isAr ? 'الملخص المالي' : 'Financial summary'}</h2>
    <div class="financial-summary">
      <div class="metric-card" data-metric="gross">
        <div class="label">${isAr ? 'إجمالي المبيعات' : 'Gross Revenue'}</div>
        <div class="value">${formatEgp(totals.gross, locale)}</div>
      </div>
      <div class="metric-card" data-metric="fee">
        <div class="label">${isAr ? 'عمولة المنصة (12%)' : 'Platform Fee (12%)'}</div>
        <div class="value">${formatEgp(totals.fee, locale)}</div>
      </div>
      <div class="metric-card metric-card--net" data-metric="net">
        <div class="label">${isAr ? 'صافي أرباح المحل' : 'Net Earnings'}</div>
        <div class="value">${formatEgp(totals.net, locale)}</div>
      </div>
    </div>

    <h2 class="section-title">${escapeHtml(insightsTitle)}</h2>
    ${renderOperationalInsightsGridHtml(insights)}

    <h2 class="section-title">${isAr ? 'تفاصيل الحجوزات' : 'Booking ledger'}</h2>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th style="width:5%">#</th>
            <th style="width:14%">${isAr ? 'الموعد' : 'Scheduled at'}</th>
            <th style="width:8%">${isAr ? 'المصدر' : 'Source'}</th>
            <th style="width:12%">${isAr ? 'رقم العميل' : 'Customer phone'}</th>
            <th style="width:11%">${isAr ? 'نوع السيارة' : 'Car type'}</th>
            <th style="width:8%">${isAr ? 'اللون' : 'Color'}</th>
            <th style="width:8%">${isAr ? 'الحالة' : 'Status'}</th>
            <th style="width:11%">${isAr ? 'سعر الخدمة' : 'Service price'}</th>
            <th style="width:11%">${isAr ? 'عمولة المنصة' : 'Platform fee'}</th>
            <th style="width:12%">${isAr ? 'صافي المحل' : 'Owner net'}</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr class="empty-row"><td colspan="10">${isAr ? 'لا توجد حجوزات في هذه الفترة' : 'No bookings for this period'}</td></tr>`}
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>`;
}

function deferReportWork(): Promise<void> {
  return new Promise((resolve) => {
    const maybeGlobal = globalThis as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    };
    if (typeof maybeGlobal.requestIdleCallback === 'function') {
      maybeGlobal.requestIdleCallback(() => resolve(), { timeout: 120 });
      return;
    }
    setTimeout(resolve, 0);
  });
}

export async function buildOwnerReportHtmlDeferred(params: {
  shop: Shop;
  bookings: Booking[];
  range: DateRange;
  rangeLabel: string;
  generatedAt: Date;
  locale: 'en' | 'ar';
}): Promise<string> {
  await deferReportWork();
  return buildOwnerReportHtml(params);
}
