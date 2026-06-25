import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

import { pushCustomerNotification } from '@/lib/booking/commerceEvents';
import { getShopById } from '@/lib/booking/catalogRepository';
import { formatBookingDateTime } from '@/lib/booking/format';
import { areLocalNotificationsSupported, ensureAndroidChannel } from '@/lib/reminders';

const REMINDERS_KEY = '@pitstop/booking-reminders/v1';
const BOOKING_CHANNEL_ID = 'booking-reminders';

const REMINDER_OFFSETS_MINUTES = [60, 30] as const;

type BookingReminderEntry = {
  id: string;
  bookingId: string;
  shopId: string;
  customerId?: string;
  customerPhone: string;
  scheduledAt: string;
  fireAt: string;
  minutesBefore: number;
  firedAt?: string;
};

async function readReminders(): Promise<BookingReminderEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(REMINDERS_KEY);
    const parsed = raw ? (JSON.parse(raw) as BookingReminderEntry[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeReminders(rows: BookingReminderEntry[]): Promise<void> {
  await AsyncStorage.setItem(REMINDERS_KEY, JSON.stringify(rows));
}

function reminderNotificationId(bookingId: string, minutesBefore: number): string {
  return `pitstop-booking-${bookingId}-${minutesBefore}`;
}

function reminderBody(
  shopName: string,
  whenLabel: string,
  minutesBefore: number,
  locale: 'en' | 'ar',
): string {
  if (locale === 'ar') {
    if (minutesBefore >= 60) {
      return `حجزك في ${shopName} بعد ساعة (${whenLabel}) — جهّز نفسك!`;
    }
    return `حجزك في ${shopName} بعد 30 دقيقة — جهّز نفسك!`;
  }
  if (minutesBefore >= 60) {
    return `Your booking at ${shopName} is in 1 hour (${whenLabel}) — get ready!`;
  }
  return `Your booking at ${shopName} is in 30 minutes — get ready!`;
}

async function scheduleNativeReminder(input: {
  bookingId: string;
  shopId: string;
  scheduledAt: string;
  minutesBefore: number;
  locale?: 'en' | 'ar';
}): Promise<void> {
  if (!areLocalNotificationsSupported()) return;
  const scheduledMs = new Date(input.scheduledAt).getTime();
  if (Number.isNaN(scheduledMs)) return;
  const fireAtMs = scheduledMs - input.minutesBefore * 60 * 1000;
  const secondsUntil = Math.round((fireAtMs - Date.now()) / 1000);
  if (secondsUntil < 5) return;

  const shop = getShopById(input.shopId);
  const shopName = shop?.name ?? input.shopId;
  const locale = input.locale ?? 'en';
  const whenLabel = formatBookingDateTime(input.scheduledAt, locale);

  await ensureAndroidChannel('Booking reminders', BOOKING_CHANNEL_ID);
  await Notifications.cancelScheduledNotificationAsync(
    reminderNotificationId(input.bookingId, input.minutesBefore),
  ).catch(() => {});

  await Notifications.scheduleNotificationAsync({
    identifier: reminderNotificationId(input.bookingId, input.minutesBefore),
    content: {
      title: locale === 'ar' ? 'تذكير الحجز · PitStop' : 'Booking reminder · PitStop',
      body: reminderBody(shopName, whenLabel, input.minutesBefore, locale),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: secondsUntil,
      channelId: BOOKING_CHANNEL_ID,
    },
  });
}

/** Schedule in-app + native reminders after owner approves a booking. */
export async function scheduleBookingReminders(input: {
  bookingId: string;
  shopId: string;
  customerId?: string;
  customerPhone: string;
  scheduledAt: string;
  locale?: 'en' | 'ar';
}): Promise<void> {
  await cancelBookingReminders(input.bookingId);

  const scheduledMs = new Date(input.scheduledAt).getTime();
  if (Number.isNaN(scheduledMs)) return;

  const rows = await readReminders();
  for (const minutesBefore of REMINDER_OFFSETS_MINUTES) {
    const fireAtMs = scheduledMs - minutesBefore * 60 * 1000;
    if (fireAtMs <= Date.now()) continue;
    rows.push({
      id: reminderNotificationId(input.bookingId, minutesBefore),
      bookingId: input.bookingId,
      shopId: input.shopId,
      customerId: input.customerId,
      customerPhone: input.customerPhone,
      scheduledAt: input.scheduledAt,
      fireAt: new Date(fireAtMs).toISOString(),
      minutesBefore,
    });
    await scheduleNativeReminder({ ...input, minutesBefore });
  }
  await writeReminders(rows);
}

export async function cancelBookingReminders(bookingId: string): Promise<void> {
  const rows = await readReminders();
  const next = rows.filter((row) => row.bookingId !== bookingId);
  if (next.length !== rows.length) await writeReminders(next);

  if (!areLocalNotificationsSupported()) return;
  for (const minutesBefore of REMINDER_OFFSETS_MINUTES) {
    await Notifications.cancelScheduledNotificationAsync(
      reminderNotificationId(bookingId, minutesBefore),
    ).catch(() => {});
  }
}

/** Fire due in-app reminders (call on app focus / interval). */
export async function processDueBookingReminders(): Promise<void> {
  const rows = await readReminders();
  const now = Date.now();
  let changed = false;

  for (const entry of rows) {
    if (entry.firedAt) continue;
    if (new Date(entry.fireAt).getTime() > now) continue;

    await pushCustomerNotification({
      customerId: entry.customerId,
      customerPhone: entry.customerPhone,
      kind: 'booking_reminder',
      shopId: entry.shopId,
      bookingId: entry.bookingId,
      scheduledAt: entry.scheduledAt,
      reminderMinutesBefore: entry.minutesBefore,
    });
    entry.firedAt = new Date().toISOString();
    changed = true;
  }

  if (changed) await writeReminders(rows);
}
