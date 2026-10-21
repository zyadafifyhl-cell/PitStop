import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BookingDatePicker } from '@/components/ui/BookingDatePicker';
import { OwnerSectionCard } from '@/components/owner/OwnerSectionCard';
import { WalkInSlotModal, type WalkInSlotPayload } from '@/components/owner/WalkInSlotModal';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { bayOccupancyTone, isSlotFullError } from '@/lib/booking/bayCapacity';
import { buildScheduledIso, toDateYmd } from '@/lib/booking/format';
import { createWalkInBooking } from '@/lib/booking/storage';
import { buildSlotsForShopDate } from '@/lib/booking/shopSchedule';
import type { Booking, Shop, ShopExtras, ShopService } from '@/lib/booking/types';
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

  const slots = useMemo(
    () =>
      buildSlotsForShopDate({
        extras,
        dateYmd,
        bookings,
        now: new Date(),
        branchId,
        includePast: true,
      }),
    [extras, dateYmd, bookings, branchId],
  );

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
        <View style={styles.list}>
          {slots.map((slot) => {
            const tone = bayOccupancyTone(slot.occupiedBays, slot.totalBays);
            const toneColor =
              tone === 'red' ? theme.danger : tone === 'orange' ? theme.warning : theme.success;
            const toneBg =
              tone === 'red' ? theme.dangerSoft : tone === 'orange' ? theme.warningSoft : theme.successSoft;
            const canWalkIn = !slot.isPast && slot.remainingBays > 0 && !!branchId;
            return (
              <View
                key={slot.time}
                style={[styles.row, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                <View style={styles.rowMain}>
                  <Text style={[styles.time, { color: theme.text }]}>{slot.time}</Text>
                  <View style={[styles.pill, { backgroundColor: toneBg, borderColor: toneColor }]}>
                    <View style={[styles.dot, { backgroundColor: toneColor }]} />
                    <Text style={[styles.pillText, { color: toneColor }]}>
                      {t('bay_occupancy')
                        .replace('{occupied}', String(slot.occupiedBays))
                        .replace('{total}', String(slot.totalBays))}
                    </Text>
                  </View>
                </View>
                {slot.status === 'booked' ? (
                  <Text style={[styles.fullBadge, { color: theme.danger }]}>{t('slot_fully_booked')}</Text>
                ) : canWalkIn ? (
                  <Pressable
                    onPress={() => setWalkInTime(slot.time)}
                    style={[styles.walkInBtn, { backgroundColor: theme.accent }]}>
                    <Text style={[styles.walkInText, { color: theme.onAccent }]}>{t('bay_walk_in')}</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
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
  empty: { marginTop: 12, fontSize: 13, fontWeight: '600' },
  list: { marginTop: 12, gap: 8 },
  row: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  rowMain: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  time: { fontSize: 16, fontWeight: '800' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { fontSize: 11, fontWeight: '800' },
  fullBadge: { fontSize: 12, fontWeight: '800' },
  walkInBtn: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  walkInText: { fontSize: 12, fontWeight: '800' },
});
