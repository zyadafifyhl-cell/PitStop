import type { Locale } from '@/lib/i18n/strings';
import type { Booking, Shop, ShopType } from '@/lib/booking/types';
import { bookingStatusLabel, shopTypeLabel } from '@/lib/booking/format';
import { formatEgp, normalizeBookingMoney } from '@/lib/booking/reporting';

export function formatOrderCardDateTime(iso: string, locale: Locale): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const datePart = d.toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-US', {
    month: 'short',
    day: '2-digit',
  });
  const timePart = d.toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${datePart} • ${timePart}`;
}

export function formatBookingIdLabel(bookingId: string, locale: Locale): string {
  const shortId = bookingId.replace(/-/g, '').slice(-8).toUpperCase();
  return locale === 'ar' ? `رقم الحجز ${shortId}` : `Booking ID ${shortId}`;
}

export function serviceLabelForBooking(booking: Booking, locale: Locale): string {
  if (locale === 'ar' && booking.serviceNameAr) return booking.serviceNameAr;
  if (booking.serviceName) return booking.serviceName;
  return shopTypeLabel(booking.shopType, locale);
}

export function serviceIconName(type: ShopType): 'wrench' | 'tint' | 'cogs' | 'life-ring' {
  if (type === 'wash') return 'tint';
  if (type === 'maintenance') return 'wrench';
  if (type === 'winch') return 'life-ring';
  return 'cogs';
}

export function formatVehicleLine(booking: Booking): string {
  const parts = [booking.carType.trim()];
  if (booking.carColor?.trim()) parts.push(booking.carColor.trim());
  return parts.filter(Boolean).join(' · ');
}

export function formatServiceDuration(minutes: number | undefined, locale: Locale): string {
  const safe = Math.max(15, minutes ?? 60);
  return locale === 'ar' ? `${safe} دقيقة` : `${safe} mins`;
}

export function computeCustomerOrderBreakdown(booking: Booking) {
  const { servicePriceEgp, platformFeeEgp } = normalizeBookingMoney(booking);
  const serviceFee = platformFeeEgp;
  const vat = Math.round(((servicePriceEgp - serviceFee) * 14) / 114 * 100) / 100;
  const subtotal = Math.round((servicePriceEgp - serviceFee - vat) * 100) / 100;
  return {
    subtotal,
    serviceFee,
    vat,
    total: servicePriceEgp,
  };
}

export function orderLineItems(booking: Booking, locale: Locale) {
  const label = serviceLabelForBooking(booking, locale);
  const { servicePriceEgp } = normalizeBookingMoney(booking);
  return [{ qty: 1, label, priceEgp: servicePriceEgp }];
}

export function resolveShopDisplayName(shop: Shop | undefined, shopId: string, locale: Locale): string {
  if (!shop) return shopId;
  return locale === 'ar' ? shop.nameAr : shop.name;
}

export function resolveShopAddress(shop: Shop | undefined, locale: Locale, branchAddress?: string): string {
  if (branchAddress?.trim()) return branchAddress.trim();
  if (!shop) return '—';
  return locale === 'ar' ? shop.addressAr : shop.address;
}

export function resolveShopPhone(shop: Shop | undefined): string {
  return shop?.phone?.trim() || '—';
}

export function orderStatusLabel(status: Booking['status'], locale: Locale): string {
  if (status === 'suspended_by_shop') {
    return bookingStatusLabel(status, locale);
  }
  return bookingStatusLabel(normalizeCustomerOrderStatus(status), locale);
}

/** Customer order cards treat legacy in_progress as confirmed in the wash lifecycle. */
export function normalizeCustomerOrderStatus(status: Booking['status']): Booking['status'] {
  if (status === 'suspended_by_shop') return status;
  if (status === 'in_progress') return 'confirmed';
  return status;
}

export function canBookAgainFromOrder(status: Booking['status']): boolean {
  return status === 'done' || status === 'cancelled';
}

export function canRateCompletedOrder(status: Booking['status']): boolean {
  return status === 'done';
}

export type OrderStatusBadgeTone = {
  backgroundColor: string;
  color: string;
  borderColor: string;
};

export function orderStatusBadgeTone(status: Booking['status']): OrderStatusBadgeTone {
  if (status === 'suspended_by_shop') {
    return {
      backgroundColor: 'rgba(234, 179, 8, 0.22)',
      color: '#FDE68A',
      borderColor: 'rgba(234, 179, 8, 0.45)',
    };
  }
  const normalized = normalizeCustomerOrderStatus(status);
  switch (normalized) {
    case 'pending':
      return {
        backgroundColor: 'rgba(245, 158, 11, 0.18)',
        color: '#FCD34D',
        borderColor: 'rgba(245, 158, 11, 0.35)',
      };
    case 'confirmed':
      return {
        backgroundColor: 'rgba(0, 212, 255, 0.16)',
        color: '#67E8F9',
        borderColor: 'rgba(0, 212, 255, 0.35)',
      };
    case 'done':
      return {
        backgroundColor: 'rgba(34, 197, 94, 0.18)',
        color: '#86EFAC',
        borderColor: 'rgba(34, 197, 94, 0.35)',
      };
    case 'cancelled':
      return {
        backgroundColor: 'rgba(239, 68, 68, 0.16)',
        color: '#FCA5A5',
        borderColor: 'rgba(239, 68, 68, 0.35)',
      };
    case 'no_show':
      return {
        backgroundColor: 'rgba(234, 179, 8, 0.18)',
        color: '#FDE047',
        borderColor: 'rgba(234, 179, 8, 0.35)',
      };
    default:
      return {
        backgroundColor: 'rgba(255,255,255,0.08)',
        color: '#C5D1E3',
        borderColor: 'rgba(255,255,255,0.12)',
      };
  }
}

export function orderTotalLabel(booking: Booking, locale: Locale): string {
  const { servicePriceEgp } = normalizeBookingMoney(booking);
  return formatEgp(servicePriceEgp, locale);
}

export { sortBookingsByScheduledAtDesc } from '@/lib/booking/storage';
