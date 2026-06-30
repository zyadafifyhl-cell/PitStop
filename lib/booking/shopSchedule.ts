import type { Booking, ShopDayHours, ShopExtras, ShopService } from '@/lib/booking/types';
import { toDateYmd } from '@/lib/booking/format';

export type SlotAvailability = 'available' | 'almost_full' | 'booked';

export type TimeSlotOption = {
  time: string;
  status: SlotAvailability;
};

function hmToMinutes(hm: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

function minutesToHm(total: number): string {
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const DAY_KEYS = [0, 1, 2, 3, 4, 5, 6] as const;

export function defaultWeeklyHours(): ShopDayHours[] {
  return DAY_KEYS.map((day) => ({
    day,
    closed: day === 5,
    openTime: day === 6 ? '10:00' : '09:00',
    closeTime: day === 6 ? '00:00' : '23:00',
  }));
}

export function getDayHoursForDate(extras: ShopExtras | null | undefined, dateYmd: string): {
  openTime?: string;
  closeTime?: string;
  closed: boolean;
  durationMinutes: number;
} {
  const d = new Date(`${dateYmd}T12:00:00`);
  const day = d.getDay() as ShopDayHours['day'];
  const weekly = extras?.weeklyHours?.find((row) => row.day === day);
  const durationMinutes = extras?.serviceDurationMinutes ?? 60;

  if (weekly) {
    return {
      openTime: weekly.openTime,
      closeTime: weekly.closeTime,
      closed: !!weekly.closed,
      durationMinutes,
    };
  }

  if (shopHasLegacySchedule(extras)) {
    return {
      openTime: extras!.workOpenTime,
      closeTime: extras!.workCloseTime,
      closed: false,
      durationMinutes,
    };
  }

  return { closed: true, durationMinutes };
}

function shopHasLegacySchedule(extras: ShopExtras | null | undefined): boolean {
  return !!(extras?.scheduleSavedAt && extras.workOpenTime && extras.workCloseTime);
}

export function shopHasCustomerSchedule(extras: ShopExtras | null | undefined): boolean {
  if (!extras) return false;
  if (extras.weeklyHours?.some((row) => !row.closed && row.openTime && row.closeTime)) return true;
  return shopHasLegacySchedule(extras);
}

export function buildSlotsForShopDate(input: {
  extras: ShopExtras | null | undefined;
  dateYmd: string;
  bookings: Booking[];
}): TimeSlotOption[] {
  if (input.extras?.washShopStatus === 'vacation' || input.extras?.washShopStatus === 'closed') {
    return [];
  }

  const { openTime, closeTime, closed, durationMinutes } = getDayHoursForDate(input.extras, input.dateYmd);
  if (closed || !openTime || !closeTime) return [];

  const d = new Date(`${input.dateYmd}T12:00:00`);
  const day = d.getDay() as ShopDayHours['day'];
  const weekly = input.extras?.weeklyHours?.find((row) => row.day === day);
  const breakStart = weekly?.breakStartTime ? hmToMinutes(weekly.breakStartTime) : null;
  const breakEnd = weekly?.breakEndTime ? hmToMinutes(weekly.breakEndTime) : null;

  const open = hmToMinutes(openTime);
  const close = hmToMinutes(closeTime);
  if (open == null || close == null) return [];

  let end = close;
  if (end <= open) end += 24 * 60;

  const now = new Date();
  const isToday = input.dateYmd === toDateYmd(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const bookedTimes = new Set(
    input.bookings
      .filter((b) => b.status !== 'cancelled' && b.scheduledAt.startsWith(input.dateYmd))
      .map((b) => {
        const slotDate = new Date(b.scheduledAt);
        return `${String(slotDate.getHours()).padStart(2, '0')}:${String(slotDate.getMinutes()).padStart(2, '0')}`;
      }),
  );

  const slots: TimeSlotOption[] = [];
  for (let start = open; start + durationMinutes <= end; start += durationMinutes) {
    const normalizedStart = start >= 24 * 60 ? start - 24 * 60 : start;
    const time = minutesToHm(normalizedStart);
    if (isToday && normalizedStart <= nowMinutes) continue;
    if (breakStart != null && breakEnd != null && normalizedStart >= breakStart && normalizedStart < breakEnd) {
      continue;
    }

    let status: SlotAvailability = 'available';
    if (bookedTimes.has(time)) {
      status = 'booked';
    } else {
      const nextSlot = minutesToHm(normalizedStart + durationMinutes);
      if (bookedTimes.has(nextSlot)) status = 'almost_full';
    }

    slots.push({ time, status });
  }

  return slots;
}

export function getShopOpenStatus(extras: ShopExtras | null | undefined, now = new Date()): {
  isOpen: boolean;
  labelEn: string;
  labelAr: string;
} {
  if (extras?.washShopStatus === 'vacation') {
    const returnDate = extras.vacationReturnDate
      ? new Date(`${extras.vacationReturnDate}T12:00:00`).toLocaleDateString('en-GB')
      : '';
    const msg = extras.vacationMessage?.trim() || 'Vacation mode';
    const msgAr = extras.vacationMessageAr?.trim() || 'وضع الإجازة';
    return {
      isOpen: false,
      labelEn: returnDate ? `${msg} · Returns ${returnDate}` : msg,
      labelAr: returnDate ? `${msgAr} · يرجع ${returnDate}` : msgAr,
    };
  }

  if (extras?.washShopStatus === 'closed') {
    return { isOpen: false, labelEn: 'Closed', labelAr: 'مغلق' };
  }

  const dateYmd = toDateYmd(now);
  const { openTime, closeTime, closed } = getDayHoursForDate(extras, dateYmd);

  if (closed || !openTime || !closeTime) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const next = getDayHoursForDate(extras, toDateYmd(tomorrow));
    return {
      isOpen: false,
      labelEn: next.openTime ? `Closed · Opens tomorrow at ${format12h(next.openTime)}` : 'Closed',
      labelAr: next.openTime ? `مغلق · يفتح بكرة الساعة ${next.openTime}` : 'مغلق',
    };
  }

  const open = hmToMinutes(openTime)!;
  let close = hmToMinutes(closeTime)!;
  if (close <= open) close += 24 * 60;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let nowAdjusted = nowMin;
  if (nowMin < open && close > 24 * 60) nowAdjusted += 24 * 60;

  const isOpen = nowAdjusted >= open && nowAdjusted < close;
  if (isOpen) {
    const closeDisplay = close >= 24 * 60 ? minutesToHm(close - 24 * 60) : closeTime;
    if (extras?.washShopStatus === 'busy') {
      return {
        isOpen: true,
        labelEn: `Busy · Closes at ${format12h(closeDisplay)}`,
        labelAr: `مزدحم · يقفل ${closeDisplay}`,
      };
    }
    return {
      isOpen: true,
      labelEn: `Open now · Closes at ${format12h(closeDisplay)}`,
      labelAr: `مفتوح · يقفل ${closeDisplay}`,
    };
  }

  return {
    isOpen: false,
    labelEn: `Closed · Opens at ${format12h(openTime)}`,
    labelAr: `مغلق · يفتح ${openTime}`,
  };
}

function format12h(hm: string): string {
  const [hRaw, mRaw] = hm.split(':').map(Number);
  const h = hRaw % 24;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(mRaw).padStart(2, '0')} ${suffix}`;
}

export function dayName(day: ShopDayHours['day'], locale: 'en' | 'ar'): string {
  const namesEn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const namesAr = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  return locale === 'ar' ? namesAr[day] : namesEn[day];
}

export function formatWeeklyHoursLines(extras: ShopExtras | null | undefined, locale: 'en' | 'ar'): string[] {
  return getWeeklyHoursDisplayRows(extras, locale).map((row) => {
    if (row.closed) {
      return locale === 'ar' ? `${row.dayLabel}     ${row.statusLabel}` : `${row.dayLabel}     ${row.statusLabel}`;
    }
    return locale === 'ar'
      ? `${row.dayLabel}     ${row.hoursLabel}`
      : `${row.dayLabel}     ${row.hoursLabel}`;
  });
}

export type WeeklyHoursDisplayRow = {
  day: ShopDayHours['day'];
  dayLabel: string;
  hoursLabel: string;
  statusLabel: string;
  closed: boolean;
  isToday: boolean;
};

export function getWeeklyHoursDisplayRows(
  extras: ShopExtras | null | undefined,
  locale: 'en' | 'ar',
): WeeklyHoursDisplayRow[] {
  const rows = extras?.weeklyHours?.length ? extras.weeklyHours : defaultWeeklyHours();
  const today = new Date().getDay();
  const closedLabel = locale === 'ar' ? 'مغلق' : 'Closed';
  const openLabel = locale === 'ar' ? 'مفتوح' : 'Open';

  return rows
    .slice()
    .sort((a, b) => a.day - b.day)
    .map((row) => {
      const dayLabel = dayName(row.day, locale);
      if (row.closed) {
        return {
          day: row.day,
          dayLabel,
          hoursLabel: '—',
          statusLabel: closedLabel,
          closed: true,
          isToday: row.day === today,
        };
      }
      const open = row.openTime ?? '09:00';
      const close = row.closeTime ?? '23:00';
      const hoursLabel =
        locale === 'ar' ? `${open} - ${close}` : `${format12h(open)} - ${format12h(close)}`;
      return {
        day: row.day,
        dayLabel,
        hoursLabel,
        statusLabel: openLabel,
        closed: false,
        isToday: row.day === today,
      };
    });
}

export function defaultWashServices(): ShopService[] {
  return [
    { id: 'svc-exterior', name: 'Exterior Wash', nameAr: 'غسيل خارجي', priceEgp: 120, durationMinutes: 20, active: true, sortOrder: 1 },
    { id: 'svc-interior', name: 'Interior Cleaning', nameAr: 'تنظيف داخلي', priceEgp: 150, durationMinutes: 30, active: true, sortOrder: 2 },
    { id: 'svc-steam', name: 'Steam Cleaning', nameAr: 'تنظيف بالبخار', priceEgp: 300, durationMinutes: 45, active: true, sortOrder: 3 },
    { id: 'svc-wax', name: 'Wax & Polish', nameAr: 'تلميع وشمع', priceEgp: 450, durationMinutes: 60, active: true, sortOrder: 4 },
    { id: 'svc-premium', name: 'Premium Wash Package', nameAr: 'باقة غسيل Premium', priceEgp: 600, durationMinutes: 60, active: true, sortOrder: 5 },
    { id: 'svc-ceramic', name: 'Ceramic Protection', nameAr: 'حماية سيراميك', priceEgp: 1800, durationMinutes: 120, active: true, sortOrder: 6 },
  ];
}

export function getActiveServices(extras: ShopExtras | null | undefined): ShopService[] {
  const list = extras?.services?.filter((s) => s.active) ?? [];
  if (list.length) return list.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  return defaultWashServices();
}

export function getServiceById(extras: ShopExtras | null | undefined, serviceId?: string): ShopService | undefined {
  if (!serviceId) return undefined;
  return getActiveServices(extras).find((s) => s.id === serviceId);
}
