import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import Colors from '@/constants/Colors';
import { MaintenanceRing } from '@/components/MaintenanceRing';
import { useColorScheme } from '@/components/useColorScheme';
import { useI18n } from '@/context/I18nContext';
import type { TranslationKey } from '@/lib/i18n/strings';
import {
  clearServiceDone,
  deleteUserVehicle,
  getVehicleServices,
  listUserVehicles,
  markServiceDone,
  updateOdometer,
  type UserVehicleRow,
} from '@/lib/storage';
import { notifyMaintenanceUrgent } from '@/lib/reminders';
import { computeServiceRows, type ServiceUiRow } from '@/lib/serviceStatus';

function bandStyle(band: ServiceUiRow['band']) {
  switch (band) {
    case 'due':
      return { bg: '#ffebee', fg: '#b71c1c' };
    case 'soon':
      return { bg: '#fff3e0', fg: '#e65100' };
    case 'ok':
      return { bg: '#e8f5e9', fg: '#1b5e20' };
    case 'unknown':
      return { bg: '#eceff1', fg: '#37474f' };
    default:
      return { bg: '#f3e5f5', fg: '#4a148c' };
  }
}

function bandLabel(band: ServiceUiRow['band'], t: (key: TranslationKey) => string): string {
  switch (band) {
    case 'due':
      return t('band_due');
    case 'soon':
      return t('band_soon');
    case 'ok':
      return t('band_ok');
    case 'unknown':
      return t('band_unknown');
    default:
      return t('band_time_only');
  }
}

