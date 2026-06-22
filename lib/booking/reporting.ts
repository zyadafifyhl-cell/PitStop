import type { Shop, Booking } from '@/lib/booking/types';

export type ReportPreset = '2d' | '3d' | '7d' | '30d' | 'custom';

export type DateRange = {
  start: Date;
  end: Date;
};

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

  const statusCount = {
    pending: bookings.filter((b) => b.status === 'pending').length,
    confirmed: bookings.filter((b) => b.status === 'confirmed').length,
    done: bookings.filter((b) => b.status === 'done').length,
    cancelled: bookings.filter((b) => b.status === 'cancelled').length,
  };

  const typeCount = {
    maintenance: bookings.filter((b) => b.shopType === 'maintenance').length,
    wash: bookings.filter((b) => b.shopType === 'wash').length,
    parts: bookings.filter((b) => b.shopType === 'parts').length,
    winch: bookings.filter((b) => b.shopType === 'winch').length,
  };

  const totals = bookings.reduce(
    (acc, booking) => {
      const money = normalizeBookingMoney(booking);
      acc.gross += money.servicePriceEgp;
      acc.fee += money.platformFeeEgp;
      acc.net += money.ownerNetEgp;
      return acc;
    },
    { gross: 0, fee: 0, net: 0 },
  );

  const rows = bookings
    .slice()
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
    .map((b, idx) => {
      const when = new Date(b.scheduledAt).toLocaleString(isAr ? 'ar-EG' : 'en-EG');
      const money = normalizeBookingMoney(b);
      return `
      <tr>
        <td>${idx + 1}</td>
        <td>${escapeHtml(when)}</td>
        <td>${escapeHtml(b.customerPhone)}</td>
        <td>${escapeHtml(b.carType)}</td>
        <td>${escapeHtml(b.carColor || (isAr ? '—' : '-'))}</td>
        <td>${escapeHtml(b.status)}</td>
        <td>${escapeHtml(formatEgp(money.servicePriceEgp, locale))}</td>
        <td>${escapeHtml(formatEgp(money.platformFeeEgp, locale))}</td>
        <td>${escapeHtml(formatEgp(money.ownerNetEgp, locale))}</td>
      </tr>`;
    })
    .join('');

  const generatedLabel = generatedAt.toLocaleString(isAr ? 'ar-EG' : 'en-EG');

  return `<!doctype html>
<html lang="${isAr ? 'ar' : 'en'}" dir="${isAr ? 'rtl' : 'ltr'}">
<head>
  <meta charset="utf-8" />
  <title>${isAr ? 'فاتورة/تقرير الحجوزات' : 'Bookings Invoice/Report'}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111827; padding: 24px; }
    h1 { margin: 0 0 8px; font-size: 24px; }
    .muted { color: #6b7280; font-size: 13px; margin-bottom: 14px; }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(140px, 1fr)); gap: 8px; margin-bottom: 18px; }
    .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; }
    .label { color: #6b7280; font-size: 12px; }
    .value { font-weight: 700; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border: 1px solid #e5e7eb; padding: 8px; font-size: 12px; text-align: ${isAr ? 'right' : 'left'}; }
    th { background: #f3f4f6; }
  </style>
</head>
<body>
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
    <div class="card"><div class="label">${isAr ? 'إجمالي المبيعات' : 'Gross sales'}</div><div class="value">${formatEgp(totals.gross, locale)}</div></div>
    <div class="card"><div class="label">${isAr ? 'عمولة المنصة' : 'Platform fee'}</div><div class="value">${formatEgp(totals.fee, locale)}</div></div>
    <div class="card"><div class="label">${isAr ? 'صافي المحل' : 'Owner net'}</div><div class="value">${formatEgp(totals.net, locale)}</div></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>${isAr ? 'الموعد' : 'Scheduled at'}</th>
        <th>${isAr ? 'رقم العميل' : 'Customer phone'}</th>
        <th>${isAr ? 'نوع السيارة' : 'Car type'}</th>
        <th>${isAr ? 'اللون' : 'Color'}</th>
        <th>${isAr ? 'الحالة' : 'Status'}</th>
        <th>${isAr ? 'سعر الخدمة' : 'Service price'}</th>
        <th>${isAr ? 'عمولة المنصة' : 'Platform fee'}</th>
        <th>${isAr ? 'صافي المحل' : 'Owner net'}</th>
      </tr>
    </thead>
    <tbody>
      ${rows || `<tr><td colspan="9">${isAr ? 'لا توجد حجوزات في هذه الفترة' : 'No bookings for this period'}</td></tr>`}
    </tbody>
  </table>
</body>
</html>`;
}
