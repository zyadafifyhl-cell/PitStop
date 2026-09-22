import type { Locale } from '@/lib/i18n/strings';
import type { AppThemeTokens } from '@/constants/Theme';
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
  const collectedPenaltyEgp = Math.max(0, booking.collectedPenaltyEgp ?? 0);
  return {
    subtotal,
    serviceFee,
    vat,
    collectedPenaltyEgp,
    total: servicePriceEgp + collectedPenaltyEgp,
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

const CUSTOMER_PAST_BOOKING_ACTIVE_STATUSES: Booking['status'][] = ['pending', 'confirmed', 'in_progress'];

/**
 * Virtual status for customer-facing booking UI. Past pending/confirmed/in_progress rows render as done
 * unless the merchant finalized them as cancelled or no_show.
 */
export function resolveCustomerDisplayStatus(booking: Booking, now = Date.now()): Booking['status'] {
  const raw = booking.status;
  if (raw === 'cancelled' || raw === 'no_show' || raw === 'suspended_by_shop' || raw === 'done') {
    return normalizeCustomerOrderStatus(raw);
  }
  const scheduledMs = new Date(booking.scheduledAt).getTime();
  if (!Number.isNaN(scheduledMs) && now > scheduledMs && CUSTOMER_PAST_BOOKING_ACTIVE_STATUSES.includes(raw)) {
    return 'done';
  }
  return normalizeCustomerOrderStatus(raw);
}

export function canBookAgainFromOrder(status: Booking['status']): boolean {
  return status === 'done' || status === 'cancelled';
}

/** Customer may cancel only while pending/confirmed and before the scheduled slot opens. */
export function canCustomerCancelBooking(booking: Booking, now = Date.now()): boolean {
  if (booking.status !== 'pending' && booking.status !== 'confirmed') return false;
  const scheduledMs = new Date(booking.scheduledAt).getTime();
  if (Number.isNaN(scheduledMs)) return false;
  return now < scheduledMs;
}

export function canRateCompletedOrder(status: Booking['status']): boolean {
  return status === 'done';
}

export type OrderStatusBadgeTone = {
  backgroundColor: string;
  color: string;
  borderColor: string;
};

export function orderStatusBadgeTone(
  status: Booking['status'],
  theme: AppThemeTokens,
): OrderStatusBadgeTone {
  if (status === 'suspended_by_shop') {
    return {
      backgroundColor: theme.cardHover,
      color: theme.textMuted,
      borderColor: theme.chipBorder,
    };
  }
  const normalized = normalizeCustomerOrderStatus(status);
  switch (normalized) {
    case 'pending':
      return {
        backgroundColor: theme.cardHover,
        color: theme.textMuted,
        borderColor: theme.chipBorder,
      };
    case 'confirmed':
      return {
        backgroundColor: theme.accentSoft,
        color: theme.text,
        borderColor: theme.chipBorder,
      };
    case 'done':
      return {
        backgroundColor: theme.accent,
        color: theme.onAccent,
        borderColor: theme.accent,
      };
    case 'cancelled':
      return {
        backgroundColor: theme.cardHover,
        color: theme.textMuted,
        borderColor: theme.chipBorder,
      };
    case 'no_show':
      return {
        backgroundColor: theme.cardHover,
        color: theme.textDim,
        borderColor: theme.chipBorder,
      };
    default:
      return {
        backgroundColor: theme.cardHover,
        color: theme.textMuted,
        borderColor: theme.chipBorder,
      };
  }
}

export function orderTotalLabel(booking: Booking, locale: Locale): string {
  const { servicePriceEgp } = normalizeBookingMoney(booking);
  const collectedPenaltyEgp = Math.max(0, booking.collectedPenaltyEgp ?? 0);
  return formatEgp(servicePriceEgp + collectedPenaltyEgp, locale);
}

export { sortBookingsByScheduledAtDesc } from '@/lib/booking/storage';
