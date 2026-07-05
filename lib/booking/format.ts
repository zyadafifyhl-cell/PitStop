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
  if (type === 'accessories') return locale === 'ar' ? 'إكسسوارات' : 'Accessories';
  if (type === 'winch') return locale === 'ar' ? 'ونش' : 'Winch';
  return locale === 'ar' ? 'صيانة' : 'Maintenance';
}

export function bookingStatusLabel(status: BookingStatus, locale: Locale): string {
  const map: Record<BookingStatus, { en: string; ar: string }> = {
    pending: { en: 'Pending', ar: 'قيد الانتظار' },
    confirmed: { en: 'Confirmed', ar: 'مؤكد' },
    in_progress: { en: 'Confirmed', ar: 'مؤكد' },
    done: { en: 'Completed', ar: 'مكتمل' },
    cancelled: { en: 'Cancelled', ar: 'ملغي' },
    no_show: { en: 'No show', ar: 'لم يحضر' },
    suspended_by_shop: { en: 'Shop Temporarily Closed', ar: 'المحل مغلق مؤقتًا' },
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

export const DEFAULT_WORK_OPEN = '09:00';
export const DEFAULT_WORK_CLOSE = '18:00';
export const DEFAULT_SERVICE_DURATION_MINUTES = 60;

function parseHm(hm: string): { h: number; m: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

function hmToMinutes(hm: string): number | null {
  const parsed = parseHm(hm);
  if (!parsed) return null;
  return parsed.h * 60 + parsed.m;
}

function minutesToHm(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Build bookable slots from shop hours and service duration. Requires saved owner hours. */
export function buildShopTimeSlots(
  openHm: string | undefined,
  closeHm: string | undefined,
  durationMinutes: number | undefined,
  dateYmd?: string,
): string[] {
  if (!openHm?.trim() || !closeHm?.trim() || !durationMinutes) return [];

  const open = hmToMinutes(openHm);
  const close = hmToMinutes(closeHm);
  if (open == null || close == null) return [];
  const duration = Math.max(15, Math.min(240, durationMinutes));
  if (close <= open) return [];

  const now = new Date();
  const isToday = dateYmd === toDateYmd(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const slots: string[] = [];
  for (let start = open; start + duration <= close; start += duration) {
    if (isToday && start <= nowMinutes) continue;
    slots.push(minutesToHm(start));
  }
  return slots;
}

export function normalizeTimeHm(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const colonMatch = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (colonMatch) {
    const h = Number(colonMatch[1]);
    const m = Number(colonMatch[2]);
    if (h > 23 || m > 59) return null;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // "8" or "20" → 08:00 / 20:00 (24-hour)
  const hourOnly = /^(\d{1,2})$/.exec(trimmed);
  if (hourOnly) {
    const h = Number(hourOnly[1]);
    if (h > 23) return null;
    return `${String(h).padStart(2, '0')}:00`;
  }

  return null;
}

export function formatShopScheduleLine(
  openHm: string,
  closeHm: string,
  durationMinutes: number,
  locale: 'en' | 'ar',
): string {
  if (locale === 'ar') {
    return `مواعيد المحل: ${openHm} – ${closeHm} · كل حجز ${durationMinutes} دقيقة`;
  }
  return `Shop hours: ${openHm} – ${closeHm} · ${durationMinutes} min per booking`;
}

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
