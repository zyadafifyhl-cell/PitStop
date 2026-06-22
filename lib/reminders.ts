import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const WEEKLY_CHANNEL_ID = 'weekly-maintenance';

/** Stable id so scheduling weekly reminders does not cancel urgent SMS-interval alerts. */
export const WEEKLY_NOTIFICATION_ID = 'pitstop-weekly-maintenance';

/** Local scheduling APIs are not implemented on Expo web — guard all callers. */
export function areLocalNotificationsSupported(): boolean {
  return Platform.OS !== 'web';
}

if (areLocalNotificationsSupported()) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function ensureAndroidChannel(channelName = 'Maintenance reminders') {
  if (!areLocalNotificationsSupported()) return;
  if (Notifications.setNotificationChannelAsync) {
    await Notifications.setNotificationChannelAsync(WEEKLY_CHANNEL_ID, {
      name: channelName,
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1a73e8',
    });
  }
}

export type WeekdayIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type ReminderInterval = 'weekly' | 'every_2_days' | 'every_3_days';

export async function scheduleWeeklyReminder(
  weekday: WeekdayIndex,
  hour: number,
  minute: number,
  content?: { title: string; body: string },
  channelName?: string,
) {
  if (!areLocalNotificationsSupported()) return;
  await ensureAndroidChannel(channelName);
  await Notifications.cancelScheduledNotificationAsync(WEEKLY_NOTIFICATION_ID).catch(() => {});

  await Notifications.scheduleNotificationAsync({
    identifier: WEEKLY_NOTIFICATION_ID,
    content: {
      title: content?.title ?? 'PitStop',
      body:
        content?.body ??
        'Update your kilometer reading in the app and review what is due soon.',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday,
      hour,
      minute,
      channelId: WEEKLY_CHANNEL_ID,
    },
  });
}

/**
 * Schedule repeating reminder based on interval
 */
export async function scheduleRepeatingReminder(
  interval: ReminderInterval,
  weekday: WeekdayIndex,
  hour: number,
  minute: number,
  content?: { title: string; body: string },
  channelName?: string,
) {
  if (!areLocalNotificationsSupported()) return;
  await ensureAndroidChannel(channelName);
  await Notifications.cancelScheduledNotificationAsync(WEEKLY_NOTIFICATION_ID).catch(() => {});

  const notificationContent = {
    title: content?.title ?? 'PitStop',
    body:
      content?.body ??
      'Update your kilometer reading in the app and review what is due soon.',
  };

  if (interval === 'weekly') {
    // Use weekly trigger
    await Notifications.scheduleNotificationAsync({
      identifier: WEEKLY_NOTIFICATION_ID,
      content: notificationContent,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday,
        hour,
        minute,
        channelId: WEEKLY_CHANNEL_ID,
      },
    });
  } else {
    // Use daily repeating with calculation
    const seconds = interval === 'every_2_days' ? 2 * 24 * 60 * 60 : 3 * 24 * 60 * 60;
    
    await Notifications.scheduleNotificationAsync({
      identifier: WEEKLY_NOTIFICATION_ID,
      content: notificationContent,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds,
        repeats: true,
        channelId: WEEKLY_CHANNEL_ID,
      },
    });
  }
}

export async function cancelAllReminders() {
  if (!areLocalNotificationsSupported()) return;
  await Notifications.cancelScheduledNotificationAsync(WEEKLY_NOTIFICATION_ID).catch(() => {});
}

/** Whether our weekly repeating notification is currently scheduled (native only). */
export async function isWeeklyReminderScheduled(): Promise<boolean> {
  if (!areLocalNotificationsSupported()) return false;
  try {
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    return pending.some((p) => p.identifier === WEEKLY_NOTIFICATION_ID);
  } catch {
    return false;
  }
}

/** Immediate heads-up when interval consumption reaches 100% (does not cancel weekly reminders). */
export async function notifyMaintenanceUrgent(title: string, body: string, channelName?: string) {
  if (!areLocalNotificationsSupported()) return;
  await ensureAndroidChannel(channelName ?? 'Maintenance reminders');
  await Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 1,
      channelId: WEEKLY_CHANNEL_ID,
    },
  });
}

export async function getReminderPermissionStatus() {
  if (!areLocalNotificationsSupported()) return 'denied';
  const settings = await Notifications.getPermissionsAsync();
  return settings.status;
}

export async function requestReminderPermission() {
  if (!areLocalNotificationsSupported()) {
    return { status: 'denied' as const, granted: false, canAskAgain: false };
  }
  return Notifications.requestPermissionsAsync();
}

export async function getNotificationPermissionsAsync() {
  if (!areLocalNotificationsSupported()) {
    return { status: 'denied' as const, granted: false, canAskAgain: false };
  }
  return Notifications.getPermissionsAsync();
}
