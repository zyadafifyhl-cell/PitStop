import { formatEgp } from '@/lib/booking/reporting';
import type { Locale, TranslationKey } from '@/lib/i18n/strings';
import type { CustomerStoreOrder, StoreFulfillmentMethod, StoreOrderStatus } from '@/lib/store/types';

export const CUSTOMER_STORE_STATUS_LABEL: Record<StoreOrderStatus, TranslationKey> = {
  pending: 'customer_store_status_pending',
  preparing: 'customer_store_status_preparing',
  ready: 'customer_store_status_ready',
  completed: 'customer_store_status_completed',
  cancelled: 'customer_store_status_cancelled',
};

export const CUSTOMER_STORE_STATUS_TONE: Record<
  StoreOrderStatus,
  { backgroundColor: string; borderColor: string; color: string }
> = {
  pending: { backgroundColor: 'rgba(245,197,24,0.16)', borderColor: '#F5C518', color: '#F5C518' },
  preparing: { backgroundColor: 'rgba(59,130,246,0.16)', borderColor: '#3B82F6', color: '#60A5FA' },
  ready: { backgroundColor: 'rgba(168,85,247,0.16)', borderColor: '#A855F7', color: '#C084FC' },
  completed: { backgroundColor: 'rgba(34,197,94,0.16)', borderColor: '#22C55E', color: '#4ADE80' },
  cancelled: { backgroundColor: 'rgba(239,68,68,0.16)', borderColor: '#EF4444', color: '#F87171' },
};

export function formatStoreOrderShortId(orderId: string): string {
  return orderId.replace(/-/g, '').slice(0, 8).toUpperCase();
}

export function formatStoreOrderFullTimestamp(iso: string, locale: Locale): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function isStoreOrderDelivery(method: StoreFulfillmentMethod): boolean {
  return method !== 'pickup';
}

export function storeOrderPaymentLabelKey(method: StoreFulfillmentMethod): TranslationKey {
  if (method === 'pickup') return 'customer_store_payment_pickup';
  if (method === 'card') return 'customer_store_payment_card';
  return 'customer_store_payment_cod';
}

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

type InvoiceCopy = {
  title: string;
  soldBy: string;
  billTo: string;
  orderNo: string;
  date: string;
  status: string;
  fulfillment: string;
  payment: string;
  storeAddress: string;
  deliveryAddress: string;
  notes: string;
  item: string;
  qtyPrice: string;
  lineTotal: string;
  subtotal: string;
  deliveryFee: string;
  deliveryFree: string;
  grandTotal: string;
  brand: string;
};

export function buildStoreOrderInvoiceHtml(input: {
  order: CustomerStoreOrder;
  shopName: string;
  shopPhone: string;
  shopAddress: string;
  fulfillmentDetail: string;
  customerName: string;
  customerPhone: string;
  statusLabel: string;
  fulfillmentLabel: string;
  paymentLabel: string;
  locale: Locale;
  copy: InvoiceCopy;
}): string {
  const { order, locale, copy } = input;
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  const shortId = formatStoreOrderShortId(order.id);
  const timestamp = formatStoreOrderFullTimestamp(order.createdAt, locale);
  const deliveryFree = order.fulfillmentMethod === 'pickup' || order.deliveryFee <= 0;
  const notes = order.deliveryNotes?.trim() || '';
  const rows = order.items
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.productName)}</td>
          <td>${item.quantity} × ${escapeHtml(formatEgp(item.unitPrice, locale))}</td>
          <td class="num">${escapeHtml(formatEgp(item.lineTotal, locale))}</td>
        </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="${locale}" dir="${dir}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(copy.title)} #${shortId}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111; background: #fff; margin: 24px; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    .muted { color: #555; font-size: 13px; }
    .rule { border: none; border-top: 1px dashed #999; margin: 14px 0; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 18px; }
    .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #666; margin-bottom: 2px; }
    .value { font-size: 14px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: ${dir === 'rtl' ? 'right' : 'left'}; border-bottom: 1px solid #ccc; padding: 8px 4px; }
    td { padding: 8px 4px; border-bottom: 1px dashed #ddd; vertical-align: top; }
    .num { text-align: ${dir === 'rtl' ? 'left' : 'right'}; white-space: nowrap; }
    .totals { width: 280px; margin-${dir === 'rtl' ? 'right' : 'left'}: auto; }
    .totals .row { display: flex; justify-content: space-between; padding: 6px 0; }
    .grand { font-size: 16px; font-weight: 800; border-top: 1px dashed #999; margin-top: 6px; padding-top: 8px; }
    .badge { display: inline-block; border: 1px solid #111; border-radius: 999px; padding: 2px 8px; font-size: 11px; font-weight: 800; }
  </style>
</head>
<body>
  <h1>${escapeHtml(copy.title)}</h1>
  <div class="muted">${escapeHtml(copy.brand)}</div>
  <hr class="rule" />
  <div class="grid">
    <div>
      <div class="label">${escapeHtml(copy.soldBy)}</div>
      <div class="value">${escapeHtml(input.shopName || '—')}</div>
      <div class="muted">${escapeHtml(input.shopPhone || '—')}</div>
      ${input.shopAddress ? `<div class="muted">${escapeHtml(input.shopAddress)}</div>` : ''}
    </div>
    <div>
      <div class="label">${escapeHtml(copy.orderNo)}</div>
      <div class="value">#${escapeHtml(shortId)}</div>
      <div class="muted">${escapeHtml(copy.date)}: ${escapeHtml(timestamp)}</div>
      <div class="badge">${escapeHtml(input.statusLabel)}</div>
    </div>
    <div>
      <div class="label">${escapeHtml(copy.billTo)}</div>
      <div class="value">${escapeHtml(input.customerName || '—')}</div>
      <div class="muted">${escapeHtml(input.customerPhone || '—')}</div>
    </div>
    <div>
      <div class="label">${escapeHtml(copy.fulfillment)}</div>
      <div class="value">${escapeHtml(input.fulfillmentLabel)}</div>
      <div class="muted">${escapeHtml(input.fulfillmentDetail || '—')}</div>
      <div class="badge">${escapeHtml(input.paymentLabel)}</div>
    </div>
  </div>
  ${notes ? `<p class="muted">${escapeHtml(copy.notes)}: ${escapeHtml(notes)}</p>` : ''}
  <hr class="rule" />
  <table>
    <thead>
      <tr>
        <th>${escapeHtml(copy.item)}</th>
        <th>${escapeHtml(copy.qtyPrice)}</th>
        <th class="num">${escapeHtml(copy.lineTotal)}</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <div class="row"><span>${escapeHtml(copy.subtotal)}</span><span>${escapeHtml(formatEgp(order.subtotal, locale))}</span></div>
    <div class="row"><span>${escapeHtml(copy.deliveryFee)}</span><span>${escapeHtml(deliveryFree ? copy.deliveryFree : formatEgp(order.deliveryFee, locale))}</span></div>
    <div class="row grand"><span>${escapeHtml(copy.grandTotal)}</span><span>${escapeHtml(formatEgp(order.totalPrice, locale))}</span></div>
  </div>
</body>
</html>`;
}