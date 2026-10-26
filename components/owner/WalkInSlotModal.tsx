import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BOXED_OVERLAY } from '@/constants/Theme';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { toServiceDurationMinutes } from '@/lib/booking/bayCapacityConfig';
import { formatShopServicePrice } from '@/lib/booking/shopServicePrice';
import type { ShopService } from '@/lib/booking/types';

export type WalkInSlotPayload = {
  carPlate: string;
  carType: string;
  serviceId?: string;
  serviceName: string;
  serviceNameAr?: string;
  servicePriceEgp: number;
  serviceDurationMinutes?: number;
};

type Props = {
  visible: boolean;
  slotTime: string;
  dateYmd: string;
  services: ShopService[];
  busy?: boolean;
  onClose: () => void;
  onSubmit: (payload: WalkInSlotPayload) => Promise<void> | void;
};

export function WalkInSlotModal({
  visible,
  slotTime,
  dateYmd,
  services,
  busy,
  onClose,
  onSubmit,
}: Props) {
  const theme = useAppTheme();
  const { t, locale } = useI18n();
  const [plate, setPlate] = useState('');
  const [model, setModel] = useState('');
  const [customService, setCustomService] = useState('');
  const [serviceId, setServiceId] = useState<string | null>(services[0]?.id ?? null);

  const activeServices = useMemo(
    () => services.filter((service) => service.active !== false && service.visible !== false),
    [services],
  );

  useEffect(() => {
    if (!visible) return;
    setPlate('');
    setModel('');
    setCustomService('');
    setServiceId(activeServices[0]?.id ?? null);
  }, [visible, activeServices]);

  const selected = activeServices.find((service) => service.id === serviceId);

  async function handleSubmit() {
    const carType = model.trim();
    const fallbackName = customService.trim();
    if (!carType) return;
    if (!selected && !fallbackName) return;
    await onSubmit({
      carPlate: plate.trim(),
      carType,
      serviceId: selected?.id,
      serviceName: selected?.name ?? fallbackName,
      serviceNameAr: selected?.nameAr,
      servicePriceEgp: selected?.priceEgp ?? 0,
      serviceDurationMinutes: selected?.durationMinutes,
    });
  }

  const fieldStyle = [
    styles.input,
    { color: theme.text, borderColor: theme.border, backgroundColor: theme.bgElevated },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text }]}>{t('bay_walk_in_title')}</Text>
          <Text style={[styles.lead, { color: theme.textMuted }]}>
            {t('bay_walk_in_lead')} · {dateYmd} {slotTime}
          </Text>
          <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
            <Text style={[styles.label, { color: theme.text }]}>{t('walk_in_plate_placeholder')}</Text>
            <TextInput
              value={plate}
              onChangeText={setPlate}
              autoCapitalize="characters"
              placeholder={t('walk_in_plate_placeholder')}
              placeholderTextColor={theme.textDim}
              style={fieldStyle}
            />
            <Text style={[styles.label, { color: theme.text }]}>{t('bay_walk_in_model')}</Text>
            <TextInput
              value={model}
              onChangeText={setModel}
              placeholder={t('bay_walk_in_model')}
              placeholderTextColor={theme.textDim}
              style={fieldStyle}
            />
            <Text style={[styles.label, { color: theme.text }]}>{t('bay_walk_in_service')}</Text>
            {activeServices.length ? (
              <View style={styles.chips}>
                {activeServices.map((service) => {
                  const active = service.id === serviceId;
                  const label = locale === 'ar' ? service.nameAr || service.name : service.name;
                  return (
                    <Pressable
                      key={service.id}
                      onPress={() => setServiceId(service.id)}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: active ? theme.accent : theme.bgElevated,
                          borderColor: active ? theme.accent : theme.border,
                        },
                      ]}>
                      <Text style={{ color: active ? theme.onAccent : theme.text, fontWeight: '700', fontSize: 12 }}>
                        {label} · {formatShopServicePrice(service, locale, t)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <TextInput
                value={customService}
                onChangeText={setCustomService}
                placeholder={t('bay_walk_in_service')}
                placeholderTextColor={theme.textDim}
                style={fieldStyle}
              />
            )}
          </ScrollView>
          <View style={styles.actions}>
            <Pressable
              onPress={onClose}
              style={[styles.secondary, { borderColor: theme.border }]}>
              <Text style={[styles.actionText, { color: theme.text }]}>{t('alert_cancel')}</Text>
            </Pressable>
            <Pressable
              onPress={() => void handleSubmit()}
              disabled={busy || !model.trim() || (!selected && !customService.trim())}
              style={[
                styles.primary,
                {
                  backgroundColor: theme.accent,
                  opacity: busy || !model.trim() || (!selected && !customService.trim()) ? 0.6 : 1,
                },
              ]}>
              {busy ? (
                <ActivityIndicator color={theme.onAccent} />
              ) : (
                <Text style={[styles.actionText, { color: theme.onAccent }]}>{t('bay_walk_in_submit')}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: BOXED_OVERLAY.backdrop,
  card: {
    ...BOXED_OVERLAY.card,
    borderWidth: 1,
    padding: 16,
  },
  title: { fontSize: 18, fontWeight: '800' },
  lead: { fontSize: 13, marginTop: 4, marginBottom: 12 },
  body: { maxHeight: 360 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  secondary: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    flex: 1,
    borderRadius: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { fontWeight: '800', fontSize: 14 },
});
