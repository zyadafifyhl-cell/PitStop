import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

import { OwnerSectionCard } from '@/components/owner/OwnerSectionCard';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { formatEgp } from '@/lib/booking/reporting';
import type { Shop } from '@/lib/booking/types';
import {
  listStoreOwnerOrders,
  updateStoreOrderStatus,
  type StoreOrderWithItems,
} from '@/lib/store/orderRepository';
import type { StoreOrderStatus } from '@/lib/store/types';
import { getSupabase } from '@/lib/supabase/client';
import { showCustomConfirm } from '@/lib/ui/CustomConfirmProvider';
import { orderMatchesListFilter, type StoreOrderListFilter } from '@/lib/store/ownerFilters';

type Props = {
  shop: Shop;
  onRefresh?: () => void;
  statusFilter?: StoreOrderListFilter;
  onStatusFilterChange?: (filter: StoreOrderListFilter) => void;
};

const STATUS_COLORS: Record<StoreOrderStatus, string> = {
  pending: '#FF9800',
  preparing: '#2196F3',
  ready: '#4CAF50',
  completed: '#4CAF50',
  cancelled: '#F44336',
};

const STATUS_ICONS: Record<StoreOrderStatus, React.ComponentProps<typeof FontAwesome>['name']> = {
  pending: 'clock-o',
  preparing: 'cube',
  ready: 'check-circle',
  completed: 'check-circle-o',
  cancelled: 'times-circle',
};

