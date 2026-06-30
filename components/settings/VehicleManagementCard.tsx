import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, type Href, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ActiveVehiclePicker } from '@/components/customer/ActiveVehiclePicker';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';

type Props = {
  customerId: string;
};

export function VehicleManagementCard({ customerId }: Props) {
  const theme = useAppTheme();
  const { t, isRTL } = useI18n();
  const [refreshKey, setRefreshKey] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setRefreshKey((key) => key + 1);
    }, []),
  );

  return (
    <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
      <Pressable
        onPress={() => router.push('/settings/vehicles' as Href)}
        style={styles.headerRow}>
        <View style={[styles.iconWrap, { backgroundColor: theme.accentSoft }]}>
          <FontAwesome name="car" size={16} color={theme.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]}>{t('settings_vehicle_management')}</Text>
          <Text style={[styles.hint, { color: theme.textMuted }, isRTL && styles.textRtl]}>
            {t('settings_vehicles_manage_hint')}
          </Text>
        </View>
        <FontAwesome name="chevron-right" size={14} color={theme.textDim} />
      </Pressable>

      <View style={[styles.pickerWrap, { borderTopColor: theme.border }]}>
        <ActiveVehiclePicker key={refreshKey} customerId={customerId} embedded />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 15, fontWeight: '800' },
  hint: { fontSize: 12, marginTop: 2, lineHeight: 17 },
  pickerWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  textRtl: { textAlign: 'right' },
});
