import FontAwesome from '@expo/vector-icons/FontAwesome';
import React from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { formatVehicleDisplay } from '@/components/customer/ActiveVehiclePicker';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import type { CustomerVehicle } from '@/lib/booking/types';

type Props = {
  vehicle: CustomerVehicle | null;
  onlyCompatible: boolean;
  onToggleCompatible: (value: boolean) => void;
  onManageVehicles?: () => void;
};

export function StoreVehicleBanner({
  vehicle,
  onlyCompatible,
  onToggleCompatible,
  onManageVehicles,
}: Props) {
  const theme = useAppTheme();
  const { t, isRTL } = useI18n();

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Pressable onPress={onManageVehicles} style={[styles.vehicleRow, isRTL && styles.rowRtl]}>
        <View style={[styles.iconWrap, { backgroundColor: theme.accentSoft }]}>
          <FontAwesome name="car" size={16} color={theme.accent} />
        </View>
        <View style={styles.vehicleTextWrap}>
          <Text style={[styles.label, { color: theme.textMuted }, isRTL && styles.rtl]}>{t('store_active_vehicle')}</Text>
          <Text style={[styles.vehicleName, { color: theme.text }, isRTL && styles.rtl]} numberOfLines={1}>
            {vehicle ? formatVehicleDisplay(vehicle) : t('store_no_vehicle')}
          </Text>
        </View>
        {onManageVehicles ? <FontAwesome name="chevron-down" size={14} color={theme.textDim} /> : null}
      </Pressable>
      <View style={[styles.toggleRow, isRTL && styles.rowRtl]}>
        <Text style={[styles.toggleLabel, { color: theme.text }, isRTL && styles.rtl]}>{t('store_compatible_only')}</Text>
        <Switch
          value={onlyCompatible}
          onValueChange={onToggleCompatible}
          trackColor={{ false: theme.border, true: theme.accentSoft }}
          thumbColor={onlyCompatible ? theme.accent : theme.textDim}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 12 },
  vehicleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowRtl: { flexDirection: 'row-reverse' },
  iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  vehicleTextWrap: { flex: 1 },
  label: { fontSize: 12, fontWeight: '700' },
  vehicleName: { fontSize: 16, fontWeight: '800', marginTop: 2 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  toggleLabel: { flex: 1, fontSize: 14, fontWeight: '700' },
  rtl: { textAlign: 'right', writingDirection: 'rtl' },
});
