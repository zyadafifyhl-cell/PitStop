import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Image } from 'expo-image';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppThemeTokens } from '@/constants/Theme';
import { formatOrderCardDateTime } from '@/lib/booking/customerOrderPresentation';
import { formatEgp } from '@/lib/booking/reporting';
import type { Locale, TranslationKey } from '@/lib/i18n/strings';
import type { CustomerStoreOrder, StoreOrderStatus } from '@/lib/store/types';

const STATUS_TONE: Record<StoreOrderStatus, { backgroundColor: string; borderColor: string; color: string }> = {
  pending: { backgroundColor: 'rgba(245,197,24,0.16)', borderColor: '#F5C518', color: '#F5C518' },
  preparing: { backgroundColor: 'rgba(59,130,246,0.16)', borderColor: '#3B82F6', color: '#60A5FA' },
  ready: { backgroundColor: 'rgba(168,85,247,0.16)', borderColor: '#A855F7', color: '#C084FC' },
  completed: { backgroundColor: 'rgba(34,197,94,0.16)', borderColor: '#22C55E', color: '#4ADE80' },
  cancelled: { backgroundColor: 'rgba(239,68,68,0.16)', borderColor: '#EF4444', color: '#F87171' },
};

const STATUS_LABEL: Record<StoreOrderStatus, TranslationKey> = {
  pending: 'customer_store_status_pending',
  preparing: 'customer_store_status_preparing',
  ready: 'customer_store_status_ready',
  completed: 'customer_store_status_completed',
  cancelled: 'customer_store_status_cancelled',
};

type Props = {
  order: CustomerStoreOrder;
  locale: Locale;
  theme: AppThemeTokens;
  t: (key: TranslationKey) => string;
  tp: (key: TranslationKey, vars: Record<string, string>) => string;
  cancelBusy: boolean;
  reorderBusy: boolean;
  onCancel: () => void;
  onCall: () => void;
  onWhatsApp: () => void;
  onInvoice: () => void;
  onBuyAgain: () => void;
};

export function CustomerStoreOrderCard({
  order,
  locale,
  theme,
  t,
  tp,
  cancelBusy,
  reorderBusy,
  onCancel,
  onCall,
  onWhatsApp,
  onInvoice,
  onBuyAgain,
}: Props) {
  const statusTone = STATUS_TONE[order.status];
  const shopName = (locale === 'ar' ? order.shopNameAr || order.shopName : order.shopName) || t('customer_store_unknown_shop');
  const shortId = order.id.replace(/-/g, '').slice(0, 8).toUpperCase();
  const isDelivery = order.fulfillmentMethod !== 'pickup';
  const canCancel = order.status === 'pending';
  const canReorder = order.status === 'completed';
  const hasPhone = Boolean(order.shopPhone?.trim());

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.topRow}>
        <View style={[styles.statusBadge, { backgroundColor: statusTone.backgroundColor, borderColor: statusTone.borderColor }]}>
          <Text style={[styles.statusBadgeText, { color: statusTone.color }]}>{t(STATUS_LABEL[order.status])}</Text>
        </View>
        <Text style={[styles.dateText, { color: theme.textMuted }]}>
          {formatOrderCardDateTime(order.createdAt, locale)}
        </Text>
      </View>

      <Text style={[styles.shopName, { color: theme.text }]} numberOfLines={2}>
        {shopName}
      </Text>
      <Text style={[styles.meta, { color: theme.textMuted }]}>{tp('customer_store_order_id', { id: shortId })}</Text>
      <Text style={[styles.total, { color: theme.text }]}>{formatEgp(order.totalPrice, locale)}</Text>

      <View style={styles.lines}>
        {order.items.map((item) => (
          <View key={item.id} style={styles.lineRow}>
            {item.productImageUrl ? (
              <Image source={{ uri: item.productImageUrl }} style={styles.thumb} contentFit="cover" />
            ) : (
              <View style={[styles.thumb, { backgroundColor: theme.bgElevated }]} />
            )}
            <View style={styles.lineMeta}>
              <Text style={[styles.lineName, { color: theme.text }]} numberOfLines={2}>
                {item.productName}
              </Text>
              <Text style={[styles.meta, { color: theme.textMuted }]}>
                {tp('customer_store_qty', { count: String(item.quantity) })} · {formatEgp(item.unitPrice, locale)}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={[styles.fulfillment, { color: theme.textMuted }]}>
        {isDelivery ? t('customer_store_fulfillment_delivery') : t('customer_store_fulfillment_pickup')}
        {isDelivery && order.deliveryAddress ? ` · ${order.deliveryAddress}` : ''}
      </Text>

      <View style={styles.actions}>
        {hasPhone ? (
          <>
            <Pressable onPress={onCall} style={[styles.actionBtn, { borderColor: theme.border }]}>
              <FontAwesome name="phone" size={13} color={theme.text} />
              <Text style={[styles.actionText, { color: theme.text }]}>{t('customer_store_call')}</Text>
            </Pressable>
            <Pressable onPress={onWhatsApp} style={[styles.actionBtn, { borderColor: theme.border }]}>
              <FontAwesome name="whatsapp" size={13} color={theme.text} />
              <Text style={[styles.actionText, { color: theme.text }]}>{t('customer_store_whatsapp')}</Text>
            </Pressable>
          </>
        ) : null}
        <Pressable onPress={onInvoice} style={[styles.actionBtn, { borderColor: theme.border }]}>
          <Text style={[styles.actionText, { color: theme.accent }]}>{t('customer_store_invoice')}</Text>
        </Pressable>
        {canCancel ? (
          <Pressable
            onPress={onCancel}
            disabled={cancelBusy}
            style={[styles.actionBtn, { borderColor: theme.danger, opacity: cancelBusy ? 0.65 : 1 }]}>
            <Text style={[styles.actionText, { color: theme.danger }]}>
              {cancelBusy ? t('book_saving') : t('customer_store_cancel')}
            </Text>
          </Pressable>
        ) : null}
        {canReorder ? (
          <Pressable
            onPress={onBuyAgain}
            disabled={reorderBusy}
            style={[styles.actionBtn, { borderColor: theme.text, opacity: reorderBusy ? 0.65 : 1 }]}>
            <Text style={[styles.actionText, { color: theme.text }]}>
              {reorderBusy ? t('book_saving') : t('customer_store_buy_again')}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 20,
    marginBottom: 14,
    padding: 16,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10,
  },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  dateText: { fontSize: 13, fontWeight: '600' },
  shopName: { fontSize: 17, fontWeight: '900' },
  meta: { fontSize: 13, fontWeight: '600', marginTop: 3 },
  total: { fontSize: 16, fontWeight: '900', marginTop: 8 },
  lines: { marginTop: 12, gap: 10 },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumb: { width: 48, height: 48, borderRadius: 10 },
  lineMeta: { flex: 1, minWidth: 0 },
  lineName: { fontSize: 14, fontWeight: '800' },
  fulfillment: { fontSize: 13, fontWeight: '600', marginTop: 12, lineHeight: 19 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actionText: { fontSize: 13, fontWeight: '800' },
});
