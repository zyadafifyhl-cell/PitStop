import type { TranslationKey } from '@/lib/i18n/strings';
import type { ShopType } from '@/lib/booking/types';

export type OwnerBusinessMode = 'service' | 'store';

export type OwnerShellTabId = 'dashboard' | 'management' | 'operations' | 'profile' | 'settings';

export type OwnerNavTabConfig = {
  id: OwnerShellTabId;
  labelKey: TranslationKey;
  icon: 'dashboard' | 'shopping-bag' | 'cubes' | 'user' | 'cog' | 'calendar' | 'wrench';
};

export type OwnerDashboardConfig = {
  mode: OwnerBusinessMode;
  activityLabelKey: TranslationKey;
  catalogLabelKey: TranslationKey;
  profileLabelKey: TranslationKey;
  settingsLabelKey?: TranslationKey;
  activityMetricKey: TranslationKey;
  pendingMetricKey: TranslationKey;
  catalogMetricKey: TranslationKey;
};

export function getOwnerDashboardConfig(shopType: ShopType): OwnerDashboardConfig {
  if (shopType === 'parts' || shopType === 'accessories') {
    return {
      mode: 'store',
      activityLabelKey: 'store_owner_orders',
      catalogLabelKey: 'store_owner_inventory',
      profileLabelKey: 'owner_dashboard_profile',
      settingsLabelKey: 'owner_dashboard_settings',
      activityMetricKey: 'store_owner_total_orders',
      pendingMetricKey: 'store_owner_pending_orders',
      catalogMetricKey: 'store_owner_low_stock',
    };
  }

  return {
    mode: 'service',
    activityLabelKey: 'owner_dashboard_bookings',
    catalogLabelKey: 'owner_dashboard_services',
    profileLabelKey: 'owner_dashboard_profile_settings',
    activityMetricKey: 'owner_dashboard_today_bookings',
    pendingMetricKey: 'owner_dashboard_pending_requests',
    catalogMetricKey: 'owner_dashboard_active_services',
  };
}

/** Store owners get 5 tabs; service shops keep the combined Profile & Settings tab. */
export function getOwnerNavTabs(shopType: ShopType): OwnerNavTabConfig[] {
  const config = getOwnerDashboardConfig(shopType);
  if (config.mode === 'store') {
    return [
      { id: 'dashboard', labelKey: 'owner_dashboard_overview', icon: 'dashboard' },
      { id: 'management', labelKey: config.activityLabelKey, icon: 'shopping-bag' },
      { id: 'operations', labelKey: config.catalogLabelKey, icon: 'cubes' },
      { id: 'profile', labelKey: 'owner_dashboard_profile', icon: 'user' },
      { id: 'settings', labelKey: 'owner_dashboard_settings', icon: 'cog' },
    ];
  }

  return [
    { id: 'dashboard', labelKey: 'owner_dashboard_overview', icon: 'dashboard' },
    { id: 'management', labelKey: config.activityLabelKey, icon: 'calendar' },
    { id: 'operations', labelKey: config.catalogLabelKey, icon: 'wrench' },
    { id: 'profile', labelKey: 'owner_dashboard_profile_settings', icon: 'cog' },
  ];
}
