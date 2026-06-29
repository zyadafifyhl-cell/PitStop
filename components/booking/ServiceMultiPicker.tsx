import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { formatEgp } from '@/lib/booking/reporting';
import type { ShopService } from '@/lib/booking/types';

type Props = {
  services: ShopService[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
};

export function ServiceMultiPicker({ services, selectedIds, onChange, disabled }: Props) {
  const theme = useAppTheme();
  const { t, locale } = useI18n();
  const [openPickerIndex, setOpenPickerIndex] = useState<number | null>(null);
  const [addDropdownOpen, setAddDropdownOpen] = useState(false);

  const activeServices = useMemo(
    () => services.filter((s) => s.active && s.visible !== false).sort((a, b) => a.sortOrder - b.sortOrder),
    [services],
  );

  const rows = selectedIds.length ? selectedIds : activeServices[0]?.id ? [activeServices[0].id] : [];

  const availableToAdd = useMemo(
    () => activeServices.filter((s) => !rows.includes(s.id)),
    [activeServices, rows],
  );

  function serviceLabel(service: ShopService | undefined): string {
    if (!service) return t('book_service_pick_hint');
    return locale === 'ar' ? service.nameAr || service.name : service.name;
  }

  function setRowService(index: number, serviceId: string) {
    const next = [...rows];
    next[index] = serviceId;
    onChange(next);
    setOpenPickerIndex(null);
  }

  function addServiceFromDropdown(serviceId: string) {
    if (rows.includes(serviceId)) return;
    onChange([...rows, serviceId]);
    setAddDropdownOpen(false);
  }

  function removeRow(index: number) {
    if (rows.length <= 1) return;
    onChange(rows.filter((_, i) => i !== index));
  }

  const totalPrice = rows.reduce((sum, id) => {
    const svc = activeServices.find((s) => s.id === id);
    return sum + (svc?.priceEgp ?? 0);
  }, 0);

  const totalMinutes = rows.reduce((sum, id) => {
    const svc = activeServices.find((s) => s.id === id);
    return sum + (svc?.durationMinutes ?? 0);
  }, 0);

  if (!activeServices.length) {
    return (
      <Text style={[styles.empty, { color: theme.textMuted }]}>{t('book_no_services_available')}</Text>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={[styles.heading, { color: theme.text }]}>{t('book_services_heading')}</Text>
      {rows.map((serviceId, index) => {
        const service = activeServices.find((s) => s.id === serviceId) ?? activeServices[0];
        return (
          <View key={`${index}-${serviceId}`} style={[styles.row, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
            <Pressable
              onPress={() => !disabled && setOpenPickerIndex(index)}
              disabled={disabled}
              style={styles.selector}>
              <Text style={[styles.selectorLabel, { color: theme.textMuted }]}>
                {t('book_service_row_label').replace('{n}', String(index + 1))}
              </Text>
              <Text style={[styles.selectorValue, { color: theme.text }]} numberOfLines={2}>
                {serviceLabel(service)}
              </Text>
              {service ? (
                <Text style={[styles.selectorMeta, { color: theme.accent }]}>
                  {formatEgp(service.priceEgp, locale)} · {service.durationMinutes}{' '}
                  {locale === 'ar' ? 'د' : 'min'}
                </Text>
              ) : null}
            </Pressable>
            {rows.length > 1 ? (
              <Pressable onPress={() => removeRow(index)} disabled={disabled} style={styles.removeBtn}>
                <Text style={[styles.removeText, { color: theme.danger }]}>×</Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}

      {availableToAdd.length > 0 ? (
        <View style={styles.addBlock}>
          <Text style={[styles.addLabel, { color: theme.textMuted }]}>{t('book_add_service')}</Text>
          <Pressable
            onPress={() => !disabled && setAddDropdownOpen(true)}
            disabled={disabled}
            style={[styles.dropdown, { borderColor: theme.border, backgroundColor: theme.card }]}>
            <Text style={[styles.dropdownPlaceholder, { color: theme.textDim }]}>
              {t('book_add_service_dropdown_hint')}
            </Text>
            <FontAwesome name="chevron-down" size={12} color={theme.textMuted} />
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.totals, { borderColor: theme.border, backgroundColor: theme.card }]}>
        <Text style={[styles.totalsLabel, { color: theme.textMuted }]}>{t('book_services_total')}</Text>
        <Text style={[styles.totalsValue, { color: theme.text }]}>
          {formatEgp(totalPrice, locale)} · {totalMinutes} {locale === 'ar' ? 'دقيقة' : 'min'}
        </Text>
      </View>

      <Modal visible={openPickerIndex != null} transparent animationType="fade" onRequestClose={() => setOpenPickerIndex(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setOpenPickerIndex(null)}>
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{t('book_service_pick_title')}</Text>
            <ScrollView style={styles.modalList}>
              {activeServices.map((service) => {
                const selected = openPickerIndex != null && rows[openPickerIndex] === service.id;
                const takenElsewhere =
                  openPickerIndex != null &&
                  rows.includes(service.id) &&
                  rows[openPickerIndex] !== service.id;
                return (
                  <Pressable
                    key={service.id}
                    onPress={() => {
                      if (openPickerIndex != null && !takenElsewhere) {
                        setRowService(openPickerIndex, service.id);
                      }
                    }}
                    disabled={takenElsewhere}
                    style={[
                      styles.modalOption,
                      {
                        borderColor: selected ? theme.accent : theme.border,
                        backgroundColor: selected ? theme.accentSoft : theme.bgElevated,
                        opacity: takenElsewhere ? 0.45 : 1,
                      },
                    ]}>
                    <Text style={[styles.modalOptionTitle, { color: theme.text }]}>{serviceLabel(service)}</Text>
                    <Text style={[styles.modalOptionMeta, { color: theme.textMuted }]}>
                      {formatEgp(service.priceEgp, locale)} · {service.durationMinutes}{' '}
                      {locale === 'ar' ? 'د' : 'min'}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={addDropdownOpen} transparent animationType="fade" onRequestClose={() => setAddDropdownOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setAddDropdownOpen(false)}>
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{t('book_add_service')}</Text>
            <Text style={[styles.modalSubtitle, { color: theme.textMuted }]}>{t('book_add_service_dropdown_hint')}</Text>
            <ScrollView style={styles.modalList}>
              {availableToAdd.map((service) => (
                <Pressable
                  key={service.id}
                  onPress={() => addServiceFromDropdown(service.id)}
                  style={[styles.modalOption, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                  <Text style={[styles.modalOptionTitle, { color: theme.text }]}>{serviceLabel(service)}</Text>
                  <Text style={[styles.modalOptionMeta, { color: theme.textMuted }]}>
                    {formatEgp(service.priceEgp, locale)} · {service.durationMinutes}{' '}
                    {locale === 'ar' ? 'د' : 'min'}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, marginBottom: 12 },
  heading: { fontSize: 15, fontWeight: '800', marginBottom: 2 },
  empty: { fontSize: 13, marginBottom: 12 },
  row: {
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'stretch',
    overflow: 'hidden',
  },
  selector: { flex: 1, padding: 12 },
  selectorLabel: { fontSize: 11, fontWeight: '700', marginBottom: 4 },
  selectorValue: { fontSize: 15, fontWeight: '800' },
  selectorMeta: { fontSize: 13, fontWeight: '700', marginTop: 4 },
  removeBtn: { width: 44, alignItems: 'center', justifyContent: 'center' },
  removeText: { fontSize: 24, fontWeight: '700' },
  addBlock: { gap: 6 },
  addLabel: { fontSize: 12, fontWeight: '700' },
  dropdown: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownPlaceholder: { fontSize: 14, fontWeight: '600', flex: 1 },
  totals: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalsLabel: { fontSize: 13, fontWeight: '600' },
  totalsValue: { fontSize: 15, fontWeight: '900' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    borderWidth: 1,
    borderRadius: 16,
    maxHeight: '70%',
    padding: 14,
  },
  modalTitle: { fontSize: 16, fontWeight: '900', marginBottom: 4 },
  modalSubtitle: { fontSize: 13, marginBottom: 10, lineHeight: 18 },
  modalList: { maxHeight: 360 },
  modalOption: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  modalOptionTitle: { fontSize: 14, fontWeight: '800' },
  modalOptionMeta: { fontSize: 12, marginTop: 4 },
});
