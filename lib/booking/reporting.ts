import type { Shop, Booking } from '@/lib/booking/types';

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

    if (booking.status === 'pending') statusCount.pending += 1;
    else if (booking.status === 'confirmed') statusCount.confirmed += 1;
    else if (booking.status === 'done') statusCount.done += 1;
    else if (booking.status === 'cancelled') statusCount.cancelled += 1;

    if (booking.shopType === 'maintenance') typeCount.maintenance += 1;
    else if (booking.shopType === 'wash') typeCount.wash += 1;
    else if (booking.shopType === 'parts') typeCount.parts += 1;
    else if (booking.shopType === 'winch') typeCount.winch += 1;

    const isWalkIn = booking.bookingType === 'walk_in';
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
        <td>${idx + 1}</td>
        <td>${escapeHtml(when)}</td>
        <td>${escapeHtml(sourceLabel)}</td>
        <td>${escapeHtml(booking.customerPhone || (isAr ? '—' : '-'))}</td>
        <td>${escapeHtml(booking.carType)}</td>
        <td>${escapeHtml(booking.carColor || (isAr ? '—' : '-'))}</td>
        <td>${escapeHtml(booking.status)}</td>
        <td>${escapeHtml(formatEgp(money.servicePriceEgp, locale))}</td>
        <td>${escapeHtml(formatEgp(money.platformFeeEgp, locale))}</td>
        <td>${escapeHtml(formatEgp(money.ownerNetEgp, locale))}</td>
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
    rows: payloadRows,
  });

  return `<!doctype html>
<html lang="${isAr ? 'ar' : 'en'}" dir="${isAr ? 'rtl' : 'ltr'}">
<head>
  <meta charset="utf-8" />
  <meta name="color-scheme" content="light" />
  <title>${isAr ? 'فاتورة/تقرير الحجوزات' : 'Bookings Invoice/Report'}</title>
  <style>
    :root { color-scheme: light; }
    html, body {
      margin: 0;
      min-height: 100%;
      height: auto;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      background: #ffffff !important;
      color: #111827 !important;
    }
    body {
      font-family: Arial, Helvetica, sans-serif;
      padding: 24px;
      box-sizing: border-box;
    }
    h1 { margin: 0 0 8px; font-size: 24px; font-weight: 800; color: #111827 !important; }
    .muted { color: #4b5563 !important; font-size: 13px; margin-bottom: 14px; line-height: 1.6; }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(140px, 1fr)); gap: 10px; margin-bottom: 18px; }
    .card {
      border: 1px solid #d1d5db;
      border-radius: 10px;
      padding: 12px 14px;
      background: #f9fafb !important;
    }
    .label { color: #6b7280 !important; font-size: 12px; font-weight: 600; }
    .value { font-weight: 800; margin-top: 4px; font-size: 18px; color: #111827 !important; }
    .table-wrap { width: 100%; margin-top: 10px; border: 1px solid #d1d5db; border-radius: 10px; overflow: hidden; }
    table { width: 100%; border-collapse: collapse; background: #ffffff !important; table-layout: fixed; }
    th, td {
      border: 1px solid #e5e7eb;
      padding: 8px 6px;
      font-size: 11px;
      text-align: ${isAr ? 'right' : 'left'};
      white-space: normal;
      word-break: break-word;
      overflow-wrap: anywhere;
      color: #111827 !important;
    }
    th {
      background: #f3f4f6 !important;
      color: #111827 !important;
      font-weight: 800;
      position: sticky;
      top: 0;
      z-index: 1;
    }
    tbody tr:nth-child(even) td { background: #f9fafb !important; }
    tbody tr:nth-child(odd) td { background: #ffffff !important; }
    @media print {
      html, body, table, td, th, .card { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <script id="pitstop-report-payload" type="application/json">${reportPayload}</script>
  <h1>${isAr ? 'فاتورة/تقرير الحجوزات' : 'Bookings Invoice/Report'}</h1>
  <div class="muted">
    ${isAr ? 'المحل' : 'Shop'}: ${escapeHtml(isAr ? shop.nameAr : shop.name)}<br/>
    ${isAr ? 'الفترة' : 'Period'}: ${escapeHtml(rangeLabel)}<br/>
    ${isAr ? 'تم الإنشاء' : 'Generated at'}: ${escapeHtml(generatedLabel)}
  </div>

  <div class="grid">
    <div class="card"><div class="label">${isAr ? 'إجمالي الحجوزات' : 'Total bookings'}</div><div class="value">${bookings.length}</div></div>
    <div class="card"><div class="label">${isAr ? 'تم التنفيذ' : 'Done'}</div><div class="value">${statusCount.done}</div></div>
    <div class="card"><div class="label">${isAr ? 'مؤكد' : 'Confirmed'}</div><div class="value">${statusCount.confirmed}</div></div>
    <div class="card"><div class="label">${isAr ? 'ملغي' : 'Cancelled'}</div><div class="value">${statusCount.cancelled}</div></div>
    <div class="card"><div class="label">${isAr ? 'صيانة' : 'Maintenance'}</div><div class="value">${typeCount.maintenance}</div></div>
    <div class="card"><div class="label">${isAr ? 'غسيل / قطع / ونش' : 'Wash / Parts / Winch'}</div><div class="value">${typeCount.wash + typeCount.parts + typeCount.winch}</div></div>
    <div class="card"><div class="label">${isAr ? 'حجوزات التطبيق' : 'App bookings'}</div><div class="value">${appCount}</div></div>
    <div class="card"><div class="label">${isAr ? 'زيارات مباشرة' : 'Walk-in POS'}</div><div class="value">${walkInCount}</div></div>
    <div class="card"><div class="label">${isAr ? 'إجمالي المبيعات' : 'Gross sales'}</div><div class="value">${formatEgp(totals.gross, locale)}</div></div>
    <div class="card"><div class="label">${isAr ? 'عمولة المنصة' : 'Platform fee'}</div><div class="value">${formatEgp(totals.fee, locale)}</div></div>
    <div class="card"><div class="label">${isAr ? 'صافي المحل' : 'Owner net'}</div><div class="value">${formatEgp(totals.net, locale)}</div></div>
  </div>

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
      ${rows || `<tr><td colspan="10">${isAr ? 'لا توجد حجوزات في هذه الفترة' : 'No bookings for this period'}</td></tr>`}
    </tbody>
  </table>
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
