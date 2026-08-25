import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { OwnerMetricsGrid, type OwnerMetric } from '@/components/owner/OwnerMetricsGrid';
import { OwnerSectionCard } from '@/components/owner/OwnerSectionCard';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { formatEgp } from '@/lib/booking/reporting';
import type { Shop, StoreOperatingStatus } from '@/lib/booking/types';
import { getStoreOwnerStats, type StoreOwnerStats } from '@/lib/store/storeStatsRepository';
import { getSupabase } from '@/lib/supabase/client';

type Props = {
  shop: Shop;
  storeStatus?: StoreOperatingStatus;
  onRefresh?: () => void;
  onNavigate?: (target: 'pending_orders' | 'active_orders' | 'low_stock' | 'reports' | 'management') => void;
  onPendingOrdersChange?: (count: number) => void;
};

const EMPTY_STATS: StoreOwnerStats = {
  totalRevenue: 0,
  totalOrders: 0,
  pendingOrders: 0,
  lowStockCount: 0,
  totalProducts: 0,
};

export function StoreOwnerDashboard({
  shop,
  storeStatus = 'open',
  onRefresh,
  onNavigate,
  onPendingOrdersChange,
}: Props) {
  const theme = useAppTheme();
  const { t, locale } = useI18n();
  const [stats, setStats] = useState<StoreOwnerStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadStats = useCallback(async () => {
    setStats(await getStoreOwnerStats(shop.id));
    setLoading(false);
  }, [shop.id]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    onPendingOrdersChange?.(stats.pendingOrders);
  }, [stats.pendingOrders, onPendingOrdersChange]);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    const channel = supabase
      .channel(`store-dashboard:${shop.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'store_orders', filter: `shop_id=eq.${shop.id}` },
        () => void loadStats(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products', filter: `shop_id=eq.${shop.id}` },
        () => void loadStats(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadStats, shop.id]);

  const metrics = useMemo<OwnerMetric[]>(
    () => [
      {
        id: 'revenue',
        label: t('store_owner_total_revenue'),
        value: formatEgp(stats.totalRevenue, locale),
        icon: 'money',
        tone: 'success',
        onPress: () => {
          if (onNavigate) onNavigate('reports');
          else router.push('/shop/store-reports');
        },
      },
      {
        id: 'orders',
        label: t('store_owner_total_orders'),
        value: stats.totalOrders,
        icon: 'shopping-bag',
        onPress: onNavigate ? () => onNavigate('active_orders') : undefined,
      },
      {
        id: 'pending',
        label: t('store_owner_pending_orders'),
        value: stats.pendingOrders,
        icon: 'clock-o',
        tone: 'warning',
        onPress: onNavigate ? () => onNavigate('pending_orders') : undefined,
      },
      {
        id: 'stock',
        label: t('store_owner_low_stock'),
        value: stats.lowStockCount,
        icon: 'exclamation-triangle',
        tone: stats.lowStockCount > 0 ? 'danger' : 'accent',
        onPress: onNavigate ? () => onNavigate('low_stock') : undefined,
      },
    ],
    [locale, onNavigate, stats, t],
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadStats();
    onRefresh?.();
    setRefreshing(false);
  }, [loadStats, onRefresh]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.accent} size="large" />
      </View>
    );
  }

  const statusLabel =
    storeStatus === 'closed'
      ? t('store_status_closed')
      : storeStatus === 'maintenance'
        ? t('store_status_maintenance')
        : t('store_status_open');

  return (
    <ScrollView
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.accent} colors={[theme.accent]} />
      }>
      <OwnerSectionCard
        title={t('owner_dashboard_overview')}
        subtitle={locale === 'ar' ? shop.nameAr || shop.name : shop.name}>
        <Pressable
          onPress={onNavigate ? () => onNavigate('management') : undefined}
          style={styles.statusRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.statusTitle, { color: theme.text }]}>{statusLabel}</Text>
            <Text style={[styles.statusHint, { color: theme.textMuted }]}>
              {t('store_owner_total_products')}: {stats.totalProducts}
            </Text>
          </View>
        </Pressable>
      </OwnerSectionCard>

      <OwnerMetricsGrid metrics={metrics} />
      <Pressable
        onPress={() => router.push('/shop/store-reports')}
        style={[styles.reportsBtn, { borderColor: theme.border, backgroundColor: theme.card }]}>
        <Text style={[styles.reportsTitle, { color: theme.text }]}>{t('store_reports_open')}</Text>
        <Text style={[styles.reportsHint, { color: theme.textMuted }]}>{t('store_reports_lead')}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loading: { minHeight: 220, alignItems: 'center', justifyContent: 'center' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 6 },
  statusTitle: { fontSize: 15, fontWeight: '900' },
  statusHint: { marginTop: 4, fontSize: 12, fontWeight: '600' },
  reportsBtn: { marginTop: 14, borderWidth: 1, borderRadius: 14, padding: 14 },
  reportsTitle: { fontSize: 14, fontWeight: '900' },
  reportsHint: { marginTop: 4, fontSize: 12, fontWeight: '600' },
});
