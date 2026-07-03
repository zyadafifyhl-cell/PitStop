import { APP_BRAND_NAME } from '@/constants/Brand';

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
  rows: ReportExportRow[];
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
  totals?: {
    gross?: number;
    fee?: number;
    net?: number;
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

function formatEgp(value: number): string {
  return `EGP ${money(value).toFixed(2)}`;
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
        grossRevenue: money(payload.totals?.gross ?? 0),
        platformFee: money(payload.totals?.fee ?? 0),
        netEarnings: money(payload.totals?.net ?? 0),
        rows,
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
  const platformFee = parseMoney(parsed.querySelector('.card:nth-child(10) .value')?.textContent ?? '');
  const netEarnings = parseMoney(parsed.querySelector('.card:nth-child(11) .value')?.textContent ?? '');
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

function buildReportPrintHtml(model: ReportExportModel): string {
  const tableRows = model.rows.length
    ? model.rows
        .map(
          (row) => `<tr>
  <td class="col-booking">${escapeHtml(formatOrderNumber(row.bookingId))}</td>
  <td>${escapeHtml(row.dateText)}</td>
  <td>${escapeHtml(row.typeText)}</td>
  <td class="col-revenue">${escapeHtml(formatEgp(row.revenueEgp))}</td>
</tr>`,
        )
        .join('')
    : `<tr><td colspan="4">No bookings in this report.</td></tr>`;

  return `<!doctype html>
<html lang="en" dir="ltr">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(model.reportTitle)}</title>
  <style>
    html, body { margin: 0; padding: 0; background: #fff; color: #111827; }
    body { font-family: Arial, Helvetica, sans-serif; padding: 24px; }
    .header h1 { margin: 0 0 6px; font-size: 22px; font-weight: 800; }
    .meta { color: #4b5563; font-size: 13px; line-height: 1.6; margin-bottom: 14px; }
    .summary { display: grid; grid-template-columns: repeat(3, minmax(180px, 1fr)); gap: 10px; margin-bottom: 16px; }
    .card { border: 1px solid #d1d5db; border-radius: 10px; padding: 10px 12px; background: #f9fafb; }
    .label { font-size: 12px; color: #6b7280; margin-bottom: 4px; }
    .value { font-size: 15px; font-weight: 800; color: #111827; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; font-size: 12px; word-break: break-word; }
    th { background: #f3f4f6; font-weight: 800; }
    .col-booking { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: 0.2px; }
    .col-revenue { white-space: nowrap; }
    tbody tr:nth-child(even) td { background: #fafafa; }
    @media print {
      body { padding: 14px; }
      .summary { grid-template-columns: repeat(3, 1fr); }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(model.reportTitle)}</h1>
    <div class="meta">
      Shop: ${escapeHtml(model.shopName)}<br/>
      Date range: ${escapeHtml(model.rangeLabel)}<br/>
      Generated at: ${escapeHtml(model.generatedAtText)}
    </div>
  </div>
  <div class="summary">
    <div class="card"><div class="label">Gross Revenue</div><div class="value">${escapeHtml(formatEgp(model.grossRevenue))}</div></div>
    <div class="card"><div class="label">Platform Fee (12%)</div><div class="value">${escapeHtml(formatEgp(model.platformFee))}</div></div>
    <div class="card"><div class="label">Net Earnings</div><div class="value">${escapeHtml(formatEgp(model.netEarnings))}</div></div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width: 18%">Booking ID</th>
        <th style="width: 42%">Date</th>
        <th style="width: 14%">Type</th>
        <th style="width: 26%">Revenue</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
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
