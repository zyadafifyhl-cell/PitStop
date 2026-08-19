import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text } from 'react-native';

import { CustomerStoreOrderCard } from '@/components/customer/CustomerStoreOrderCard';
import { StoreOrderInvoiceModal } from '@/components/customer/StoreOrderInvoiceModal';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useI18n } from '@/context/I18nContext';
import { useStoreCart } from '@/context/StoreCartContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { getShopById } from '@/lib/booking/catalogRepository';
import { openPhone, openWhatsAppTo } from '@/lib/linking/contact';
import { normalizePhoneE164 } from '@/lib/phone';
import { cancelOwnStoreOrder, getStoreProductById, listStoreOrdersForUser } from '@/lib/store/productRepository';
import type { CustomerStoreOrder } from '@/lib/store/types';
import { showCustomConfirm } from '@/lib/ui/CustomConfirmProvider';

type Props = {
  userId?: string;
};

function formatDisplayPhone(phone: string): string {
  return phone.startsWith('+20') ? `0${phone.slice(3)}` : phone;
}

function resolveShopPhone(order: CustomerStoreOrder): string {
  const fromOrder = order.shopPhone?.trim();
  if (fromOrder) return fromOrder;
  if (order.shopId) return getShopById(order.shopId)?.phone?.trim() || '';
  return '';
}

function resolveShopName(order: CustomerStoreOrder, locale: 'en' | 'ar'): string {
  if (locale === 'ar' && order.shopNameAr) return order.shopNameAr;
  if (order.shopName) return order.shopName;
  if (order.shopId) {
    const shop = getShopById(order.shopId);
    if (shop) return locale === 'ar' ? shop.nameAr || shop.name : shop.name;
  }
  return '';
}

function resolveShopAddress(order: CustomerStoreOrder, locale: 'en' | 'ar'): string {
  if (locale === 'ar' && order.shopAddressAr) return order.shopAddressAr;
  if (order.shopAddress) return order.shopAddress;
  if (order.shopId) {
    const shop = getShopById(order.shopId);
    if (shop) return locale === 'ar' ? shop.addressAr || shop.address : shop.address;
  }
  return '';
}

export function CustomerStoreOrdersList({ userId }: Props) {
  const theme = useAppTheme();
  const { t, tp, locale } = useI18n();
  const { customer } = useCustomerAuth();
  const { addProduct } = useStoreCart();
  const [orders, setOrders] = useState<CustomerStoreOrder[]>([]);
  const [busy, setBusy] = useState(true);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [reorderId, setReorderId] = useState<string | null>(null);
  const [invoiceOrder, setInvoiceOrder] = useState<CustomerStoreOrder | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setOrders([]);
      setBusy(false);
      return;
    }
    setBusy(true);
    try {
      const rows = await listStoreOrdersForUser(userId);
      setOrders(
        rows.map((row) => {
          const catalog = row.shopId ? getShopById(row.shopId) : undefined;
          return {
            ...row,
            shopName: row.shopName || catalog?.name,
            shopNameAr: row.shopNameAr || catalog?.nameAr,
            shopPhone: row.shopPhone || catalog?.phone,
            shopAddress: row.shopAddress || catalog?.address,
            shopAddressAr: row.shopAddressAr || catalog?.addressAr,
          };
        }),
      );
    } catch {
      setOrders([]);
    } finally {
      setBusy(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  function onCall(order: CustomerStoreOrder) {
    const phone = resolveShopPhone(order);
    if (!phone) {
      Alert.alert(t('customer_store_no_phone'));
      return;
    }
    const e164 = phone.startsWith('+') ? phone : normalizePhoneE164(phone) ?? phone;
    void openPhone(e164).catch(() => Alert.alert(t('customer_store_no_phone')));
  }

  function onWhatsApp(order: CustomerStoreOrder) {
    const phone = resolveShopPhone(order);
    if (!phone) {
      Alert.alert(t('customer_store_no_phone'));
      return;
    }
    const shortId = order.id.replace(/-/g, '').slice(0, 8).toUpperCase();
    void openWhatsAppTo(phone, tp('customer_store_whatsapp_prefill', { id: shortId })).catch(() =>
      Alert.alert(t('customer_store_no_phone')),
    );
  }

  function onCancel(order: CustomerStoreOrder) {
    showCustomConfirm({
      title: t('store_order_cancel_title'),
      message: t('store_order_cancel_body'),
      confirmLabel: t('customer_store_cancel'),
      cancelLabel: t('store_order_keep'),
      destructive: true,
      onConfirm: async () => {
        setCancelId(order.id);
        try {
          const ok = await cancelOwnStoreOrder(order.id);
          if (!ok) {
            Alert.alert(t('customer_store_cancel_fail'));
            return;
          }
          await refresh();
        } finally {
          setCancelId(null);
        }
      },
    });
  }

  async function onBuyAgain(order: CustomerStoreOrder) {
    setReorderId(order.id);
    try {
      let added = 0;
      for (const item of order.items) {
        if (!item.productId) continue;
        const product = await getStoreProductById(item.productId);
        if (!product) continue;
        const ok = await addProduct(product, item.quantity);
        if (ok) added += 1;
      }
      if (added === 0) {
        Alert.alert(t('customer_store_reorder_fail'));
        return;
      }
      Alert.alert(t('customer_store_reorder_ok'));
      router.push('/store');
    } finally {
      setReorderId(null);
    }
  }

  if (!userId) {
    return <Text style={[styles.empty, { color: theme.textMuted }]}>{t('customer_orders_empty_guest')}</Text>;
  }

  if (busy) {
    return <ActivityIndicator style={{ marginTop: 24 }} color={theme.accent} />;
  }

  if (orders.length === 0) {
    return <Text style={[styles.empty, { color: theme.textMuted }]}>{t('customer_orders_empty')}</Text>;
  }

  return (
    <>
      {orders.map((order) => (
        <CustomerStoreOrderCard
          key={order.id}
          order={{
            ...order,
            shopName: resolveShopName(order, locale) || order.shopName,
          }}
          locale={locale}
          theme={theme}
          t={t}
          tp={tp}
          cancelBusy={cancelId === order.id}
          reorderBusy={reorderId === order.id}
          onCancel={() => onCancel(order)}
          onCall={() => onCall(order)}
          onWhatsApp={() => onWhatsApp(order)}
          onInvoice={() => setInvoiceOrder(order)}
          onBuyAgain={() => {
            void onBuyAgain(order);
          }}
        />
      ))}

      <StoreOrderInvoiceModal
        visible={!!invoiceOrder}
        order={invoiceOrder}
        theme={theme}
        shopName={invoiceOrder ? resolveShopName(invoiceOrder, locale) : ''}
        shopPhone={invoiceOrder ? resolveShopPhone(invoiceOrder) : ''}
        shopAddress={invoiceOrder ? resolveShopAddress(invoiceOrder, locale) : ''}
        customerName={invoiceOrder?.customerName?.trim() || customer?.name || ''}
        customerPhone={formatDisplayPhone(
          invoiceOrder?.customerPhone?.trim() || customer?.phone || '',
        )}
        onClose={() => setInvoiceOrder(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  empty: { textAlign: 'center', marginTop: 24, fontSize: 16, fontWeight: '700' },
});
