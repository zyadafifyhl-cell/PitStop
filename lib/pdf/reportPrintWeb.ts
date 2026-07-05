import { APP_BRAND_NAME } from '@/constants/Brand';
import {
  computeOperationalInsights,
  formatEgp,
  renderOperationalInsightsGridHtml,
} from '@/lib/booking/reporting';
import { getReportPrintLabels } from '@/lib/booking/reportPrintLabels';
import type { Locale } from '@/lib/i18n/strings';

export type ReportExportRow = {
  bookingId: string;
  dateText: string;
  typeText: string;
  revenueEgp: number;
};

export type ReportExportModel = {
  shopName: string;
  reportTitle: string;
  rangeLabel: string;
  generatedAtText: string;
  grossRevenue: number;
  platformFee: number;
  netEarnings: number;
  locale?: Locale;
  rows: ReportExportRow[];
  insights?: {
    totalBookings: number;
    grossRevenue: number;
    appCount: number;
    walkInCount: number;
    appRevenueEgp: number;
    walkInRevenueEgp: number;
    cancelledNoShowCount: number;
  };
};

type HtmlPayloadRow = {
  bookingId?: string;
  dateText?: string;
  serviceType?: string;
  amountEgp?: number;
};

type HtmlPayload = {
  shopName?: string;
  reportTitle?: string;
  rangeLabel?: string;
  generatedAt?: string;
  locale?: Locale;
  totals?: {
    gross?: number;
    fee?: number;
    net?: number;
  };
  insights?: {
    totalBookings?: number;
    grossRevenue?: number;
    appCount?: number;
    walkInCount?: number;
    appRevenueEgp?: number;
    walkInRevenueEgp?: number;
    cancelledNoShowCount?: number;
  };
  rows?: HtmlPayloadRow[];
};

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function money(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function formatMoney(value: number, locale: Locale): string {
  return formatEgp(money(value), locale);
}

function resolveLocale(value: unknown): Locale {
  return value === 'ar' ? 'ar' : 'en';
}

function formatOrderNumber(rawId: string): string {
  const compact = rawId.replaceAll(/[^a-zA-Z0-9]/g, '');
  const short = compact.slice(0, 8);
  return short ? `#${short}` : '#--------';
}

function parseMoney(text: string): number {
  const normalized = text
    .replaceAll(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replaceAll(/[٫]/g, '.')
    .replaceAll(/[٬،]/g, ',')
    .replaceAll(/[^\d,.-]/g, '')
    .replaceAll(',', '');
  const value = Number(normalized);
  return Number.isFinite(value) ? value : 0;
}

export function buildReportExportModelFromSavedHtml(html: string): ReportExportModel | null {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') return null;
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const payloadNode = parsed.getElementById('pitstop-report-payload');
  if (payloadNode?.textContent?.trim()) {
    try {
      const payload = JSON.parse(payloadNode.textContent) as HtmlPayload;
      const rows = (payload.rows ?? []).map((row, index) => ({
        bookingId: row.bookingId || `row-${index + 1}`,
        dateText: row.dateText || '-',
        typeText: row.serviceType || 'App',
        revenueEgp: money(row.amountEgp ?? 0),
      }));
      return {
        shopName: payload.shopName || APP_BRAND_NAME,
        reportTitle: payload.reportTitle || 'Bookings Report',
        rangeLabel: payload.rangeLabel || '-',
        generatedAtText: payload.generatedAt || new Date().toLocaleString(),
        locale: resolveLocale(payload.locale),
        grossRevenue: money(payload.totals?.gross ?? 0),
        platformFee: money(payload.totals?.fee ?? 0),
        netEarnings: money(payload.totals?.net ?? 0),
        rows,
        insights: payload.insights
          ? {
              totalBookings: payload.insights.totalBookings ?? rows.length,
              grossRevenue: money(payload.insights.grossRevenue ?? payload.totals?.gross ?? 0),
              appCount: payload.insights.appCount ?? 0,
              walkInCount: payload.insights.walkInCount ?? 0,
              appRevenueEgp: money(payload.insights.appRevenueEgp ?? 0),
              walkInRevenueEgp: money(payload.insights.walkInRevenueEgp ?? 0),
              cancelledNoShowCount: payload.insights.cancelledNoShowCount ?? 0,
            }
          : undefined,
      };
    } catch {
      // Fallback to table parser below for older reports.
    }
  }

  const tableRows = Array.from(parsed.querySelectorAll('tbody tr'))
    .map((tr, index) => {
      const cells = tr.querySelectorAll('td');
      if (cells.length < 8) return null;
      const bookingId = tr.getAttribute('data-booking-id') || cells[0]?.textContent || `row-${index + 1}`;
      const dateText = cells[1]?.textContent?.trim() || '-';
      const typeText = cells[2]?.textContent?.trim() || 'App';
      const revenueEgp = parseMoney(cells[7]?.textContent ?? '');
      return { bookingId, dateText, typeText, revenueEgp };
    })
    .filter((row): row is ReportExportRow => !!row);

  if (!tableRows.length) return null;
  const grossRevenue = tableRows.reduce((sum, row) => sum + row.revenueEgp, 0);
  const platformFee = parseMoney(parsed.querySelector('[data-metric="fee"] .value')?.textContent ?? '');
  const netEarnings = parseMoney(parsed.querySelector('[data-metric="net"] .value')?.textContent ?? '');
  const title = parsed.querySelector('h1')?.textContent?.trim() || 'Bookings Report';
  return {
    shopName: APP_BRAND_NAME,
    reportTitle: title,
    rangeLabel: '-',
    generatedAtText: new Date().toLocaleString(),
    grossRevenue,
    platformFee,
    netEarnings: netEarnings || Math.max(0, grossRevenue - platformFee),
    rows: tableRows,
  };
}

function typeBadgeHtml(typeText: string): string {
  const normalized = typeText.trim().toLowerCase();
  const isWalkIn = normalized.includes('walk');
  const badgeClass = isWalkIn ? 'badge badge-walkin' : 'badge badge-app';
  return `<span class="${badgeClass}">${escapeHtml(typeText)}</span>`;
}

function deriveInsightsFromExportModel(model: ReportExportModel) {
  const locale = model.locale ?? 'en';
  if (model.insights) {
    return computeOperationalInsights({ ...model.insights, locale });
  }

  const appRows = model.rows.filter((row) => !row.typeText.trim().toLowerCase().includes('walk'));
  const walkRows = model.rows.filter((row) => row.typeText.trim().toLowerCase().includes('walk'));
  return computeOperationalInsights({
    totalBookings: model.rows.length,
    grossRevenue: model.grossRevenue,
    appCount: appRows.length,
    walkInCount: walkRows.length,
    appRevenueEgp: appRows.reduce((sum, row) => sum + row.revenueEgp, 0),
    walkInRevenueEgp: walkRows.reduce((sum, row) => sum + row.revenueEgp, 0),
    cancelledNoShowCount: 0,
    locale,
  });
}

function buildReportPrintHtml(model: ReportExportModel): string {
  const locale = model.locale ?? 'en';
  const isAr = locale === 'ar';
  const labels = getReportPrintLabels(locale);
  const insights = deriveInsightsFromExportModel(model);

  const tableRows = model.rows.length
    ? model.rows
        .map(
          (row) => `<tr>
  <td class="col-booking">${escapeHtml(formatOrderNumber(row.bookingId))}</td>
  <td>${escapeHtml(row.dateText)}</td>
  <td>${typeBadgeHtml(row.typeText)}</td>
  <td class="col-revenue">${escapeHtml(formatMoney(row.revenueEgp, locale))}</td>
</tr>`,
        )
        .join('')
    : `<tr class="empty-row"><td colspan="4">${escapeHtml(labels.emptyRows)}</td></tr>`;

  return `<!doctype html>
<html lang="${locale}" dir="${isAr ? 'rtl' : 'ltr'}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(model.reportTitle)}</title>
  <style>
    :root {
      --radius: 0;
      --navy: #080D1A;
      --slate: #1e293b;
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
    html, body { margin: 0; padding: 0; background: #fff; color: var(--ink); }
    body {
      font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif;
      padding: 0 0 24px;
      letter-spacing: -0.01em;
    }
    .report-shell { max-width: 920px; margin: 0 auto; padding: 24px 24px 0; }
    .report-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 20px;
      padding: 20px 22px;
      background: linear-gradient(135deg, var(--navy) 0%, #0f172a 55%, #162033 100%);
      box-shadow: var(--card-shadow);
      margin-bottom: 20px;
    }
    .brand { display: flex; align-items: center; gap: 14px; }
    .brand-mark {
      width: 44px;
      height: 44px;
      background: rgba(0, 212, 255, 0.12);
      border: 1px solid rgba(0, 212, 255, 0.35);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .brand-name { font-size: 24px; font-weight: 800; line-height: 1; color: #fff; letter-spacing: -0.04em; }
    .brand-name span { color: var(--cyan); }
    .brand-sub {
      margin-top: 4px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: rgba(197, 209, 227, 0.82);
    }
    .header-copy { text-align: ${isAr ? 'left' : 'right'}; }
    .header-copy h1 { margin: 0 0 4px; font-size: 17px; font-weight: 700; color: #fff; }
    .doc-type {
      font-size: 12px;
      font-weight: 600;
      color: rgba(197, 209, 227, 0.78);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .meta-panel {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 20px;
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
      color: var(--muted);
      margin-bottom: 6px;
    }
    .meta-value { font-size: 14px; font-weight: 600; line-height: 1.45; color: var(--ink); word-break: break-word; }
    .financial-summary {
      display: grid;
      grid-template-columns: repeat(3, minmax(160px, 1fr));
      gap: 12px;
      margin-bottom: 20px;
    }
    .metric-card {
      padding: 16px 18px;
      background: var(--surface);
      border: 1px solid var(--line);
      box-shadow: var(--card-shadow);
    }
    .metric-card .label {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 8px;
    }
    .metric-card .value { font-size: 22px; font-weight: 800; color: var(--ink); letter-spacing: -0.03em; }
    .metric-card--net {
      background: linear-gradient(145deg, var(--navy) 0%, var(--slate) 100%);
      border: 1px solid rgba(0, 212, 255, 0.22);
      box-shadow: 0 10px 28px rgba(8, 13, 26, 0.18);
    }
    .metric-card--net .label { color: rgba(197, 209, 227, 0.82); }
    .metric-card--net .value { color: var(--green); font-size: 24px; }
    .section-title {
      margin: 0 0 12px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .insights-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 20px;
    }
    .insight-card {
      padding: 14px 16px;
      background: #fff;
      border: 1px solid var(--line);
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
    }
    .insight-card .label {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 8px;
    }
    .insight-card .value {
      font-size: 18px;
      font-weight: 700;
      line-height: 1.35;
      color: var(--ink);
      letter-spacing: -0.02em;
      word-break: break-word;
    }
    .table-wrap {
      overflow: hidden;
      border: 1px solid var(--line);
      box-shadow: var(--card-shadow);
      background: #fff;
    }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; background: #fff; }
    th, td {
      border: none;
      border-bottom: 1px solid var(--line);
      padding: 11px 10px;
      text-align: ${isAr ? 'right' : 'left'};
      font-size: 12px;
      word-break: break-word;
      color: var(--ink);
      vertical-align: middle;
    }
    th {
      background: var(--surface-alt);
      color: #475569;
      font-weight: 700;
      font-size: 10px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    tbody tr:last-child td { border-bottom: none; }
    tbody tr:nth-child(even) td { background: #fafbfc; }
    tbody tr:nth-child(odd) td { background: #fff; }
    .col-booking { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: 0.2px; font-weight: 600; }
    .col-revenue { white-space: nowrap; font-weight: 700; color: #0f766e; font-variant-numeric: tabular-nums; }
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
      background: rgba(0, 212, 255, 0.14);
      color: #0369a1;
      border: 1px solid rgba(0, 212, 255, 0.28);
    }
    .badge-walkin {
      background: rgba(100, 116, 139, 0.12);
      color: #334155;
      border: 1px solid rgba(100, 116, 139, 0.22);
    }
    .empty-row td { text-align: center; padding: 24px; color: var(--muted); }
    @media print {
      html, body, table, td, th, .metric-card, .report-header, .badge {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      body { padding: 0; }
      .report-shell { padding: 12px 12px 0; max-width: none; }
    }
  </style>
</head>
<body>
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
        <div>
          <div class="brand-name">Pit<span>Stop</span></div>
          <div class="brand-sub">${escapeHtml(APP_BRAND_NAME.replace(/^PitStop\s*/i, '').trim() || 'Executive Report')}</div>
        </div>
      </div>
      <div class="header-copy">
        <div class="doc-type">${escapeHtml(labels.executiveTitle)}</div>
        <h1>${escapeHtml(model.reportTitle)}</h1>
      </div>
    </header>

    <section class="meta-panel">
      <div class="meta-item">
        <div class="meta-label">${escapeHtml(labels.shop)}</div>
        <div class="meta-value">${escapeHtml(model.shopName)}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">${escapeHtml(labels.dateRange)}</div>
        <div class="meta-value">${escapeHtml(model.rangeLabel)}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">${escapeHtml(labels.generatedAt)}</div>
        <div class="meta-value">${escapeHtml(model.generatedAtText)}</div>
      </div>
    </section>

    <div class="financial-summary">
      <div class="metric-card" data-metric="gross">
        <div class="label">${escapeHtml(labels.grossRevenue)}</div>
        <div class="value">${escapeHtml(formatMoney(model.grossRevenue, locale))}</div>
      </div>
      <div class="metric-card" data-metric="fee">
        <div class="label">${escapeHtml(labels.platformFee)}</div>
        <div class="value">${escapeHtml(formatMoney(model.platformFee, locale))}</div>
      </div>
      <div class="metric-card metric-card--net" data-metric="net">
        <div class="label">${escapeHtml(labels.netEarnings)}</div>
        <div class="value">${escapeHtml(formatMoney(model.netEarnings, locale))}</div>
      </div>
    </div>

    <h2 class="section-title">${escapeHtml(labels.operationalInsights)}</h2>
    ${renderOperationalInsightsGridHtml(insights)}

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th style="width: 18%">${escapeHtml(labels.tableBookingId)}</th>
            <th style="width: 42%">${escapeHtml(labels.tableDate)}</th>
            <th style="width: 14%">${escapeHtml(labels.tableType)}</th>
            <th style="width: 26%">${escapeHtml(labels.tableRevenue)}</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  </div>
</body>
</html>`;
}

export function openReportPrintFrameWeb(model: ReportExportModel): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(buildReportPrintHtml(model));
  doc.close();

  window.setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      window.setTimeout(() => iframe.remove(), 800);
    }
  }, 100);
}
