import * as Print from 'expo-print';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { APP_BRAND_NAME } from '@/constants/Brand';
import type { AppThemeTokens } from '@/constants/Theme';
import { useI18n } from '@/context/I18nContext';
import { formatEgp } from '@/lib/booking/reporting';
import type { CustomerStoreOrder } from '@/lib/store/types';
import {
  CUSTOMER_STORE_STATUS_LABEL,
  CUSTOMER_STORE_STATUS_TONE,
  buildStoreOrderInvoiceHtml,
  formatStoreOrderFullTimestamp,
  formatStoreOrderShortId,
  isStoreOrderDelivery,
  storeOrderPaymentLabelKey,
} from '@/lib/store/storeOrderInvoice';

type Props = {
  visible: boolean;
  order: CustomerStoreOrder | null;
  theme: AppThemeTokens;
  shopName: string;
  shopPhone: string;
  shopAddress: string;
  customerName: string;
  customerPhone: string;
  onClose: () => void;
};

export function StoreOrderInvoiceModal({
  visible,
  order,
  theme,
  shopName,
  shopPhone,
  shopAddress,
  customerName,
  customerPhone,
  onClose,
}: Props) {
  const { t, locale } = useI18n();
  const [printing, setPrinting] = useState(false);

  const shortId = order ? formatStoreOrderShortId(order.id) : '';
  const timestamp = order ? formatStoreOrderFullTimestamp(order.createdAt, locale) : '';
  const statusTone = order ? CUSTOMER_STORE_STATUS_TONE[order.status] : CUSTOMER_STORE_STATUS_TONE.pending;
  const statusLabel = order ? t(CUSTOMER_STORE_STATUS_LABEL[order.status]) : '';
  const isDelivery = order ? isStoreOrderDelivery(order.fulfillmentMethod) : false;
  const fulfillmentLabel = order
    ? t(isDelivery ? 'customer_store_fulfillment_delivery' : 'customer_store_fulfillment_pickup')
    : '';
  const paymentLabel = order ? t(storeOrderPaymentLabelKey(order.fulfillmentMethod)) : '';
  const deliveryFree = Boolean(order && (order.fulfillmentMethod === 'pickup' || order.deliveryFee <= 0));
  const dash = { borderBottomColor: theme.border };

  const invoiceCopy = useMemo(
    () => ({
      title: t('customer_store_invoice_title'),
      soldBy: t('customer_store_invoice_sold_by'),
      billTo: t('customer_store_invoice_bill_to'),
      orderNo: t('customer_store_invoice_order_no'),
      date: t('customer_store_invoice_date'),
      status: t('customer_store_invoice_status'),
      fulfillment: t('customer_store_invoice_fulfillment'),
      payment: t('customer_store_invoice_payment'),
      storeAddress: t('customer_store_invoice_store_address'),
      deliveryAddress: t('customer_store_invoice_delivery_address'),
      notes: t('customer_store_invoice_notes'),
      item: t('customer_store_invoice_item'),
      qtyPrice: t('customer_store_invoice_qty_price'),
      lineTotal: t('customer_store_invoice_line_total'),
      subtotal: t('customer_store_subtotal'),
      deliveryFee: t('store_delivery_fee'),
      deliveryFree: t('customer_store_invoice_delivery_free'),
      grandTotal: t('customer_store_grand_total'),
      brand: APP_BRAND_NAME,
    }),
    [t],
  );

  async function onPrint() {
    if (!order) return;
    setPrinting(true);
    try {
      const html = buildStoreOrderInvoiceHtml({
        order,
        shopName,
        shopPhone,
        shopAddress,
        fulfillmentDetail: isDelivery
          ? order.deliveryAddress?.trim() || '—'
          : shopAddress || '—',
        customerName,
        customerPhone,
        statusLabel,
        fulfillmentLabel,
        paymentLabel,
        locale,
        copy: invoiceCopy,
      });
      await Print.printAsync({ html });
    } finally {
      setPrinting(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            <Text style={[styles.title, { color: theme.text }]}>{t('customer_store_invoice_title')}</Text>
            <Text style={[styles.brand, { color: theme.textMuted }]}>{APP_BRAND_NAME}</Text>
            <View style={[styles.dash, dash]} />

            {order ? (
              <>
                <View style={styles.metaGrid}>
                  <View style={styles.metaCol}>
                    <Text style={[styles.label, { color: theme.textDim }]}>{t('customer_store_invoice_sold_by')}</Text>
                    <Text style={[styles.value, { color: theme.text }]}>{shopName || '—'}</Text>
                    <Text style={[styles.muted, { color: theme.textMuted }]}>{shopPhone || '—'}</Text>
                  </View>
                  <View style={styles.metaCol}>
                    <Text style={[styles.label, { color: theme.textDim }]}>{t('customer_store_invoice_order_no')}</Text>
                    <Text style={[styles.value, { color: theme.text }]}>#{shortId}</Text>
                    <Text style={[styles.muted, { color: theme.textMuted }]}>{timestamp}</Text>
                    <View
                      style={[
                        styles.badge,
                        { backgroundColor: statusTone.backgroundColor, borderColor: statusTone.borderColor },
                      ]}>
                      <Text style={[styles.badgeText, { color: statusTone.color }]}>{statusLabel}</Text>
                    </View>
                  </View>
                </View>

                <View style={[styles.dash, dash]} />

                <View style={styles.metaGrid}>
                  <View style={styles.metaCol}>
                    <Text style={[styles.label, { color: theme.textDim }]}>{t('customer_store_invoice_bill_to')}</Text>
                    <Text style={[styles.value, { color: theme.text }]}>{customerName || '—'}</Text>
                    <Text style={[styles.muted, { color: theme.textMuted }]}>{customerPhone || '—'}</Text>
                  </View>
                  <View style={styles.metaCol}>
                    <Text style={[styles.label, { color: theme.textDim }]}>
                      {t('customer_store_invoice_fulfillment')}
                    </Text>
                    <Text style={[styles.value, { color: theme.text }]}>{fulfillmentLabel}</Text>
                    <Text style={[styles.muted, { color: theme.textMuted }]}>
                      {isDelivery
                        ? `${t('customer_store_invoice_delivery_address')}: ${order.deliveryAddress?.trim() || '—'}`
                        : `${t('customer_store_invoice_store_address')}: ${shopAddress || '—'}`}
                    </Text>
                    {isDelivery && order.deliveryNotes?.trim() ? (
                      <Text style={[styles.muted, { color: theme.textMuted }]}>
                        {t('customer_store_invoice_notes')}: {order.deliveryNotes.trim()}
                      </Text>
                    ) : null}
                    <View style={[styles.badge, { borderColor: theme.accent, backgroundColor: theme.accentSoft }]}>
                      <Text style={[styles.badgeText, { color: theme.accent }]}>{paymentLabel}</Text>
                    </View>
                  </View>
                </View>

                <View style={[styles.dash, dash]} />

                <View style={styles.tableHead}>
                  <Text style={[styles.th, styles.colItem, { color: theme.textDim }]}>
                    {t('customer_store_invoice_item')}
                  </Text>
                  <Text style={[styles.th, styles.colQty, { color: theme.textDim }]}>
                    {t('customer_store_invoice_qty_price')}
                  </Text>
                  <Text style={[styles.th, styles.colTotal, { color: theme.textDim }]}>
                    {t('customer_store_invoice_line_total')}
                  </Text>
                </View>
                {order.items.map((item) => (
                  <View key={item.id} style={[styles.tableRow, dash]}>
                    <Text style={[styles.td, styles.colItem, { color: theme.text }]}>{item.productName}</Text>
                    <Text style={[styles.td, styles.colQty, { color: theme.textMuted }]}>
                      {item.quantity} × {formatEgp(item.unitPrice, locale)}
                    </Text>
                    <Text style={[styles.td, styles.colTotal, { color: theme.text }]}>
                      {formatEgp(item.lineTotal, locale)}
                    </Text>
                  </View>
                ))}

                <View style={[styles.dash, dash]} />

                <View style={styles.totals}>
                  <View style={styles.totalRow}>
                    <Text style={[styles.totalLabel, { color: theme.textMuted }]}>{t('customer_store_subtotal')}</Text>
                    <Text style={[styles.totalValue, { color: theme.text }]}>{formatEgp(order.subtotal, locale)}</Text>
                  </View>
                  <View style={styles.totalRow}>
                    <Text style={[styles.totalLabel, { color: theme.textMuted }]}>{t('store_delivery_fee')}</Text>
                    <Text style={[styles.totalValue, { color: theme.text }]}>
                      {deliveryFree ? t('customer_store_invoice_delivery_free') : formatEgp(order.deliveryFee, locale)}
                    </Text>
                  </View>
                  <View style={styles.totalRow}>
                    <Text style={[styles.grandLabel, { color: theme.text }]}>{t('customer_store_grand_total')}</Text>
                    <Text style={[styles.grandValue, { color: theme.accent }]}>
                      {formatEgp(order.totalPrice, locale)}
                    </Text>
                  </View>
                </View>
              </>
            ) : null}
          </ScrollView>

          <Pressable
            onPress={() => {
              void onPrint();
            }}
            disabled={printing || !order}
            style={[styles.secondaryBtn, { borderColor: theme.border, opacity: printing ? 0.65 : 1 }]}>
            {printing ? (
              <ActivityIndicator color={theme.accent} />
            ) : (
              <Text style={[styles.secondaryBtnText, { color: theme.text }]}>
                {t('customer_store_invoice_print')}
              </Text>
            )}
          </Pressable>
          <Pressable onPress={onClose} style={[styles.primaryBtn, { backgroundColor: theme.accent }]}>
            <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>{t('customer_store_invoice_close')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '90%',
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },
  scroll: { maxHeight: 520 },
  scrollContent: { paddingBottom: 8 },
  title: { fontSize: 20, fontWeight: '900', textAlign: 'center' },
  brand: { fontSize: 12, fontWeight: '700', textAlign: 'center', marginTop: 4 },
  dash: {
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    marginVertical: 12,
  },
  metaGrid: { flexDirection: 'row', gap: 12 },
  metaCol: { flex: 1, minWidth: 0, gap: 3 },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  value: { fontSize: 15, fontWeight: '800' },
  muted: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  badge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 6,
  },
  badgeText: { fontSize: 11, fontWeight: '800' },
  tableHead: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  tableRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 8,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderStyle: 'dashed',
  },
  th: { fontSize: 11, fontWeight: '800' },
  td: { fontSize: 13, fontWeight: '700' },
  colItem: { flex: 1.2 },
  colQty: { flex: 1 },
  colTotal: { flex: 0.9, textAlign: 'right' },
  totals: { gap: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 14, fontWeight: '700' },
  totalValue: { fontSize: 14, fontWeight: '800' },
  grandLabel: { fontSize: 16, fontWeight: '900' },
  grandValue: { fontSize: 16, fontWeight: '900' },
  secondaryBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '800' },
  primaryBtn: { marginTop: 8, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  primaryBtnText: { fontSize: 15, fontWeight: '800' },
});
