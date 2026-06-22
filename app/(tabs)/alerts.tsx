import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import type { TranslationKey } from '@/lib/i18n/strings';
import * as garageSync from '@/lib/garageSync';
import {
  areLocalNotificationsSupported,
  cancelAllReminders,
  getNotificationPermissionsAsync,
  isWeeklyReminderScheduled,
  requestReminderPermission,
  scheduleWeeklyReminder,
  scheduleRepeatingReminder,
  type WeekdayIndex,
  type ReminderInterval,
} from '@/lib/reminders';

const WEEKDAY_OPTIONS: { labelKey: TranslationKey; value: WeekdayIndex }[] = [
  { labelKey: 'weekday_sun', value: 1 },
  { labelKey: 'weekday_mon', value: 2 },
  { labelKey: 'weekday_tue', value: 3 },
  { labelKey: 'weekday_wed', value: 4 },
  { labelKey: 'weekday_thu', value: 5 },
  { labelKey: 'weekday_fri', value: 6 },
  { labelKey: 'weekday_sat', value: 7 },
];

export default function AlertsScreen() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const { t, locale, setLocale } = useI18n();
  const { configured, session, signOut } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [weekday, setWeekday] = useState<WeekdayIndex>(1);
  const [reminderInterval, setReminderInterval] = useState<ReminderInterval>('weekly');
  const [cloudBusy, setCloudBusy] = useState(false);

  const notifsSupported = areLocalNotificationsSupported();

  React.useEffect(() => {
    if (!notifsSupported) {
      setEnabled(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const on = await isWeeklyReminderScheduled();
      if (!cancelled) setEnabled(on);
    })();
    return () => {
      cancelled = true;
    };
  }, [notifsSupported]);

  const toggle = useCallback(
    async (value: boolean) => {
      if (!notifsSupported) {
        Alert.alert(t('alerts_web_unsupported_title'), t('alerts_web_unsupported_body'));
        setEnabled(false);
        return;
      }
      if (value) {
        const perm = await requestReminderPermission();
        if (perm.status !== 'granted') {
          Alert.alert(t('alerts_perm_title'), t('alerts_perm_body'));
          setEnabled(false);
          return;
        }
        await scheduleRepeatingReminder(reminderInterval, weekday, 10, 0, {
          title: t('notif_title'),
          body: t('notif_body'),
        }, t('channel_maintenance'));
        setEnabled(true);
      } else {
        await cancelAllReminders();
        setEnabled(false);
      }
    },
    [weekday, reminderInterval, t, notifsSupported],
  );

  const changeWeekday = async (d: WeekdayIndex) => {
    setWeekday(d);
    if (!notifsSupported || !enabled) return;
    const perm = await getNotificationPermissionsAsync();
    if (perm.status === 'granted') {
      await scheduleRepeatingReminder(reminderInterval, d, 10, 0, {
        title: t('notif_title'),
        body: t('notif_body'),
      }, t('channel_maintenance'));
    }
  };

  const changeInterval = async (interval: ReminderInterval) => {
    setReminderInterval(interval);
    if (!notifsSupported || !enabled) return;
    const perm = await getNotificationPermissionsAsync();
    if (perm.status === 'granted') {
      await scheduleRepeatingReminder(interval, weekday, 10, 0, {
        title: t('notif_title'),
        body: t('notif_body'),
      }, t('channel_maintenance'));
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={styles.pad}>
      <Text style={[styles.h2, { color: palette.text }]}>{t('lang_heading')}</Text>
      <View style={styles.langRow}>
        <Pressable
          onPress={() => setLocale('en')}
          style={[
            styles.langChip,
            locale === 'en' && { backgroundColor: palette.tint },
          ]}>
          <Text style={[styles.langChipText, { color: locale === 'en' ? '#fff' : palette.text }]}>
            English
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setLocale('ar')}
          style={[
            styles.langChip,
            locale === 'ar' && { backgroundColor: palette.tint },
          ]}>
          <Text style={[styles.langChipText, { color: locale === 'ar' ? '#fff' : palette.text }]}>
            العربية
          </Text>
        </Pressable>
      </View>
      <Text style={[styles.langHint, { color: palette.tabIconDefault }]}>{t('lang_sub')}</Text>

      {!notifsSupported ? (
        <View style={[styles.webBanner, { backgroundColor: colorScheme === 'dark' ? '#2a2419' : '#fff8e6' }]}>
          <FontAwesome name="globe" size={18} color={palette.tint} />
          <Text style={[styles.webBannerText, { color: palette.text }]}>{t('alerts_web_notice')}</Text>
        </View>
      ) : null}

      <Text style={[styles.h2, { color: palette.text, marginTop: 20 }]}>
        {t('alerts_weekly_title')}
      </Text>
      <Text style={[styles.body, { color: palette.text }]}>{t('alerts_weekly_body')}</Text>

      <View style={[styles.row, { borderColor: colorScheme === 'dark' ? '#333' : '#ddd' }]}>
        <Text style={[styles.rowLabel, { color: palette.text }]}>{t('alerts_weekly_switch')}</Text>
        <Switch value={enabled} disabled={!notifsSupported} onValueChange={toggle} />
      </View>

      <Text style={[styles.h3, { color: palette.text }]}>{t('alerts_reminder_interval')}</Text>
      <View style={styles.intervalRow}>
        <Pressable
          onPress={() => changeInterval('weekly')}
          style={[
            styles.intervalChip,
            reminderInterval === 'weekly' && { backgroundColor: palette.tint },
            (!notifsSupported || !enabled) && { opacity: 0.45 },
          ]}>
          <Text
            style={[
              styles.intervalChipText,
              { color: reminderInterval === 'weekly' ? '#fff' : palette.text },
            ]}>
            {t('alerts_weekly')}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => changeInterval('every_2_days')}
          style={[
            styles.intervalChip,
            reminderInterval === 'every_2_days' && { backgroundColor: palette.tint },
            (!notifsSupported || !enabled) && { opacity: 0.45 },
          ]}>
          <Text
            style={[
              styles.intervalChipText,
              { color: reminderInterval === 'every_2_days' ? '#fff' : palette.text },
            ]}>
            {t('alerts_every_2_days')}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => changeInterval('every_3_days')}
          style={[
            styles.intervalChip,
            reminderInterval === 'every_3_days' && { backgroundColor: palette.tint },
            (!notifsSupported || !enabled) && { opacity: 0.45 },
          ]}>
          <Text
            style={[
              styles.intervalChipText,
              { color: reminderInterval === 'every_3_days' ? '#fff' : palette.text },
            ]}>
            {t('alerts_every_3_days')}
          </Text>
        </Pressable>
      </View>

      <Text style={[styles.h3, { color: palette.text }]}>{t('alerts_day_heading')}</Text>
      <View style={styles.weekRow}>
        {WEEKDAY_OPTIONS.map((d) => (
          <Pressable
            key={d.value}
            onPress={() => changeWeekday(d.value)}
            style={[
              styles.dayChip,
              weekday === d.value && { backgroundColor: palette.tint },
              (!notifsSupported || !enabled) && { opacity: 0.45 },
            ]}>
            <Text
              style={[
                styles.dayChipText,
                { color: weekday === d.value ? '#fff' : palette.text },
              ]}>
              {t(d.labelKey)}
            </Text>
          </Pressable>
        ))}
      </View>

      {configured && session ? (
        <>
          <Text style={[styles.h2, { color: palette.text, marginTop: 28 }]}>{t('cloud_heading')}</Text>
          <Text style={[styles.body, { color: palette.text }]}>{t('cloud_intro')}</Text>
          <View style={styles.cloudRow}>
            <Pressable
              disabled={cloudBusy}
              onPress={async () => {
                setCloudBusy(true);
                try {
                  await garageSync.uploadGarageSnapshot(session.user.id);
                  Alert.alert(t('cloud_done_upload'));
                } catch (e) {
                  Alert.alert(t('cloud_error'), e instanceof Error ? e.message : String(e));
                } finally {
                  setCloudBusy(false);
                }
              }}
              style={[styles.cloudBtn, { borderColor: palette.tint }]}>
              <Text style={[styles.cloudBtnText, { color: palette.tint }]}>{t('cloud_upload')}</Text>
            </Pressable>
            <Pressable
              disabled={cloudBusy}
              onPress={async () => {
                setCloudBusy(true);
                try {
                  await garageSync.downloadGarageSnapshot(session.user.id);
                  Alert.alert(t('cloud_done_download'));
                } catch (e) {
                  Alert.alert(t('cloud_error'), e instanceof Error ? e.message : String(e));
                } finally {
                  setCloudBusy(false);
                }
              }}
              style={[styles.cloudBtn, { borderColor: palette.tint }]}>
              <Text style={[styles.cloudBtnText, { color: palette.tint }]}>{t('cloud_download')}</Text>
            </Pressable>
          </View>
          {cloudBusy ? (
            <Text style={[styles.cloudBusy, { color: palette.tabIconDefault }]}>{t('cloud_busy')}</Text>
          ) : null}
          <Pressable onPress={() => signOut()} style={styles.signOutBtn}>
            <Text style={[styles.signOutText, { color: '#c62828' }]}>{t('auth_sign_out')}</Text>
          </Pressable>
        </>
      ) : null}

      <Text style={[styles.h2, { color: palette.text, marginTop: 28 }]}>{t('alerts_prnd_title')}</Text>
      <Text style={[styles.body, { color: palette.text }]}>{t('alerts_line_p')}</Text>
      <Text style={[styles.body, { color: palette.text }]}>{t('alerts_line_r')}</Text>
      <Text style={[styles.body, { color: palette.text }]}>{t('alerts_line_n')}</Text>
      <Text style={[styles.body, { color: palette.text }]}>{t('alerts_line_d')}</Text>
      <Text style={[styles.body, { color: palette.text }]}>{t('alerts_line_extra')}</Text>

      <View style={[styles.callout, { backgroundColor: colorScheme === 'dark' ? '#1c2a33' : '#e8f4fc' }]}>
        <FontAwesome name="info-circle" size={18} color={palette.tint} />
        <Text style={[styles.calloutText, { color: palette.text }]}>{t('alerts_callout')}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pad: {
    padding: 16,
    paddingBottom: 48,
  },
  langRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 8,
  },
  langChip: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: '#00000018',
  },
  langChipText: {
    fontWeight: '700',
    fontSize: 15,
  },
  langHint: {
    fontSize: 13,
    marginBottom: 4,
  },
  webBanner: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    padding: 14,
    borderRadius: 12,
    marginTop: 12,
    marginBottom: 4,
  },
  webBannerText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  h2: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  h3: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
  },
  rowLabel: {
    fontSize: 16,
    flex: 1,
    paddingRight: 12,
  },
  weekRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  intervalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 8,
  },
  intervalChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#00000018',
  },
  intervalChipText: {
    fontWeight: '600',
    fontSize: 14,
  },
  dayChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#00000022',
  },
  dayChipText: {
    fontWeight: '600',
    fontSize: 13,
  },
  callout: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    marginTop: 16,
    alignItems: 'flex-start',
  },
  calloutText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  cloudRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
    marginBottom: 8,
  },
  cloudBtn: {
    flex: 1,
    minWidth: 140,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cloudBtnText: {
    fontWeight: '700',
    fontSize: 15,
  },
  cloudBusy: {
    fontSize: 13,
    marginBottom: 8,
  },
  signOutBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    marginTop: 6,
    marginBottom: 8,
  },
  signOutText: {
    fontWeight: '600',
    fontSize: 15,
  },
});
