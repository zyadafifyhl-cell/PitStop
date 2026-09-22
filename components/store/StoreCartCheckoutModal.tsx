import { router } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Image } from 'expo-image';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { StoreQuantityStepper } from '@/components/store/StoreQuantityStepper';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useStoreCart } from '@/context/StoreCartContext';
import { BOXED_OVERLAY } from '@/constants/Theme';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { formatEgp } from '@/lib/booking/reporting';
import { groupCartItemsByShop } from '@/lib/store/cartRepository';
import { STORE_COD_DELIVERY_FEE_EGP } from '@/lib/store/constants';
import { primaryProductImageUrl } from '@/lib/store/productImages';
import { isInsufficientStockError, placeStoreOrder } from '@/lib/store/productRepository';
import { availableStock, cartItemExceedsStock } from '@/lib/store/stockLimits';
import type { StoreFulfillmentMethod } from '@/lib/store/types';

type Props = {
  visible: boolean;
  onClose: () => void;
  onInventoryChanged?: () => void;
  /** When set (e.g. from a wash shop profile), prefer checkout for this shop. */
  preferredShopId?: string;
};

export function StoreCartCheckoutModal({ visible, onClose, onInventoryChanged, preferredShopId }: Props) {
  const theme = useAppTheme();
  const { t, locale, isRTL } = useI18n();
  const { customer } = useCustomerAuth();
  const { items, setQuantity, removeItem, refresh } = useStoreCart();
  const [fulfillment, setFulfillment] = useState<StoreFulfillmentMethod>('cod');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [placing, setPlacing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedShopId, setSelectedShopId] = useState<string | null>(null);

  const groups = useMemo(() => groupCartItemsByShop(items, locale), [items, locale]);
  const selectedGroup = groups.find((group) => group.shopId === selectedShopId) ?? groups[0];
  const checkoutItems = selectedGroup?.items ?? [];
  const deliveryFee = fulfillment === 'cod' ? STORE_COD_DELIVERY_FEE_EGP : 0;
  const subtotal = selectedGroup?.subtotal ?? 0;
  const grandTotal = subtotal + deliveryFee;
  const remainingShops = Math.max(groups.length - 1, 0);
  const selectedHasStockIssue = checkoutItems.some(cartItemExceedsStock);

  useEffect(() => {
    if (!visible) return;
    void refresh();
    onInventoryChanged?.();
    // Refresh live stock only when the sheet opens, not when callback identities change.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open-only
  }, [visible]);

  useEffect(() => {
    if (!groups.length) {
      setSelectedShopId(null);
      return;
    }
    const preferred =
      preferredShopId && groups.some((group) => group.shopId === preferredShopId)
        ? preferredShopId
        : null;
    if (preferred && selectedShopId !== preferred) {
      setSelectedShopId(preferred);
      return;
    }
    if (!selectedShopId || !groups.some((group) => group.shopId === selectedShopId)) {
      setSelectedShopId(preferred ?? groups[0].shopId);
    }
  }, [groups, preferredShopId, selectedShopId]);

  const fulfillmentOptions = useMemo(
    () =>
      [
        { id: 'cod' as const, label: t('store_fulfillment_cod') },
        { id: 'pickup' as const, label: t('store_fulfillment_pickup') },
      ] as const,
    [t],
  );

  async function reloadLiveStock() {
    await refresh();
    onInventoryChanged?.();
  }

  async function onPlaceOrder() {
    if (!customer?.id) {
      router.push('/auth-required');
      return;
    }
    if (!selectedGroup) return;
    if (selectedHasStockIssue) {
      Alert.alert(t('store_stock_insufficient_title'), t('store_cart_over_stock_banner'));
      return;
    }
    if (fulfillment === 'cod' && !deliveryAddress.trim()) {
      Alert.alert(t('store_checkout_address_required_title'), t('store_checkout_address_required_body'));
      return;
    }

    setPlacing(true);
    try {
      const orderId = await placeStoreOrder({
        fulfillmentMethod: fulfillment,
        deliveryFee,
        customerName: customer.name,
        customerPhone: customer.phone,
        deliveryAddress: fulfillment === 'cod' ? deliveryAddress : undefined,
        notes,
        shopId: selectedGroup.shopId === 'unknown' ? undefined : selectedGroup.shopId,
      });
      if (!orderId) {
        Alert.alert(t('store_checkout_fail_title'), t('store_checkout_fail_body'));
        await reloadLiveStock();
        return;
      }
      await refresh();
      setNotes('');
      if (remainingShops <= 0) {
        setDeliveryAddress('');
        onClose();
      }
      Alert.alert(
        t('store_checkout_success_title'),
        remainingShops > 0
          ? t('store_cart_other_shops_remain').replace('{count}', String(remainingShops))
          : t('store_checkout_success_body'),
      );
    } catch (error) {
      await reloadLiveStock();
      if (isInsufficientStockError(error)) {
        Alert.alert(t('store_stock_insufficient_title'), t('store_stock_insufficient_body'));
        return;
      }
      Alert.alert(
        t('store_checkout_fail_title'),
        error instanceof Error ? error.message : t('store_checkout_fail_body'),
      );
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

  const checkoutDisabled = placing || checkoutItems.length === 0 || selectedHasStockIssue;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
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
              groups.map((group) => {
                const active = group.shopId === selectedGroup?.shopId;
                return (
                  <View
                    key={group.shopId}
                    style={[
                      styles.shopBag,
                      {
                        borderColor: active ? theme.accent : theme.border,
                        backgroundColor: theme.card,
                      },
                    ]}>
                    <Pressable onPress={() => setSelectedShopId(group.shopId)} style={styles.shopHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.shopName, { color: theme.text }]}>{group.shopName}</Text>
                        <Text style={[styles.shopMeta, { color: theme.textMuted }]}>
                          {group.itemCount} {t('store_owner_items')} · {formatEgp(group.subtotal, locale)}
                        </Text>
                      </View>
                      {groups.length > 1 ? (
                        <View style={[styles.shopSelect, { backgroundColor: active ? theme.accent : theme.bgElevated }]}>
                          <Text style={{ color: active ? theme.onAccent : theme.text, fontWeight: '800', fontSize: 11 }}>
                            {active ? t('store_cart_checkout_this_shop') : t('store_cart_select_shop')}
                          </Text>
                        </View>
                      ) : null}
                    </Pressable>

                    {group.items.map((row) => {
                      const thumb = row.product ? primaryProductImageUrl(row.product) : undefined;
                      const stock = availableStock(row.product);
                      const overStock = cartItemExceedsStock(row);
                      return (
                        <View
                          key={row.id}
                          style={[
                            styles.line,
                            {
                              borderColor: overStock ? theme.danger : theme.border,
                              backgroundColor: overStock ? theme.dangerSoft : 'transparent',
                            },
                          ]}>
                          <View style={styles.lineTop}>
                            {thumb ? (
                              <Image source={{ uri: thumb }} style={styles.thumb} contentFit="cover" />
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
                                {formatEgp((row.product?.salePrice ?? row.product?.price ?? 0) * row.quantity, locale)}
                              </Text>
                            </View>
                            <Pressable onPress={() => void removeItem(row.id)}>
                              <FontAwesome name="trash-o" size={16} color={theme.danger} />
                            </Pressable>
                          </View>
                          <StoreQuantityStepper
                            quantity={row.quantity}
                            max={stock}
                            allowInput
                            disabled={busyId === row.id}
                            onChange={(next) => void changeQty(row.id, next)}
                          />
                        </View>
                      );
                    })}
                  </View>
                );
              })
            )}

            {checkoutItems.length > 0 ? (
              <>
                {selectedHasStockIssue ? (
                  <View style={[styles.banner, { borderColor: theme.danger, backgroundColor: theme.dangerSoft }]}>
                    <FontAwesome name="exclamation-triangle" size={14} color={theme.danger} />
                    <Text style={[styles.bannerText, { color: theme.danger }]}>
                      {t('store_cart_over_stock_banner')}
                    </Text>
                  </View>
                ) : null}
                {groups.length > 1 ? (
                  <Text style={[styles.hint, { color: theme.textMuted }]}>
                    {t('store_cart_one_shop_hint').replace('{shop}', selectedGroup?.shopName ?? '')}
                  </Text>
                ) : null}
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

                {fulfillment === 'cod' ? (
                  <>
                    <Text style={[styles.formLabel, { color: theme.text }]}>{t('store_checkout_delivery_address')}</Text>
                    <TextInput
                      value={deliveryAddress}
                      onChangeText={setDeliveryAddress}
                      placeholder={t('store_checkout_delivery_address_placeholder')}
                      placeholderTextColor={theme.textDim}
                      multiline
                      style={[styles.formInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.card }]}
                    />
                  </>
                ) : null}
                <Text style={[styles.formLabel, { color: theme.text }]}>{t('store_checkout_notes')}</Text>
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  placeholder={t('store_checkout_notes_placeholder')}
                  placeholderTextColor={theme.textDim}
                  multiline
                  style={[styles.formInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.card }]}
                />

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
            disabled={checkoutDisabled}
            style={[
              styles.checkoutBtn,
              { backgroundColor: theme.accent, opacity: checkoutDisabled ? 0.55 : 1 },
            ]}>
            {placing ? (
              <ActivityIndicator color={theme.onAccent} />
            ) : (
              <Text style={[styles.checkoutText, { color: theme.onAccent }]}>
                {selectedGroup
                  ? t('store_place_order_shop').replace('{shop}', selectedGroup.shopName)
                  : t('store_place_order')}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: BOXED_OVERLAY.backdrop,
  sheet: {
    ...BOXED_OVERLAY.card,
    maxWidth: 480,
    maxHeight: '88%',
    padding: 16,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  rowRtl: { flexDirection: 'row-reverse' },
  title: { fontSize: 20, fontWeight: '900' },
  content: { gap: 10, paddingBottom: 12 },
  empty: { textAlign: 'center', paddingVertical: 32, fontSize: 14 },
  shopBag: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 10 },
  shopHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  shopName: { fontSize: 15, fontWeight: '900' },
  shopMeta: { marginTop: 2, fontSize: 12, fontWeight: '700' },
  shopSelect: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  line: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 10 },
  lineTop: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  thumb: { width: 56, height: 56, borderRadius: 10 },
  lineBody: { flex: 1 },
  lineName: { fontSize: 14, fontWeight: '800' },
  linePrice: { fontSize: 13, marginTop: 4, fontWeight: '700' },
  banner: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  bannerText: { flex: 1, fontSize: 13, fontWeight: '700', lineHeight: 18 },
  hint: { fontSize: 12, fontWeight: '700', lineHeight: 18 },
  sectionTitle: { fontSize: 15, fontWeight: '800', marginTop: 8 },
  segmentRow: { flexDirection: 'row', gap: 8 },
  segment: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  segmentText: { fontSize: 12, fontWeight: '800', textAlign: 'center' },
  formLabel: { fontSize: 13, fontWeight: '800', marginTop: 4 },
  formInput: { minHeight: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, textAlignVertical: 'top' },
  summary: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 8, marginTop: 4 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryTotal: { marginTop: 4, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(0,0,0,0.08)' },
  totalLabel: { fontSize: 16, fontWeight: '900' },
  checkoutBtn: { borderRadius: 9, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  checkoutText: { fontSize: 16, fontWeight: '600', letterSpacing: 0.5, textAlign: 'center' },
});
