import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BookingDatePicker } from '@/components/ui/BookingDatePicker';
import { OwnerSectionCard } from '@/components/owner/OwnerSectionCard';
import { WalkInSlotModal, type WalkInSlotPayload } from '@/components/owner/WalkInSlotModal';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { bayOccupancyTone, isSlotFullError } from '@/lib/booking/bayCapacity';
import { buildScheduledIso, toDateYmd } from '@/lib/booking/format';
import { createWalkInBooking } from '@/lib/booking/storage';
import { buildSlotsForShopDate, type TimeSlotOption } from '@/lib/booking/shopSchedule';
import { listSlotLocksForDay, lockSlot, unlockSlot, type SlotLock } from '@/lib/booking/slotLocks';
import type { Booking, Shop, ShopExtras, ShopService } from '@/lib/booking/types';
import { useDataChanges } from '@/lib/data/dataChanges';
import { logAndGetSafeErrorMessage } from '@/lib/errors/userError';
import { userAlert } from '@/lib/ui/userAlert';

type Props = {
  shop: Shop;
  extras: ShopExtras | null | undefined;
  bookings: Booking[];
  services: ShopService[];
  branchId?: string;
  onCreated?: (booking: Booking) => void;
};

export function BayScheduleBoard({ shop, extras, bookings, services, branchId, onCreated }: Props) {
  const theme = useAppTheme();
  const { t, locale } = useI18n();
  const [dateYmd, setDateYmd] = useState(toDateYmd(new Date()));
  const [walkInTime, setWalkInTime] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [locks, setLocks] = useState<SlotLock[]>([]);
  const [lockBusyTime, setLockBusyTime] = useState<string | null>(null);

  const loadLocks = useCallback(async () => {
    setLocks(await listSlotLocksForDay(branchId, dateYmd));
  }, [branchId, dateYmd]);

  useEffect(() => {
    void loadLocks();
  }, [loadLocks]);

  useDataChanges(['bookings'], () => {
    void loadLocks();
  });

  const slots = useMemo(
    () =>
      buildSlotsForShopDate({
        extras,
        dateYmd,
        bookings,
        now: new Date(),
        branchId,
        includePast: true,
        locks,
        applyLocks: false,
      }),
    [extras, dateYmd, bookings, branchId, locks],
  );

  async function onToggleLock(slot: TimeSlotOption) {
    if (!branchId || lockBusyTime) return;
    const slotStartIso = buildScheduledIso(dateYmd, slot.time);
    if (!slotStartIso) return;
    setLockBusyTime(slot.time);
    try {
      if (slot.lock) {
        await unlockSlot(slot.lock.id);
      } else {
        await lockSlot({ shopId: shop.id, branchId, slotStartIso });
      }
      await loadLocks();
    } catch (error) {
      userAlert(t('bay_lock_fail'), logAndGetSafeErrorMessage(error, t, 'bay.lock'));
    } finally {
      setLockBusyTime(null);
    }
  }

  async function onSubmitWalkIn(payload: WalkInSlotPayload) {
    if (!walkInTime || !branchId) return;
    const scheduledAt = buildScheduledIso(dateYmd, walkInTime);
    if (!scheduledAt) return;
    setBusy(true);
    try {
      const booking = await createWalkInBooking({
        shopId: shop.id,
        shopType: shop.type,
        branchId,
        carType: payload.carType,
        carPlate: payload.carPlate,
        serviceId: payload.serviceId,
        serviceName: payload.serviceName,
        serviceNameAr: payload.serviceNameAr,
        servicePriceEgp: payload.servicePriceEgp,
        serviceDurationMinutes: payload.serviceDurationMinutes,
        scheduledAt,
        initialStatus: 'confirmed',
      });
      setWalkInTime(null);
      userAlert(t('bay_walk_in_ok'), '');
      onCreated?.(booking);
    } catch (error) {
      if (isSlotFullError(error)) {
        userAlert(t('bay_walk_in_full'), t('book_slot_full_error'));
        return;
      }
      userAlert(t('book_submit_fail_title'), logAndGetSafeErrorMessage(error, t, 'bay.walkIn'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <OwnerSectionCard theme={theme} title={t('bay_schedule_title')} subtitle={t('bay_schedule_lead')} icon="calendar">
      <BookingDatePicker
        compact
        valueYmd={dateYmd}
        onChangeYmd={setDateYmd}
        locale={locale}
        label={t('book_date_label')}
        pickHint={t('book_date_pick_hint')}
        borderColor={theme.border}
        backgroundColor={theme.bgElevated}
        textColor={theme.text}
      />

      {slots.length === 0 ? (
        <Text style={[styles.empty, { color: theme.textMuted }]}>{t('bay_schedule_empty')}</Text>
      ) : (
        <ScrollView style={styles.listScroll} nestedScrollEnabled showsVerticalScrollIndicator>
          <View style={styles.list}>
            {slots.map((slot) => {
              const locked = !!slot.lock;
              const tone = bayOccupancyTone(slot.occupiedBays, slot.totalBays);
              const toneColor = locked
                ? theme.warning
                : tone === 'red'
                  ? theme.danger
                  : tone === 'orange'
                    ? theme.warning
                    : theme.success;
              const toneBg = locked
                ? theme.warningSoft
                : tone === 'red'
                  ? theme.dangerSoft
                  : tone === 'orange'
                    ? theme.warningSoft
                    : theme.successSoft;
              const canWalkIn = !slot.isPast && slot.remainingBays > 0 && !!branchId;
              const canToggleLock = !!branchId && (!slot.isPast || locked);
              const lockBusy = lockBusyTime === slot.time;
              return (
                <View
                  key={slot.time}
                  style={[
                    styles.row,
                    locked
                      ? { borderColor: theme.warning, backgroundColor: theme.warningSoft }
                      : { borderColor: theme.border, backgroundColor: theme.bgElevated },
                  ]}>
                  <Text style={[styles.time, { color: slot.isPast ? theme.textMuted : theme.text }]}>{slot.time}</Text>
                  <View style={[styles.pill, { backgroundColor: toneBg, borderColor: toneColor }]}>
                    {locked ? (
                      <FontAwesome name="lock" size={10} color={toneColor} />
                    ) : (
                      <View style={[styles.dot, { backgroundColor: toneColor }]} />
                    )}
                    <Text style={[styles.pillText, { color: toneColor }]} numberOfLines={1}>
                      {locked
                        ? `${t('bay_locked_by_shop')} · ${slot.occupiedBays}/${slot.totalBays}`
                        : t('bay_occupancy')
                            .replace('{occupied}', String(slot.occupiedBays))
                            .replace('{total}', String(slot.totalBays))}
                    </Text>
                  </View>
                  {slot.status === 'booked' ? (
                    <Text style={[styles.fullBadge, { color: theme.danger }]} numberOfLines={1}>
                      {t('slot_fully_booked')}
                    </Text>
                  ) : canWalkIn ? (
                    <Pressable
                      onPress={() => setWalkInTime(slot.time)}
                      style={[styles.walkInBtn, { backgroundColor: theme.accent }]}>
                      <Text style={[styles.walkInText, { color: theme.onAccent }]}>{t('bay_walk_in')}</Text>
                    </Pressable>
                  ) : (
                    <View style={styles.walkInSpacer} />
                  )}
                  {canToggleLock ? (
                    <Pressable
                      onPress={() => void onToggleLock(slot)}
                      disabled={lockBusy}
                      accessibilityRole="button"
                      accessibilityLabel={locked ? t('bay_unlock') : t('bay_lock')}
                      style={[
                        styles.lockBtn,
                        locked
                          ? { borderColor: theme.warning, backgroundColor: theme.bgElevated }
                          : { borderColor: theme.border, backgroundColor: theme.bgElevated },
                        lockBusy && { opacity: 0.5 },
                      ]}>
                      <FontAwesome
                        name={locked ? 'unlock' : 'lock'}
                        size={11}
                        color={locked ? theme.warning : theme.textMuted}
                      />
                      <Text style={[styles.lockText, { color: locked ? theme.warning : theme.text }]}>
                        {locked ? t('bay_unlock') : t('bay_lock')}
                      </Text>
                    </Pressable>
                  ) : (
                    <View style={styles.lockSpacer} />
                  )}
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}

      <WalkInSlotModal
        visible={!!walkInTime}
        slotTime={walkInTime ?? ''}
        dateYmd={dateYmd}
        services={services}
        busy={busy}
        onClose={() => setWalkInTime(null)}
        onSubmit={onSubmitWalkIn}
      />
    </OwnerSectionCard>
  );
}

const styles = StyleSheet.create({
  empty: { marginTop: 8, fontSize: 13, fontWeight: '600' },
  listScroll: { maxHeight: 248, marginTop: 8 },
  list: { gap: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  time: { width: 44, fontSize: 13, fontWeight: '800' },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    minWidth: 0,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { flex: 1, fontSize: 11, fontWeight: '800' },
  fullBadge: { fontSize: 11, fontWeight: '800', maxWidth: 88 },
  walkInBtn: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  walkInSpacer: { width: 64 },
  walkInText: { fontSize: 11, fontWeight: '800' },
  lockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  lockText: { fontSize: 11, fontWeight: '800' },
  lockSpacer: { width: 62 },
});
