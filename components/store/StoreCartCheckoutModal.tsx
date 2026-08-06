import { router } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Image } from 'expo-image';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useStoreCart } from '@/context/StoreCartContext';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { formatEgp } from '@/lib/booking/reporting';
import { STORE_COD_DELIVERY_FEE_EGP } from '@/lib/store/constants';
import { placeStoreOrder } from '@/lib/store/productRepository';
import type { StoreFulfillmentMethod } from '@/lib/store/types';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function StoreCartCheckoutModal({ visible, onClose }: Props) {
  const theme = useAppTheme();
  const { t, locale, isRTL } = useI18n();
  const { customer } = useCustomerAuth();
  const { items, subtotal, setQuantity, removeItem, clear } = useStoreCart();
  const [fulfillment, setFulfillment] = useState<StoreFulfillmentMethod>('cod');
  const [placing, setPlacing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const deliveryFee = fulfillment === 'cod' ? STORE_COD_DELIVERY_FEE_EGP : 0;
  const grandTotal = subtotal + deliveryFee;

  const fulfillmentOptions = useMemo(
    () =>
      [
        { id: 'cod' as const, label: t('store_fulfillment_cod') },
        { id: 'pickup' as const, label: t('store_fulfillment_pickup') },
      ] as const,
    [t],
  );

  async function onPlaceOrder() {
    if (!customer?.id) {
      router.push('/auth-required');
      return;
    }
    if (!items.length) return;

    setPlacing(true);
    try {
      const orderId = await placeStoreOrder({ fulfillmentMethod: fulfillment, deliveryFee });
      if (!orderId) {
        Alert.alert(t('store_checkout_fail_title'), t('store_checkout_fail_body'));
        return;
      }
      await clear();
      onClose();
      Alert.alert(t('store_checkout_success_title'), t('store_checkout_success_body'));
    } finally {
      setPlacing(false);
    }
  }

  async function changeQty(cartItemId: string, next: number) {
    setBusyId(cartItemId);
    try {
      await setQuantity(cartItemId, next);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: theme.bg }]}>
          <View style={[styles.header, isRTL && styles.rowRtl]}>
            <Text style={[styles.title, { color: theme.text }]}>{t('store_cart_title')}</Text>
            <Pressable onPress={onClose}>
              <FontAwesome name="times" size={20} color={theme.textMuted} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            {items.length === 0 ? (
              <Text style={[styles.empty, { color: theme.textMuted }]}>{t('store_cart_empty')}</Text>
            ) : (
              items.map((row) => (
                <View key={row.id} style={[styles.line, { borderColor: theme.border, backgroundColor: theme.card }]}>
                  <View style={styles.lineTop}>
                    {row.product?.imageUrl ? (
                      <Image source={{ uri: row.product.imageUrl }} style={styles.thumb} contentFit="cover" />
                    ) : (
                      <View style={[styles.thumb, { backgroundColor: theme.bgElevated, alignItems: 'center', justifyContent: 'center' }]}>
                        <FontAwesome name="cog" size={18} color={theme.accent} />
                      </View>
                    )}
                    <View style={styles.lineBody}>
                      <Text style={[styles.lineName, { color: theme.text }]} numberOfLines={2}>
                        {row.product?.name ?? t('store_product_unknown')}
                      </Text>
                      <Text style={[styles.linePrice, { color: theme.textMuted }]}>
                        {formatEgp((row.product?.price ?? 0) * row.quantity, locale)}
                      </Text>
                    </View>
                    <Pressable onPress={() => void removeItem(row.id)}>
                      <FontAwesome name="trash-o" size={16} color={theme.danger} />
                    </Pressable>
                  </View>
                  <View style={[styles.qtyRow, isRTL && styles.rowRtl]}>
                    <Pressable
                      onPress={() => void changeQty(row.id, row.quantity - 1)}
                      disabled={busyId === row.id}
                      style={[styles.qtyBtn, { borderColor: theme.border }]}>
                      <Text style={{ color: theme.text }}>−</Text>
                    </Pressable>
                    <Text style={[styles.qtyValue, { color: theme.text }]}>{row.quantity}</Text>
                    <Pressable
                      onPress={() => void changeQty(row.id, row.quantity + 1)}
                      disabled={busyId === row.id}
                      style={[styles.qtyBtn, { borderColor: theme.border }]}>
                      <Text style={{ color: theme.text }}>+</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}

            {items.length > 0 ? (
              <>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('store_delivery_method')}</Text>
                <View style={styles.segmentRow}>
                  {fulfillmentOptions.map((option) => {
                    const active = fulfillment === option.id;
                    return (
                      <Pressable
                        key={option.id}
                        onPress={() => setFulfillment(option.id)}
                        style={[
                          styles.segment,
                          {
                            backgroundColor: active ? theme.accent : theme.bgElevated,
                            borderColor: active ? theme.accent : theme.border,
                          },
                        ]}>
                        <Text style={[styles.segmentText, { color: active ? theme.onAccent : theme.text }]}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={[styles.summary, { borderColor: theme.border, backgroundColor: theme.card }]}>
                  <View style={styles.summaryRow}>
                    <Text style={{ color: theme.textMuted }}>{t('store_subtotal')}</Text>
                    <Text style={{ color: theme.text }}>{formatEgp(subtotal, locale)}</Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={{ color: theme.textMuted }}>{t('store_delivery_fee')}</Text>
                    <Text style={{ color: theme.text }}>{formatEgp(deliveryFee, locale)}</Text>
                  </View>
                  <View style={[styles.summaryRow, styles.summaryTotal]}>
                    <Text style={[styles.totalLabel, { color: theme.text }]}>{t('store_grand_total')}</Text>
                    <Text style={[styles.totalLabel, { color: theme.accent }]}>{formatEgp(grandTotal, locale)}</Text>
                  </View>
                </View>
              </>
            ) : null}
          </ScrollView>

          <Pressable
            onPress={() => void onPlaceOrder()}
            disabled={placing || items.length === 0}
            style={[
              styles.checkoutBtn,
              { backgroundColor: theme.accent, opacity: placing || items.length === 0 ? 0.6 : 1 },
            ]}>
            {placing ? (
              <ActivityIndicator color={theme.onAccent} />
            ) : (
              <Text style={[styles.checkoutText, { color: theme.onAccent }]}>{t('store_place_order')}</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { maxHeight: '88%', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  rowRtl: { flexDirection: 'row-reverse' },
  title: { fontSize: 20, fontWeight: '900' },
  content: { gap: 10, paddingBottom: 12 },
  empty: { textAlign: 'center', paddingVertical: 32, fontSize: 14 },
  line: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 10 },
  lineTop: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  thumb: { width: 56, height: 56, borderRadius: 10 },
  lineBody: { flex: 1 },
  lineName: { fontSize: 14, fontWeight: '800' },
  linePrice: { fontSize: 13, marginTop: 4, fontWeight: '700' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyValue: { fontSize: 15, fontWeight: '800', minWidth: 20, textAlign: 'center' },
  sectionTitle: { fontSize: 15, fontWeight: '800', marginTop: 8 },
  segmentRow: { flexDirection: 'row', gap: 8 },
  segment: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  segmentText: { fontSize: 12, fontWeight: '800', textAlign: 'center' },
  summary: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 8, marginTop: 4 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryTotal: { marginTop: 4, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.08)' },
  totalLabel: { fontSize: 16, fontWeight: '900' },
  checkoutBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  checkoutText: { fontSize: 16, fontWeight: '900' },
});
