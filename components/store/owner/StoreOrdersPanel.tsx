import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useCallback, useEffect, useState } from 'react';
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

type Props = {
  shop: Shop;
  onRefresh?: () => void;
};

const STATUS_COLORS: Record<StoreOrderStatus, string> = {
  pending: '#FF9800',
  preparing: '#2196F3',
  ready: '#4CAF50',
  completed: '#4CAF50',
  cancelled: '#F44336',
};

const STATUS_ICONS: Record<StoreOrderStatus, any> = {
  pending: 'clock-o',
  preparing: 'refresh',
  ready: 'check-circle',
  completed: 'check-circle-o',
  cancelled: 'times-circle',
};

export function StoreOrdersPanel({ shop, onRefresh }: Props) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const [orders, setOrders] = useState<StoreOrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<StoreOrderWithItems | null>(null);
  const [updating, setUpdating] = useState(false);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const items = await listStoreOwnerOrders();
      setOrders(items);
    } catch (error) {
      console.error('[StoreOrdersPanel] loadOrders error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const handleUpdateStatus = useCallback(
    async (orderId: string, newStatus: StoreOrderStatus) => {
      setUpdating(true);
      try {
        const success = await updateStoreOrderStatus(orderId, newStatus);
        if (success) {
          await loadOrders();
          onRefresh?.();
          setSelectedOrder(null);
          Alert.alert(t('success'), t('store_owner_status_updated'));
        } else {
          Alert.alert(t('error'), t('store_owner_status_update_failed'));
        }
      } catch (error) {
        console.error('[StoreOrdersPanel] handleUpdateStatus error:', error);
        Alert.alert(t('error'), t('store_owner_status_update_failed'));
      } finally {
        setUpdating(false);
      }
    },
    [loadOrders, onRefresh, t],
  );

  const renderOrderCard = useCallback(
    (order: StoreOrderWithItems) => {
      const statusColor = STATUS_COLORS[order.status];
      const statusIcon = STATUS_ICONS[order.status];

      return (
        <Pressable
          key={order.id}
          style={[
            styles.orderCard,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
          ]}
          onPress={() => setSelectedOrder(order)}
        >
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
              {formatEgp(order.totalPrice)}
            </Text>
          </View>
        </Pressable>
      );
    },
    [theme, t],
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

  if (orders.length === 0) {
    return (
      <OwnerSectionCard title={t('store_owner_orders')} icon="shopping-bag">
        <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>
          {t('store_owner_no_orders')}
        </Text>
      </OwnerSectionCard>
    );
  }

  return (
    <>
      <OwnerSectionCard title={t('store_owner_orders')} icon="shopping-bag">
        {orders.map(renderOrderCard)}
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
                        {formatEgp(item.lineTotal)}
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
                      {formatEgp(selectedOrder.subtotal)}
                    </Text>
                  </View>
                  {selectedOrder.deliveryFee > 0 && (
                    <View style={styles.totalRow}>
                      <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>
                        {t('store_owner_delivery_fee')}:
                      </Text>
                      <Text style={[styles.totalAmount, { color: theme.text }]}>
                        {formatEgp(selectedOrder.deliveryFee)}
                      </Text>
                    </View>
                  )}
                  <View style={styles.totalRow}>
                    <Text style={[styles.totalLabel, { color: theme.text, fontWeight: '700' }]}>
                      {t('store_owner_total')}:
                    </Text>
                    <Text style={[styles.totalAmount, { color: theme.primary, fontWeight: '700' }]}>
                      {formatEgp(selectedOrder.totalPrice)}
                    </Text>
                  </View>
                </View>

                {/* Status Actions */}
                {selectedOrder.status !== 'completed' &&
                  selectedOrder.status !== 'cancelled' && (
                    <View style={styles.statusActions}>
                      <Text style={[styles.sectionTitle, { color: theme.text }]}>
                        {t('store_owner_update_status')}
                      </Text>
                      <View style={styles.statusButtons}>
                        {selectedOrder.status === 'pending' && (
                          <>
                            <Pressable
                              style={[
                                styles.statusButton,
                                { backgroundColor: STATUS_COLORS.preparing },
                              ]}
                              onPress={() =>
                                handleUpdateStatus(selectedOrder.id, 'preparing')
                              }
                              disabled={updating}
                            >
                              <Text style={styles.statusButtonText}>
                                {t('store_order_status_preparing')}
                              </Text>
                            </Pressable>
                            <Pressable
                              style={[
                                styles.statusButton,
                                { backgroundColor: STATUS_COLORS.cancelled },
                              ]}
                              onPress={() =>
                                handleUpdateStatus(selectedOrder.id, 'cancelled')
                              }
                              disabled={updating}
                            >
                              <Text style={styles.statusButtonText}>
                                {t('store_order_status_cancelled')}
                              </Text>
                            </Pressable>
                          </>
                        )}
                        {selectedOrder.status === 'preparing' && (
                          <Pressable
                            style={[
                              styles.statusButton,
                              { backgroundColor: STATUS_COLORS.ready },
                            ]}
                            onPress={() =>
                              handleUpdateStatus(selectedOrder.id, 'ready')
                            }
                            disabled={updating}
                          >
                            <Text style={styles.statusButtonText}>
                              {t('store_order_status_ready')}
                            </Text>
                          </Pressable>
                        )}
                        {selectedOrder.status === 'ready' && (
                          <Pressable
                            style={[
                              styles.statusButton,
                              { backgroundColor: STATUS_COLORS.completed },
                            ]}
                            onPress={() =>
                              handleUpdateStatus(selectedOrder.id, 'completed')
                            }
                            disabled={updating}
                          >
                            <Text style={styles.statusButtonText}>
                              {t('store_order_status_completed')}
                            </Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  )}
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
    paddingTop: 14,
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
    borderRadius: 8,
    alignItems: 'center',
  },
  statusButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
