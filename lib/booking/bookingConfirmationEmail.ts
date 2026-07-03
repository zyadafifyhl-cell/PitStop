import { APP_BRAND_NAME } from '@/constants/Brand';
import { formatBookingDateTime } from '@/lib/booking/format';
import { formatEgp, normalizeBookingMoney } from '@/lib/booking/reporting';
import type { Booking, Shop } from '@/lib/booking/types';

export type BookingConfirmationEmailInput = {
  booking: Booking;
  shop: Shop;
  shopDisplayName: string;
  locale: 'en' | 'ar';
  customerEmail?: string;
  serviceLines?: string[];
};

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function buildBookingConfirmationHtml(input: BookingConfirmationEmailInput): string {
  const { booking, shop, shopDisplayName, locale } = input;
  const isAr = locale === 'ar';
  const money = normalizeBookingMoney(booking);
  const when = formatBookingDateTime(booking.scheduledAt, locale);
  const services =
    input.serviceLines ??
    (booking.serviceName
      ? [isAr ? booking.serviceNameAr || booking.serviceName : booking.serviceName]
      : [isAr ? 'خدمة محجوزة' : 'Booked service']);

  const serviceRows = services
    .map(
      (line) =>
        `<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${escapeHtml(line)}</td></tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="${isAr ? 'ar' : 'en'}" dir="${isAr ? 'rtl' : 'ltr'}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${isAr ? 'تأكيد الحجز' : 'Booking confirmed'}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr>
          <td style="background:#059669;color:#ffffff;padding:20px 24px;text-align:center;">
            <div style="font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;opacity:0.92;">
              ${isAr ? 'تم التأكيد' : 'Confirmed'}
            </div>
            <div style="font-size:24px;font-weight:900;margin-top:6px;">
              ${isAr ? 'حجزك مؤكّد' : 'Your booking is confirmed'}
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding:24px;">
            <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
              ${isAr ? 'مرحبًا،' : 'Hello,'}<br/>
              ${isAr ? 'تمت الموافقة على حجزك في' : 'Your appointment at'} <strong>${escapeHtml(shopDisplayName)}</strong> ${isAr ? 'بنجاح.' : 'has been approved.'}
            </p>
            <table role="presentation" width="100%" style="border:1px solid #e5e7eb;border-radius:12px;margin-bottom:16px;">
              <tr><td style="padding:12px 14px;background:#f9fafb;font-weight:800;color:#111827;">
                ${isAr ? 'تفاصيل الموعد' : 'Appointment details'}
              </td></tr>
              <tr><td style="padding:10px 14px;color:#374151;font-size:14px;">
                <strong>${isAr ? 'الموعد:' : 'When:'}</strong> ${escapeHtml(when)}
              </td></tr>
              <tr><td style="padding:10px 14px;color:#374151;font-size:14px;">
                <strong>${isAr ? 'السيارة:' : 'Vehicle:'}</strong> ${escapeHtml(booking.carType)}${booking.carColor ? ` · ${escapeHtml(booking.carColor)}` : ''}
              </td></tr>
              <tr><td style="padding:10px 14px;color:#374151;font-size:14px;">
                <strong>${isAr ? 'الهاتف:' : 'Phone:'}</strong> ${escapeHtml(booking.customerPhone || '—')}
              </td></tr>
            </table>
            <table role="presentation" width="100%" style="border:1px solid #e5e7eb;border-radius:12px;margin-bottom:16px;">
              <tr><td style="padding:12px 14px;background:#f9fafb;font-weight:800;color:#111827;">
                ${isAr ? 'الخدمات' : 'Services'}
              </td></tr>
              ${serviceRows}
              <tr><td style="padding:12px 14px;font-weight:800;color:#059669;font-size:16px;">
                ${isAr ? 'الإجمالي:' : 'Total:'} ${escapeHtml(formatEgp(money.servicePriceEgp, locale))}
              </td></tr>
            </table>
            ${booking.customerNotes ? `<p style="margin:0 0 12px;color:#6b7280;font-size:13px;line-height:1.5;"><strong>${isAr ? 'ملاحظات:' : 'Notes:'}</strong> ${escapeHtml(booking.customerNotes)}</p>` : ''}
            <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.6;">
              ${isAr ? 'احتفظ بهذا الإيميل كإيصال. نراك في الموعد!' : 'Keep this email as your receipt. See you at your appointment!'}
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 24px;background:#f9fafb;text-align:center;color:#9ca3af;font-size:11px;">
            ${APP_BRAND_NAME} · ${escapeHtml(shop.type)} · ${escapeHtml(booking.id.slice(0, 8))}
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildBookingConfirmationPlainText(input: BookingConfirmationEmailInput): {
  subject: string;
  body: string;
} {
  const { booking, shopDisplayName, locale } = input;
  const isAr = locale === 'ar';
  const money = normalizeBookingMoney(booking);
  const when = formatBookingDateTime(booking.scheduledAt, locale);
  const services =
    input.serviceLines ??
    (booking.serviceName ? [booking.serviceName] : [isAr ? 'خدمة' : 'Service']);

  if (isAr) {
    return {
      subject: `تم التأكيد — ${shopDisplayName}`,
      body:
        `تم التأكيد\n\n` +
        `محل: ${shopDisplayName}\n` +
        `الموعد: ${when}\n` +
        `السيارة: ${booking.carType}${booking.carColor ? ` · ${booking.carColor}` : ''}\n` +
        `الخدمات:\n${services.map((s) => `- ${s}`).join('\n')}\n` +
        `الإجمالي: ${formatEgp(money.servicePriceEgp, locale)}\n\n` +
        APP_BRAND_NAME,
    };
  }

  return {
    subject: `Confirmed — ${shopDisplayName}`,
    body:
      `Confirmed\n\n` +
      `Shop: ${shopDisplayName}\n` +
      `When: ${when}\n` +
      `Vehicle: ${booking.carType}${booking.carColor ? ` · ${booking.carColor}` : ''}\n` +
      `Services:\n${services.map((s) => `- ${s}`).join('\n')}\n` +
      `Total: ${formatEgp(money.servicePriceEgp, locale)}\n\n` +
      APP_BRAND_NAME,
  };
}
