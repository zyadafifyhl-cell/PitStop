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
  return bookingStatusLabel(status, locale);
}

export function orderTotalLabel(booking: Booking, locale: Locale): string {
  const { servicePriceEgp } = normalizeBookingMoney(booking);
  return formatEgp(servicePriceEgp, locale);
}