export default function CarDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userVehicleId = Number(id);
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const { t, tp } = useI18n();
  const [vehicle, setVehicle] = useState<UserVehicleRow | null>(null);
  const [kmInput, setKmInput] = useState('');
  const [rows, setRows] = useState<ServiceUiRow[]>([]);

  const reload = useCallback(async () => {
    if (!Number.isFinite(userVehicleId) || userVehicleId <= 0) return;
    const cars = await listUserVehicles();
    const mine = cars.find((c: UserVehicleRow) => c.id === userVehicleId) ?? null;
    setVehicle(mine);
    if (mine) {
      setKmInput(String(mine.current_odometer));
      const svc = await getVehicleServices(userVehicleId);
      setRows(computeServiceRows(mine.current_odometer, svc));
    }
  }, [userVehicleId]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  async function saveKm() {
    const parsed = Number(kmInput.replace(/,/g, '').trim());
    if (!Number.isFinite(parsed) || parsed < 0) {
      Alert.alert(t('detail_alert_invalid_title'), t('detail_alert_invalid_body'));
      return;
    }
    const rounded = Math.round(parsed);
    const svc = await getVehicleServices(userVehicleId);
    const preview = computeServiceRows(rounded, svc);
    const urgent = preview.filter(
      (r) => r.intervalPctUsed != null && r.intervalPctUsed >= 100,
    );
    if (urgent.length) {
      await notifyMaintenanceUrgent(
        t('urgent_notif_title'),
        tp('urgent_notif_body', { services: urgent.map((u) => u.label).join(', ') }),
        t('channel_maintenance'),
      );
    }
    await updateOdometer(userVehicleId, rounded);
    await reload();
  }

  async function confirmDelete() {
    Alert.alert(t('detail_remove_title'), t('detail_remove_body'), [
      { text: t('alert_cancel'), style: 'cancel' },
      {
        text: t('alert_delete'),
        style: 'destructive',
          onPress: async () => {
            await deleteUserVehicle(userVehicleId);
            router.replace('/');
          },
        },
      ],
    );
  }

  if (!vehicle) {
    return (
      <>
        <Stack.Screen options={{ title: t('screen_vehicle') }} />
        <View style={[styles.center, { backgroundColor: palette.background }]}>
          <Text style={{ color: palette.text }}>{t('detail_loading')}</Text>
        </View>
      </>
    );
  }

  const title = vehicle.nickname?.trim() || `${vehicle.brand} ${vehicle.model}`;

  return (
    <>
      <Stack.Screen options={{ title }} />
      <FlatList
        style={{ backgroundColor: palette.background }}
        contentContainerStyle={styles.listPad}
        data={rows}
        keyExtractor={(item) => String(item.catalog_service_id)}
        ListHeaderComponent={
          <View style={{ marginBottom: 16 }}>
            <Text style={[styles.subTitle, { color: palette.text }]}>
              {vehicle.brand} {vehicle.model}
              {vehicle.variant ? ` · ${vehicle.variant}` : ''}
            </Text>

            <Text style={[styles.label, { color: palette.text }]}>{t('detail_odometer_label')}</Text>
            <View style={styles.kmRow}>
              <TextInput
                keyboardType="number-pad"
                value={kmInput}
                onChangeText={setKmInput}
                style={[
                  styles.kmInput,
                  {
                    color: palette.text,
                    borderColor: colorScheme === 'dark' ? '#444' : '#ccc',
                    backgroundColor: colorScheme === 'dark' ? '#1c1c1e' : '#fff',
                  },
                ]}
              />
              <Pressable
                onPress={saveKm}
                style={[styles.saveKmBtn, { backgroundColor: palette.tint }]}>
                <Text style={styles.saveKmText}>{t('detail_save_km')}</Text>
              </Pressable>
            </View>

            <Pressable onPress={confirmDelete} style={styles.deleteBtn}>
              <FontAwesome name="trash" size={14} color="#c62828" />
              <Text style={styles.deleteText}>{t('detail_remove')}</Text>
            </Pressable>

            <Text style={[styles.sectionTitle, { color: palette.text }]}>
              {t('detail_section_maintenance')}
            </Text>
            <Text style={[styles.help, { color: palette.tabIconDefault }]}>{t('detail_help')}</Text>
            <Text style={[styles.ringHint, { color: palette.tabIconDefault }]}>
              {t('detail_ring_hint')}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const tone = bandStyle(item.band);
          const kmSuffix = ` ${t('garage_km')}`;
          const kmInterval =
            item.interval_km != null
              ? `${item.interval_km.toLocaleString()}${kmSuffix}`
              : t('detail_see_notes');
          const monthsPart =
            item.interval_months != null
              ? ` · ${tp('detail_months_also', { n: String(item.interval_months) })}`
              : '';

          return (
            <View
              style={[
                styles.card,
                {
                  backgroundColor: colorScheme === 'dark' ? '#1c1c1e' : '#f7f7f8',
                  borderColor: colorScheme === 'dark' ? '#333' : '#e0e0e0',
                },
              ]}>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderText}>
                  <Text style={[styles.itemTitle, { color: palette.text }]}>{item.label}</Text>
                  <View style={[styles.badge, { backgroundColor: tone.bg }]}>
                    <Text style={[styles.badgeText, { color: tone.fg }]}>
                      {bandLabel(item.band, t)}
                    </Text>
                  </View>
                </View>
                <MaintenanceRing pct={item.intervalPctUsed} size={74} />
              </View>
              <Text style={[styles.meta, { color: palette.tabIconDefault }]}>
                {t('detail_interval')} {kmInterval}
                {monthsPart}
              </Text>
              {item.last_done_odometer != null ? (
                <Text style={[styles.meta, { color: palette.text }]}>
                  {tp('detail_last_logged_km', {
                    km: item.last_done_odometer.toLocaleString(),
                  })}
                </Text>
              ) : (
                <Text style={[styles.meta, { color: palette.text }]}>
                  {t('detail_last_logged_none')}
                </Text>
              )}
              {item.nextDueKm != null ? (
                <Text style={[styles.nextDue, { color: palette.tint }]}>
                  {item.remainingKm != null
                    ? tp('detail_next_due_remain', {
                        next: item.nextDueKm.toLocaleString(),
                        remain: item.remainingKm.toLocaleString(),
                      })
                    : tp('detail_next_due_only', {
                        next: item.nextDueKm.toLocaleString(),
                      })}
                </Text>
              ) : null}
              {item.notes ? (
                <Text style={[styles.notes, { color: palette.tabIconDefault }]}>{item.notes}</Text>
              ) : null}

              <View style={styles.actions}>
                <Pressable
                  onPress={() =>
                    markServiceDone(userVehicleId, item.catalog_service_id, vehicle.current_odometer).then(reload)
                  }
                  style={[styles.miniBtn, { borderColor: palette.tint }]}>
                  <Text style={[styles.miniBtnText, { color: palette.tint }]}>
                    {t('detail_done_btn')}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    clearServiceDone(userVehicleId, item.catalog_service_id).then(reload)
                  }
                  style={[styles.miniBtn, { borderColor: palette.tabIconDefault }]}>
                  <Text style={[styles.miniBtnText, { color: palette.tabIconDefault }]}>
                    {t('detail_clear_btn')}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listPad: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  subTitle: {
    fontSize: 15,
    marginBottom: 16,
    opacity: 0.85,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  kmRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  kmInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 17,
  },
  saveKmBtn: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  saveKmText: {
    color: '#fff',
    fontWeight: '700',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    alignSelf: 'flex-start',
  },
  deleteText: {
    color: '#c62828',
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 22,
    marginBottom: 6,
  },
  help: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  ringHint: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
    opacity: 0.95,
  },
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 14,
    alignItems: 'flex-start',
  },
  cardHeaderText: {
    flex: 1,
    gap: 8,
  },
  itemTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  meta: {
    fontSize: 13,
    marginTop: 8,
    lineHeight: 18,
  },
  nextDue: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
  },
  notes: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 17,
    fontStyle: 'italic',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  miniBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  miniBtnText: {
    fontWeight: '600',
    fontSize: 13,
  },
});
