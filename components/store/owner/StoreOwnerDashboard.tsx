import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { OwnerSectionCard } from '@/components/owner/OwnerSectionCard';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { formatEgp } from '@/lib/booking/reporting';
import type { Shop } from '@/lib/booking/types';
import { getStoreOwnerStats, type StoreOwnerStats } from '@/lib/store/storeStatsRepository';

import { StoreInventoryManager } from './StoreInventoryManager';
import { StoreOrdersPanel } from './StoreOrdersPanel';

type Props = {
  shop: Shop;
  onRefresh?: () => void;
};

type ActivePanel = 'inventory' | 'orders' | 'profile';

export function StoreOwnerDashboard({ shop, onRefresh }: Props) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const [stats, setStats] = useState<StoreOwnerStats>({
    totalRevenue: 0,
    pendingOrders: 0,
    lowStockCount: 0,
    totalProducts: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activePanel, setActivePanel] = useState<ActivePanel>('inventory');
  const [storeOpen, setStoreOpen] = useState(shop.is_open ?? true);

  const loadStats = useCallback(async () => {
    try {
      const data = await getStoreOwnerStats();
      setStats(data);
    } catch (error) {
      console.error('[StoreOwnerDashboard] loadStats error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadStats();
    onRefresh?.();
    setRefreshing(false);
  }, [loadStats, onRefresh]);

  const handleToggleStoreOpen = useCallback(async (value: boolean) => {
    setStoreOpen(value);
    // TODO: Update shop.is_open in database
  }, []);

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.surface }]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          {t('store_owner_loading_dashboard')}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.surface }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={theme.primary}
          colors={[theme.primary]}
        />
      }
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.primary }]}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>{t('store_owner_dashboard')}</Text>
          <Text style={styles.headerSubtitle}>{shop.name_ar || shop.name_en}</Text>
        </View>
        <View style={styles.storeToggle}>
          <Text style={[styles.toggleLabel, !storeOpen && styles.toggleLabelClosed]}>
            {storeOpen ? t('store_open') : t('store_closed')}
          </Text>
          <Switch
            value={storeOpen}
            onValueChange={handleToggleStoreOpen}
            trackColor={{ false: '#767577', true: theme.success }}
            thumbColor="#fff"
          />
        </View>
      </View>

      {/* Stats Cards */}
      <View style={styles.statsGrid}>
        <OwnerSectionCard
          title={t('store_owner_total_revenue')}
          icon="dollar"
          iconColor={theme.success}
          style={styles.statCard}
        >
          <Text style={[styles.statValue, { color: theme.success }]}>
            {formatEgp(stats.totalRevenue)}
          </Text>
        </OwnerSectionCard>

        <OwnerSectionCard
          title={t('store_owner_pending_orders')}
          icon="clock-o"
          iconColor={theme.warning}
          style={styles.statCard}
        >
          <Text style={[styles.statValue, { color: theme.warning }]}>
            {stats.pendingOrders}
          </Text>
        </OwnerSectionCard>

        <OwnerSectionCard
          title={t('store_owner_low_stock')}
          icon="exclamation-triangle"
          iconColor={stats.lowStockCount > 0 ? theme.error : theme.textSecondary}
          style={styles.statCard}
        >
          <Text
            style={[
              styles.statValue,
              { color: stats.lowStockCount > 0 ? theme.error : theme.textSecondary },
            ]}
          >
            {stats.lowStockCount}
          </Text>
        </OwnerSectionCard>

        <OwnerSectionCard
          title={t('store_owner_total_products')}
          icon="cubes"
          iconColor={theme.primary}
          style={styles.statCard}
        >
          <Text style={[styles.statValue, { color: theme.primary }]}>
            {stats.totalProducts}
          </Text>
        </OwnerSectionCard>
      </View>

      {/* Tab Navigation */}
      <View style={[styles.tabs, { borderBottomColor: theme.border }]}>
        <Pressable
          style={[
            styles.tab,
            activePanel === 'inventory' && {
              borderBottomColor: theme.primary,
              borderBottomWidth: 2,
            },
          ]}
          onPress={() => setActivePanel('inventory')}
        >
          <FontAwesome
            name="cubes"
            size={18}
            color={activePanel === 'inventory' ? theme.primary : theme.textSecondary}
          />
          <Text
            style={[
              styles.tabLabel,
              {
                color: activePanel === 'inventory' ? theme.primary : theme.textSecondary,
              },
            ]}
          >
            {t('store_owner_inventory')}
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.tab,
            activePanel === 'orders' && {
              borderBottomColor: theme.primary,
              borderBottomWidth: 2,
            },
          ]}
          onPress={() => setActivePanel('orders')}
        >
          <FontAwesome
            name="shopping-bag"
            size={18}
            color={activePanel === 'orders' ? theme.primary : theme.textSecondary}
          />
          <Text
            style={[
              styles.tabLabel,
              {
                color: activePanel === 'orders' ? theme.primary : theme.textSecondary,
              },
            ]}
          >
            {t('store_owner_orders')}
          </Text>
          {stats.pendingOrders > 0 && (
            <View style={[styles.badge, { backgroundColor: theme.error }]}>
              <Text style={styles.badgeText}>{stats.pendingOrders}</Text>
            </View>
          )}
        </Pressable>

        <Pressable
          style={[
            styles.tab,
            activePanel === 'profile' && {
              borderBottomColor: theme.primary,
              borderBottomWidth: 2,
            },
          ]}
          onPress={() => setActivePanel('profile')}
        >
          <FontAwesome
            name="cog"
            size={18}
            color={activePanel === 'profile' ? theme.primary : theme.textSecondary}
          />
          <Text
            style={[
              styles.tabLabel,
              {
                color: activePanel === 'profile' ? theme.primary : theme.textSecondary,
              },
            ]}
          >
            {t('store_owner_profile')}
          </Text>
        </Pressable>
      </View>

      {/* Panel Content */}
      <View style={styles.panelContent}>
        {activePanel === 'inventory' && (
          <StoreInventoryManager shop={shop} onRefresh={loadStats} />
        )}
        {activePanel === 'orders' && <StoreOrdersPanel shop={shop} onRefresh={loadStats} />}
        {activePanel === 'profile' && (
          <OwnerSectionCard title={t('store_owner_profile')} icon="user">
            <Text style={{ color: theme.textSecondary }}>
              {t('store_owner_profile_coming_soon')}
            </Text>
          </OwnerSectionCard>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  header: {
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 4,
  },
  storeToggle: {
    alignItems: 'flex-end',
  },
  toggleLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  toggleLabelClosed: {
    color: 'rgba(255, 255, 255, 0.6)',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: 150,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    marginTop: 8,
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingHorizontal: 12,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 6,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginLeft: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  panelContent: {
    padding: 12,
  },
});
