import type { Locale } from '@/lib/i18n/strings';
import type { BookingStatus, ShopType } from '@/lib/booking/types';

export function formatBookingDateTime(iso: string, locale: Locale): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-EG', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function shopTypeLabel(type: ShopType, locale: Locale): string {
  if (type === 'wash') return locale === 'ar' ? 'غسيل' : 'Car wash';
  if (type === 'parts') return locale === 'ar' ? 'قطع غيار' : 'Spare parts';
  if (type === 'winch') return locale === 'ar' ? 'ونش' : 'Winch';
  return locale === 'ar' ? 'صيانة' : 'Maintenance';
}

export function bookingStatusLabel(status: BookingStatus, locale: Locale): string {
  const map: Record<BookingStatus, { en: string; ar: string }> = {
    pending: { en: 'Pending', ar: 'قيد الانتظار' },
    confirmed: { en: 'Confirmed', ar: 'مؤكد' },
    cancelled: { en: 'Cancelled', ar: 'ملغي' },
    done: { en: 'Done', ar: 'تم' },
  };
  return locale === 'ar' ? map[status].ar : map[status].en;
}

export const TIME_SLOTS = [
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
];

export function buildScheduledIso(dateYmd: string, timeHm: string): string | null {
  const iso = `${dateYmd}T${timeHm}:00`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getTime() < Date.now()) return null;
  return d.toISOString();
}

export function defaultBookingDateYmd(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toDateYmd(d);
}

export function toDateYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function dateFromYmd(ymd: string): Date | null {
  const d = new Date(`${ymd}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDateYmdLabel(ymd: string, locale: Locale): string {
  const d = dateFromYmd(ymd);
  if (!d) return ymd;
  return d.toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-EG', {
    weekday: 'short',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function minBookingDate(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
