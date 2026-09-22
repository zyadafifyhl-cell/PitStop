import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, type Href, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import type { CustomerVehicle } from '@/lib/booking/types';
import {
  loadVehiclePickerState,
  setActiveVehicle,
} from '@/lib/booking/vehicleStorage';

export function formatVehicleDisplay(vehicle: CustomerVehicle): string {
  const name = vehicle.makeModel.trim();
  const color = vehicle.color?.trim();
  return color ? `${name} · ${color}` : name;
}

type Props = {
  customerId: string;
  showManageLink?: boolean;
  embedded?: boolean;
  onVehicleChange?: (vehicle: CustomerVehicle | null) => void;
};

export function ActiveVehiclePicker({
  customerId,
  showManageLink = false,
  embedded = false,
  onVehicleChange,
}: Props) {
  const theme = useAppTheme();
  const { t, isRTL } = useI18n();
  const [vehicles, setVehicles] = useState<CustomerVehicle[]>([]);
  const [activeVehicle, setActiveVehicleState] = useState<CustomerVehicle | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerFocused, setPickerFocused] = useState(false);

  const loadVehicles = useCallback(async () => {
    try {
      const { vehicles: rows, activeVehicle: active } = await loadVehiclePickerState(customerId);
      setVehicles(rows);
      const resolved = active ?? rows[0] ?? null;
      setActiveVehicleState(resolved);
      onVehicleChange?.(resolved);
    } catch {
      setVehicles([]);
      setActiveVehicleState(null);
      onVehicleChange?.(null);
    }
  }, [customerId, onVehicleChange]);

  useFocusEffect(
    useCallback(() => {
      loadVehicles();
    }, [loadVehicles]),
  );

  async function onSelectVehicle(vehicleId: string) {
    const next = await setActiveVehicle(customerId, vehicleId);
    setActiveVehicleState(next);
    setPickerOpen(false);
    onVehicleChange?.(next);
    await loadVehicles();
  }

  return (
    <View
      style={[
        embedded ? styles.embedded : styles.card,
        !embedded && { borderColor: theme.border, backgroundColor: theme.card },
      ]}>
      {!embedded ? (
        <View style={styles.headerRow}>
          <View style={[styles.iconWrap, { backgroundColor: theme.accentSoft }]}>
            <FontAwesome name="car" size={16} color={theme.accent} />
          </View>
          <Text style={[styles.title, { color: theme.text }, isRTL && styles.textRtl]}>{t('home_active_vehicle_title')}</Text>
        </View>
      ) : null}

      {!activeVehicle ? (
        <View style={[styles.body, embedded && styles.embeddedBody]}>
          {vehicles.length > 0 ? (
            <>
              <Pressable
                onPress={() => setPickerOpen((open) => !open)}
                onFocus={() => setPickerFocused(true)}
                onBlur={() => setPickerFocused(false)}
                style={[
                  styles.pickerBtn,
                  {
                    borderColor: pickerFocused ? theme.accent : embedded ? 'transparent' : theme.inputBorder,
                    backgroundColor: embedded ? '#131F35' : theme.inputBg,
                  },
                ]}>
                <Text style={[styles.pickerBtnText, { color: theme.textMuted }, isRTL && styles.textRtl]}>
                  {t('book_vehicle_select_label')}
                </Text>
                <FontAwesome name={pickerOpen ? 'chevron-up' : 'chevron-down'} size={12} color={theme.textDim} />
              </Pressable>
              {pickerOpen ? (
                <View style={[styles.dropdown, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                  {vehicles.map((vehicle) => (
                    <Pressable
                      key={vehicle.id}
                      onPress={() => onSelectVehicle(vehicle.id)}
                      style={[styles.dropdownOption, isRTL && styles.dropdownOptionRtl]}>
                      <Text style={[styles.dropdownOptionText, { color: theme.text }, isRTL && styles.textRtl]}>
                        {formatVehicleDisplay(vehicle)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </>
          ) : (
            <Text style={[styles.emptyHint, { color: theme.textMuted }, isRTL && styles.textRtl]}>
              {t('home_active_vehicle_empty')}
            </Text>
          )}
          {showManageLink ? (
            <Pressable
              onPress={() => router.push('/settings/vehicles' as Href)}
              style={[styles.manageBtn, { borderColor: theme.border }]}>
              <Text style={[styles.manageBtnText, { color: theme.accent }]}>{t('home_manage_vehicles')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={[styles.body, embedded && styles.embeddedBody]}>
          <Pressable
            onPress={() => setPickerOpen((open) => !open)}
            onFocus={() => setPickerFocused(true)}
            onBlur={() => setPickerFocused(false)}
            style={[
              styles.pickerBtn,
              {
                borderColor: pickerFocused ? theme.accent : embedded ? 'transparent' : theme.inputBorder,
                backgroundColor: embedded ? '#131F35' : theme.inputBg,
              },
            ]}>
            {embedded ? (
              <View style={styles.embeddedCarBadge}>
                <FontAwesome name="car" size={14} color="#3B82F6" />
              </View>
            ) : null}
            <Text style={[styles.pickerBtnText, { color: theme.text }, isRTL && styles.textRtl]}>
              {formatVehicleDisplay(activeVehicle)}
            </Text>
            {embedded ? (
              <View style={styles.activeBadge}>
                <View style={styles.activeDot} />
                <Text style={styles.activeBadgeText}>{isRTL ? 'نشطة' : 'Active'}</Text>
              </View>
            ) : null}
            <FontAwesome name={pickerOpen ? 'chevron-up' : 'chevron-down'} size={12} color={theme.textDim} />
          </Pressable>
          {pickerOpen ? (
            <View style={[styles.dropdown, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
              {vehicles.map((vehicle) => {
                const selected = vehicle.id === activeVehicle.id;
                return (
                  <Pressable
                    key={vehicle.id}
                    onPress={() => onSelectVehicle(vehicle.id)}
                    style={[
                      styles.dropdownOption,
                      selected && { backgroundColor: theme.accentSoft },
                      isRTL && styles.dropdownOptionRtl,
                    ]}>
                    <Text style={[styles.dropdownOptionText, { color: theme.text }, isRTL && styles.textRtl]}>
                      {formatVehicleDisplay(vehicle)}
                    </Text>
                    {selected ? <FontAwesome name="check" size={12} color={theme.accent} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          {showManageLink ? (
            <Pressable onPress={() => router.push('/settings/vehicles' as Href)}>
              <Text style={[styles.manageLink, { color: theme.accent }, isRTL && styles.textRtl]}>
                {t('home_manage_vehicles')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 14,
  },
  embedded: {
    marginBottom: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 16, fontWeight: '900', flex: 1 },
  body: { paddingHorizontal: 16, paddingBottom: 14, paddingTop: 10, gap: 8 },
  embeddedBody: { paddingHorizontal: 0, paddingBottom: 0, paddingTop: 4 },
  emptyHint: { fontSize: 13, lineHeight: 19 },
  pickerBtn: {
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  pickerBtnText: { fontSize: 14, fontWeight: '700', flex: 1 },
  embeddedCarBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(30, 90, 230, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeBadge: {
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.35)',
    backgroundColor: 'rgba(30, 90, 230, 0.15)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  activeDot: { width: 5, height: 5, borderRadius: 999, backgroundColor: '#3B82F6' },
  activeBadgeText: { color: '#60A5FA', fontSize: 10, fontWeight: '700' },
  dropdown: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  dropdownOption: {
    minHeight: 44,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  dropdownOptionRtl: { flexDirection: 'row-reverse' },
  dropdownOptionText: { fontSize: 14, fontWeight: '600', flex: 1 },
  manageBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  manageBtnText: { fontSize: 13, fontWeight: '800' },
  manageLink: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  textRtl: { textAlign: 'right' },
});