export function StoreOrdersPanel({ shop, onRefresh, statusFilter, onStatusFilterChange }: Props) {
  const appTheme = useAppTheme();
  const theme = {
    ...appTheme,
    primary: appTheme.accent,
    surface: appTheme.card,
    textSecondary: appTheme.textMuted,
  };
  const { t, locale } = useI18n();
  const [orders, setOrders] = useState<StoreOrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<StoreOrderWithItems | null>(null);
  const [updating, setUpdating] = useState(false);
  const [localFilter, setLocalFilter] = useState<StoreOrderListFilter>(statusFilter ?? 'all');

  useEffect(() => {
    if (statusFilter) setLocalFilter(statusFilter);
  }, [statusFilter]);

  const filter = statusFilter ?? localFilter;

  const setFilter = useCallback(
    (next: StoreOrderListFilter) => {
      setLocalFilter(next);
      onStatusFilterChange?.(next);
    },
    [onStatusFilterChange],
  );

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const items = await listStoreOwnerOrders(shop.id);
      setOrders(items);
    } catch (error) {
      console.error('[StoreOrdersPanel] loadOrders error:', error);
    } finally {
      setLoading(false);
    }
  }, [shop.id]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    const channel = supabase
      .channel(`store-orders:${shop.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'store_orders', filter: `shop_id=eq.${shop.id}` },
        () => {
          void loadOrders();
          onRefresh?.();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadOrders, onRefresh, shop.id]);

  const filteredOrders = useMemo(
    () => orders.filter((order) => orderMatchesListFilter(order.status, filter)),
    [filter, orders],
  );
  const pendingCount = useMemo(
    () => orders.filter((order) => order.status === 'pending').length,
    [orders],
  );
  const activeCount = useMemo(
    () => orders.filter((order) => orderMatchesListFilter(order.status, 'active')).length,
    [orders],
  );

  const applyStatus = useCallback(
    async (orderId: string, newStatus: StoreOrderStatus) => {
      setUpdating(true);
      try {
        const success = await updateStoreOrderStatus(orderId, newStatus);
        if (success) {
          await loadOrders();
          onRefresh?.();
          setSelectedOrder(null);
        } else {
          Alert.alert(t('store_owner_status_update_failed'), t('store_owner_status_update_failed'));
        }
      } catch (error) {
        console.error('[StoreOrdersPanel] applyStatus error:', error);
        Alert.alert(t('store_owner_status_update_failed'), t('store_owner_status_update_failed'));
      } finally {
        setUpdating(false);
      }
    },
    [loadOrders, onRefresh, t],
  );

  const requestStatusChange = useCallback(
    (orderId: string, newStatus: StoreOrderStatus, mode: 'normal' | 'cancel' | 'void' = 'normal') => {
      if (mode === 'normal') {
        void applyStatus(orderId, newStatus);
        return;
      }
      showCustomConfirm({
        title: t(mode === 'void' ? 'store_order_void_title' : 'store_order_cancel_title'),
        message: t(mode === 'void' ? 'store_order_void_body' : 'store_order_cancel_body'),
        confirmLabel: t(mode === 'void' ? 'store_order_action_void' : 'store_order_action_cancel'),
        cancelLabel: t('store_order_keep'),
        destructive: true,
        onConfirm: () => applyStatus(orderId, 'cancelled'),
      });
    },
    [applyStatus, t],
  );

  const renderStatusActions = useCallback(
    (order: StoreOrderWithItems, compact = false) => {
      if (order.status === 'cancelled') return null;

      const secondary = {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: STATUS_COLORS.preparing,
      } as const;

      return (
        <View style={styles.statusActions}>
          {compact ? null : (
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              {t('store_owner_update_status')}
            </Text>
          )}
          <View style={[styles.statusButtons, updating ? { opacity: 0.55 } : null]}>
            {order.status === 'pending' ? (
              <>
                <Pressable
                  style={[styles.statusButton, secondary]}
                  onPress={() => requestStatusChange(order.id, 'preparing')}
                  disabled={updating}>
                  <Text style={[styles.statusButtonText, { color: STATUS_COLORS.preparing }]}>
                    {t('store_order_action_processing')}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.statusButton, { backgroundColor: STATUS_COLORS.ready }]}
                  onPress={() => requestStatusChange(order.id, 'ready')}
                  disabled={updating}>
                  <Text style={styles.statusButtonText}>{t('store_order_action_ready')}</Text>
                </Pressable>
                <Pressable
                  style={[styles.statusButton, styles.statusButtonFull, { backgroundColor: STATUS_COLORS.cancelled }]}
                  onPress={() => requestStatusChange(order.id, 'cancelled', 'cancel')}
                  disabled={updating}>
                  <Text style={styles.statusButtonText}>{t('store_order_action_cancel')}</Text>
                </Pressable>
              </>
            ) : null}

            {order.status === 'preparing' ? (
              <>
                <Pressable
                  style={[styles.statusButton, { backgroundColor: STATUS_COLORS.ready }]}
                  onPress={() => requestStatusChange(order.id, 'ready')}
                  disabled={updating}>
                  <Text style={styles.statusButtonText}>{t('store_order_action_ready')}</Text>
                </Pressable>
                <Pressable
                  style={[styles.statusButton, { backgroundColor: STATUS_COLORS.cancelled }]}
                  onPress={() => requestStatusChange(order.id, 'cancelled', 'cancel')}
                  disabled={updating}>
                  <Text style={styles.statusButtonText}>{t('store_order_action_cancel')}</Text>
                </Pressable>
              </>
            ) : null}

            {order.status === 'ready' ? (
              <>
                <Pressable
                  style={[styles.statusButton, { backgroundColor: STATUS_COLORS.completed }]}
                  onPress={() => requestStatusChange(order.id, 'completed')}
                  disabled={updating}>
                  <Text style={styles.statusButtonText}>{t('store_order_action_confirm_delivery')}</Text>
                </Pressable>
                <Pressable
                  style={[styles.statusButton, { backgroundColor: STATUS_COLORS.cancelled }]}
                  onPress={() => requestStatusChange(order.id, 'cancelled', 'cancel')}
                  disabled={updating}>
                  <Text style={styles.statusButtonText}>{t('store_order_action_cancel')}</Text>
                </Pressable>
              </>
            ) : null}

            {order.status === 'completed' ? (
              <Pressable
                style={[styles.statusButton, styles.statusButtonFull, styles.statusButtonVoid]}
                onPress={() => requestStatusChange(order.id, 'cancelled', 'void')}
                disabled={updating}>
                <Text style={[styles.statusButtonText, { color: STATUS_COLORS.cancelled }]}>
                  {t('store_order_action_void')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      );
    },
    [requestStatusChange, t, theme.text, updating],
  );

  const renderOrderCard = useCallback(
    (order: StoreOrderWithItems) => {
      const statusColor = STATUS_COLORS[order.status];
      const statusIcon = STATUS_ICONS[order.status];

      return (
        <View
          key={order.id}
          style={[
            styles.orderCard,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
          ]}>
          <Pressable onPress={() => setSelectedOrder(order)}>
            <View style={styles.orderHeader}>
              <View style={styles.orderIdRow}>
                <Text style={[styles.orderId, { color: theme.text }]}>
                  #{order.id.slice(0, 8)}
                </Text>
                <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
                  <FontAwesome name={statusIcon} size={12} color="#fff" />
                  <Text style={styles.statusText}>
                    {t(`store_order_status_${order.status}`)}
                  </Text>
                </View>
              </View>
              <Text style={[styles.orderDate, { color: theme.textSecondary }]}>
                {new Date(order.createdAt).toLocaleDateString()}
              </Text>
            </View>

            <View style={styles.orderBody}>
              <View style={styles.orderInfo}>
                <FontAwesome name="shopping-bag" size={14} color={theme.textSecondary} />
                <Text style={[styles.orderInfoText, { color: theme.textSecondary }]}>
                  {order.items.length} {t('store_owner_items')}
                </Text>
              </View>
              <View style={styles.orderInfo}>
                <FontAwesome
                  name={order.fulfillmentMethod === 'cod' ? 'money' : 'map-marker'}
                  size={14}
                  color={theme.textSecondary}
                />
                <Text style={[styles.orderInfoText, { color: theme.textSecondary }]}>
                  {t(`store_fulfillment_${order.fulfillmentMethod}`)}
                </Text>
              </View>
            </View>

            <View style={styles.orderFooter}>
              <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>
                {t('store_owner_total')}:
              </Text>
              <Text style={[styles.totalAmount, { color: theme.primary }]}>
                {formatEgp(order.totalPrice, locale)}
              </Text>
            </View>
          </Pressable>
          {renderStatusActions(order, true)}
        </View>
      );
    },
    [locale, renderStatusActions, theme, t],
  );

  if (loading) {
    return (
      <OwnerSectionCard title={t('store_owner_orders')} icon="shopping-bag">
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </OwnerSectionCard>
    );
  }

  const filterPills = (
    <View style={styles.filterRow}>
      {(
        [
          { id: 'pending' as const, label: t('store_orders_filter_pending'), count: pendingCount },
          { id: 'active' as const, label: t('store_orders_filter_active'), count: activeCount },
          { id: 'all' as const, label: t('store_orders_filter_all'), count: orders.length },
        ]
      ).map((pill) => {
        const active = filter === pill.id;
        return (
          <Pressable
            key={pill.id}
            onPress={() => setFilter(pill.id)}
            style={[
              styles.filterPill,
              {
                backgroundColor: active ? theme.primary : theme.bgElevated,
                borderColor: active ? theme.primary : theme.border,
              },
            ]}>
            <Text style={[styles.filterPillText, { color: active ? theme.onAccent : theme.text }]}>
              {pill.label} ({pill.count})
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  if (orders.length === 0) {
    return (
      <OwnerSectionCard title={t('store_owner_orders')} icon="shopping-bag">
        {filterPills}
        <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>
          {t('store_owner_no_orders')}
        </Text>
      </OwnerSectionCard>
    );
  }

  return (
    <>
      <OwnerSectionCard title={t('store_owner_orders')} icon="shopping-bag">
        {filterPills}
        {filteredOrders.length === 0 ? (
          <Text style={{ color: theme.textSecondary, textAlign: 'center', paddingVertical: 18 }}>
            {t('store_owner_no_orders_filter')}
          </Text>
        ) : (
          filteredOrders.map(renderOrderCard)
        )}
      </OwnerSectionCard>

      {/* Order Details Modal */}
      <Modal
        visible={selectedOrder !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedOrder(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {t('store_owner_order_details')}
              </Text>
              <Pressable onPress={() => setSelectedOrder(null)}>
                <FontAwesome name="times" size={24} color={theme.textSecondary} />
              </Pressable>
            </View>

            {selectedOrder && (
              <ScrollView style={styles.modalBody}>
                {/* Customer Info */}
                <View style={[styles.section, { borderBottomColor: theme.border }]}>
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>
                    {t('store_owner_customer_info')}
                  </Text>
                  {selectedOrder.customerName && (
                    <Text style={[styles.infoText, { color: theme.textSecondary }]}>
                      {selectedOrder.customerName}
                    </Text>
                  )}
                  {selectedOrder.customerPhone && (
                    <Text style={[styles.infoText, { color: theme.textSecondary }]}>
                      {selectedOrder.customerPhone}
                    </Text>
                  )}
                  {selectedOrder.deliveryAddress && (
                    <Text style={[styles.infoText, { color: theme.textSecondary }]}>
                      {selectedOrder.deliveryAddress}
                    </Text>
                  )}
                </View>

                {/* Items */}
                <View style={[styles.section, { borderBottomColor: theme.border }]}>
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>
                    {t('store_owner_items')}
                  </Text>
                  {selectedOrder.items.map((item) => (
                    <View key={item.id} style={styles.itemRow}>
                      <Text style={[styles.itemName, { color: theme.text }]}>
                        {item.productName} x{item.quantity}
                      </Text>
                      <Text style={[styles.itemPrice, { color: theme.textSecondary }]}>
                        {formatEgp(item.lineTotal, locale)}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Total */}
                <View style={[styles.section, { borderBottomColor: theme.border }]}>
                  <View style={styles.totalRow}>
                    <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>
                      {t('store_owner_subtotal')}:
                    </Text>
                    <Text style={[styles.totalAmount, { color: theme.text }]}>
                      {formatEgp(selectedOrder.subtotal, locale)}
                    </Text>
                  </View>
                  {selectedOrder.deliveryFee > 0 && (
                    <View style={styles.totalRow}>
                      <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>
                        {t('store_owner_delivery_fee')}:
                      </Text>
                      <Text style={[styles.totalAmount, { color: theme.text }]}>
                        {formatEgp(selectedOrder.deliveryFee, locale)}
                      </Text>
                    </View>
                  )}
                  <View style={styles.totalRow}>
                    <Text style={[styles.totalLabel, { color: theme.text, fontWeight: '700' }]}>
                      {t('store_owner_total')}:
                    </Text>
                    <Text style={[styles.totalAmount, { color: theme.primary, fontWeight: '700' }]}>
                      {formatEgp(selectedOrder.totalPrice, locale)}
                    </Text>
                  </View>
                </View>

                {renderStatusActions(selectedOrder)}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  centered: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  filterPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  orderCard: {
    marginBottom: 12,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  orderIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orderId: {
    fontSize: 14,
    fontWeight: '700',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  orderDate: {
    fontSize: 12,
  },
  orderBody: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 10,
  },
  orderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  orderInfoText: {
    fontSize: 12,
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  totalLabel: {
    fontSize: 13,
  },
  totalAmount: {
    fontSize: 16,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    maxHeight: '80%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalBody: {
    flex: 1,
  },
  section: {
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 13,
    marginBottom: 4,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  itemName: {
    fontSize: 13,
    flex: 1,
  },
  itemPrice: {
    fontSize: 13,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  statusActions: {
    paddingTop: 12,
  },
  statusButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  statusButton: {
    flex: 1,
    minWidth: 120,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  statusButtonFull: {
    flexBasis: '100%',
    minWidth: '100%',
  },
  statusButtonVoid: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#F44336',
  },
  statusButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
});
