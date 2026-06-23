import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AppTheme } from '@/constants/Theme';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useI18n } from '@/context/I18nContext';
import {
  buildPartsInvoiceEmailBody,
  markCustomerInvoiceEmailed,
} from '@/lib/booking/commerceEvents';
import { getShopById } from '@/lib/booking/demoShops';
import { formatEgp } from '@/lib/booking/reporting';
import { createPartsOrder, listInventoryForShop } from '@/lib/booking/partsStorage';
import type { SparePartItem } from '@/lib/booking/types';
import { formatPhoneDisplay, openEmailTo, openPhone, openShopInMaps } from '@/lib/linking/contact';

export default function PartsShopScreen() {
  const { shopId } = useLocalSearchParams<{ shopId: string }>();
  const { t, locale } = useI18n();
  const { customer } = useCustomerAuth();
  const shop = useMemo(() => (shopId ? getShopById(shopId) : undefined), [shopId]);

  const [items, setItems] = useState<SparePartItem[]>([]);
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({});
  const [shippingAddress, setShippingAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    if (!shop) return;
    const rows = await listInventoryForShop(shop.id);
    setItems(rows);
  }, [shop]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  if (!shop || shop.type !== 'parts') {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{t('parts_shop_not_found')}</Text>
      </View>
    );
  }

  const selectedCount = Object.values(qtyMap).reduce((s, x) => s + Math.max(0, x), 0);

  async function onSubmitOrder() {
    if (!customer || !shop) return;
    if (!shippingAddress.trim()) {
      Alert.alert(t('parts_shipping_missing_title'), t('parts_shipping_missing_body'));
      return;
    }
    const lines = Object.entries(qtyMap)
      .map(([partId, qty]) => ({ partId, qty: Math.max(0, Math.floor(qty)) }))
      .filter((x) => x.qty > 0);
    if (!lines.length) {
      Alert.alert(t('parts_select_items_title'), t('parts_select_items_body'));
      return;
    }

    setSubmitting(true);
    try {
      const result = await createPartsOrder({
        shopId: shop.id,
        customerId: customer.id,
        customerEmail: customer.email,
        customerPhone: customer.phone,
        shippingAddress: shippingAddress.trim(),
        items: lines,
      });
      if (result.error) {
        Alert.alert(t('parts_order_fail_title'), result.error);
        return;
      }
      setQtyMap({});
      setShippingAddress('');
      await refresh();
      if (result.order && customer.email) {
        const emailPayload = buildPartsInvoiceEmailBody({
          locale,
          shopName: locale === 'ar' ? shop.nameAr : shop.name,
          orderId: result.order.id,
          shippingAddress: result.order.shippingAddress,
          subtotalText: formatEgp(result.order.subtotalEgp, locale),
          feeText: formatEgp(result.order.platformFeeEgp, locale),
          totalText: formatEgp(result.order.totalEgp, locale),
          items: result.order.items,
        });
        try {
          await openEmailTo(customer.email, emailPayload.subject, emailPayload.body);
          await markCustomerInvoiceEmailed(result.order.id, new Date().toISOString());
        } catch {
          Alert.alert(t('parts_invoice_email_fail_title'), t('parts_invoice_email_fail_body'));
        }
      }
      Alert.alert(t('parts_order_success_title'), t('parts_order_success_body'), [
        { text: t('welcome_ok'), onPress: () => router.push('/bookings') },
      ]);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.shopName}>{locale === 'ar' ? shop.nameAr : shop.name}</Text>
      <Text style={styles.meta}>{locale === 'ar' ? shop.addressAr : shop.address}</Text>

      <View style={styles.contactRow}>
        <Pressable onPress={() => openPhone(shop.phone)} style={styles.contactChip}>
          <Text style={styles.contactText}>
            {t('book_call_shop')} · {formatPhoneDisplay(shop.phone)}
          </Text>
        </Pressable>
        <Pressable onPress={() => openShopInMaps(shop, locale)} style={styles.contactChip}>
          <Text style={styles.contactText}>{t('book_open_maps')}</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>{t('parts_inventory_title')}</Text>
      {items.length === 0 ? (
        <Text style={styles.empty}>{t('parts_inventory_empty')}</Text>
      ) : (
        items.map((item) => {
          const qty = qtyMap[item.id] ?? 0;
          const out = item.stockQty <= 0;
          return (
            <View key={item.id} style={styles.partCard}>
              {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.partImage} /> : null}
              <View style={{ flex: 1 }}>
                <Text style={styles.partName}>{item.name}</Text>
                <Text style={styles.partMeta}>
                  {formatEgp(item.priceEgp, locale)} · {t('parts_stock')}: {item.stockQty}
                </Text>
                <View style={styles.qtyRow}>
                  <Pressable
                    onPress={() => setQtyMap((p) => ({ ...p, [item.id]: Math.max(0, qty - 1) }))}
                    style={styles.qtyBtn}>
                    <Text style={styles.qtyBtnText}>-</Text>
                  </Pressable>
                  <Text style={styles.qtyValue}>{qty}</Text>
                  <Pressable
                    onPress={() =>
                      setQtyMap((p) => ({
                        ...p,
                        [item.id]: Math.min(item.stockQty, qty + 1),
                      }))
                    }
                    disabled={out}
                    style={[styles.qtyBtn, out && { opacity: 0.4 }]}>
                    <Text style={styles.qtyBtnText}>+</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          );
        })
      )}

      <Text style={styles.sectionTitle}>{t('parts_shipping_address_label')}</Text>
      <TextInput
        value={shippingAddress}
        onChangeText={setShippingAddress}
        placeholder={t('parts_shipping_address_placeholder')}
        placeholderTextColor={AppTheme.textDim}
        style={styles.input}
        multiline
      />

      <Pressable
        onPress={onSubmitOrder}
        disabled={submitting || selectedCount === 0}
        style={[styles.submitBtn, (submitting || selectedCount === 0) && { opacity: 0.65 }]}>
        <Text style={styles.submitText}>
          {submitting
            ? t('parts_order_submitting')
            : t('parts_order_submit').replace('{n}', String(selectedCount))}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppTheme.bg },
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: AppTheme.bg },
  error: { color: AppTheme.textMuted },
  shopName: { color: AppTheme.text, fontSize: 24, fontWeight: '900', marginBottom: 4 },
  meta: { color: AppTheme.textMuted, fontSize: 14, marginBottom: 14 },
  contactRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  contactChip: {
    borderWidth: 1,
    borderColor: AppTheme.accent,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  contactText: { color: AppTheme.accent, fontSize: 13, fontWeight: '700' },
  sectionTitle: { color: AppTheme.text, fontSize: 16, fontWeight: '800', marginBottom: 10, marginTop: 4 },
  empty: { color: AppTheme.textMuted, marginBottom: 20 },
  partCard: {
    borderWidth: 1,
    borderColor: AppTheme.border,
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    flexDirection: 'row',
    gap: 10,
    backgroundColor: AppTheme.card,
  },
  partImage: { width: 74, height: 74, borderRadius: 8, backgroundColor: '#1f2937' },
  partName: { color: AppTheme.text, fontSize: 15, fontWeight: '700' },
  partMeta: { color: AppTheme.textMuted, fontSize: 13, marginTop: 3 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  qtyBtn: {
    width: 30,
    height: 30,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: AppTheme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnText: { color: AppTheme.text, fontSize: 16, fontWeight: '700' },
  qtyValue: { color: AppTheme.text, minWidth: 22, textAlign: 'center', fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: AppTheme.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: AppTheme.text,
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: 'top',
    backgroundColor: AppTheme.card,
  },
  submitBtn: {
    marginTop: 14,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: AppTheme.accent,
  },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
