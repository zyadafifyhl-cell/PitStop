import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, useFocusEffect, useNavigation } from 'expo-router';
import React, { useCallback, useLayoutEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { formatVehicleDisplay } from '@/components/customer/ActiveVehiclePicker';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import type { CustomerVehicle } from '@/lib/booking/types';
import {
  addCustomerVehicle,
  listCustomerVehicles,
  removeCustomerVehicle,
  setActiveVehicle,
  updateCustomerVehicle,
} from '@/lib/booking/vehicleStorage';

type VehicleForm = {
  makeModel: string;
  color: string;
};

const emptyForm = (): VehicleForm => ({ makeModel: '', color: '' });

export default function VehicleManagementScreen() {
  const navigation = useNavigation();
  const { t, isRTL } = useI18n();
  const theme = useAppTheme();
  const { customer, isGuest } = useCustomerAuth();

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={styles.headerBackBtn}
          accessibilityRole="button"
          accessibilityLabel={t('wash_notif_back')}>
          <FontAwesome
            name={isRTL ? 'chevron-right' : 'chevron-left'}
            size={22}
            color={theme.text}
          />
        </Pressable>
      ),
    });
  }, [navigation, isRTL, theme.text, t]);
  const [vehicles, setVehicles] = useState<CustomerVehicle[]>([]);
  const [formVisible, setFormVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<VehicleForm>(emptyForm());

  const loadVehicles = useCallback(async () => {
    if (!customer || isGuest) {
      setVehicles([]);
      return;
    }
    const rows = await listCustomerVehicles(customer.id);
    setVehicles(rows);
  }, [customer, isGuest]);

  useFocusEffect(
    useCallback(() => {
      loadVehicles();
    }, [loadVehicles]),
  );

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm());
    setFormVisible(true);
  }

  function openEdit(vehicle: CustomerVehicle) {
    setEditingId(vehicle.id);
    setForm({
      makeModel: vehicle.makeModel,
      color: vehicle.color ?? '',
    });
    setFormVisible(true);
  }

  async function onSave() {
    if (!customer || isGuest) return;
    const makeModel = form.makeModel.trim();
    if (!makeModel) {
      Alert.alert(t('book_missing_title'), t('book_missing_car_type'));
      return;
    }
    const color = form.color.trim() || undefined;
    if (editingId) {
      await updateCustomerVehicle(customer.id, editingId, {
        label: makeModel,
        makeModel,
        color,
      });
      await setActiveVehicle(customer.id, editingId);
    } else {
      const rows = await addCustomerVehicle(customer.id, {
        label: makeModel,
        makeModel,
        color,
      });
      const created = rows[0];
      if (created) await setActiveVehicle(customer.id, created.id);
    }
    setFormVisible(false);
    await loadVehicles();
  }

  function onRemove(vehicle: CustomerVehicle) {
    if (!customer || isGuest) return;
    Alert.alert(t('detail_remove_title'), t('detail_remove_body'), [
      { text: t('alert_cancel'), style: 'cancel' },
      {
        text: t('alert_delete'),
        style: 'destructive',
        onPress: async () => {
          await removeCustomerVehicle(customer.id, vehicle.id);
          await loadVehicles();
        },
      },
    ]);
  }

  if (!customer || isGuest) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <Text style={[styles.emptyText, { color: theme.textMuted }]}>{t('guest_settings_sign_in_hint')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.screen, { backgroundColor: theme.bg }]} contentContainerStyle={styles.content}>
      <Pressable onPress={openAdd} style={[styles.addBtn, { backgroundColor: theme.accent }]}>
        <Text style={[styles.addBtnText, { color: theme.onAccent }]}>+ {t('settings_vehicles')}</Text>
      </Pressable>

      {vehicles.length === 0 ? (
        <Text style={[styles.emptyText, { color: theme.textMuted }]}>{t('garage_empty')}</Text>
      ) : (
        vehicles.map((vehicle) => (
          <View key={vehicle.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>{formatVehicleDisplay(vehicle)}</Text>
            <View style={styles.cardActions}>
              <Pressable onPress={() => openEdit(vehicle)} style={[styles.actionBtn, { borderColor: theme.border }]}>
                <Text style={[styles.actionText, { color: theme.accent }]}>{t('home_car_profile_change')}</Text>
              </Pressable>
              <Pressable onPress={() => onRemove(vehicle)} style={[styles.actionBtn, { borderColor: theme.border }]}>
                <Text style={[styles.actionText, { color: theme.danger }]}>{t('detail_remove')}</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}

      <Modal visible={formVisible} transparent animationType="fade" onRequestClose={() => setFormVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              {editingId ? t('home_car_profile_change') : t('settings_vehicles')}
            </Text>
            <TextInput
              value={form.makeModel}
              onChangeText={(makeModel) => setForm((prev) => ({ ...prev, makeModel }))}
              placeholder={t('book_car_type_placeholder')}
              placeholderTextColor={theme.textDim}
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bgElevated }]}
            />
            <TextInput
              value={form.color}
              onChangeText={(color) => setForm((prev) => ({ ...prev, color }))}
              placeholder={t('book_car_color_placeholder')}
              placeholderTextColor={theme.textDim}
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bgElevated }]}
            />
            <Pressable onPress={onSave} style={[styles.saveBtn, { backgroundColor: theme.accent }]}>
              <Text style={[styles.saveBtnText, { color: theme.onAccent }]}>{t('add_save')}</Text>
            </Pressable>
            <Pressable onPress={() => setFormVisible(false)} style={[styles.cancelBtn, { borderColor: theme.border }]}>
              <Text style={[styles.cancelText, { color: theme.textMuted }]}>{t('add_cancel')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  headerBackBtn: {
    marginLeft: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  screen: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 24 },
  addBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  addBtnText: { fontSize: 15, fontWeight: '800' },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: { fontSize: 17, fontWeight: '800', marginBottom: 4 },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  actionText: { fontSize: 13, fontWeight: '700' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    marginBottom: 10,
  },
  saveBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtnText: { fontSize: 15, fontWeight: '800' },
  cancelBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelText: { fontSize: 14, fontWeight: '700' },
});

