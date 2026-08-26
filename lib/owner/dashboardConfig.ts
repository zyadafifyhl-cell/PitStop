import type { TranslationKey } from '@/lib/i18n/strings';
import type { ShopType } from '@/lib/booking/types';

export type OwnerBusinessMode = 'service' | 'store';

export type OwnerShellTabId = 'dashboard' | 'management' | 'operations' | 'profile' | 'settings';

export type OwnerNavIconId =
  | 'overview'
  | 'management'
  | 'management-store'
  | 'catalog-service'
  | 'catalog-store'
  | 'profile'
  | 'settings';

export type OwnerNavTabConfig = {
  id: OwnerShellTabId;
  labelKey: TranslationKey;
  icon: OwnerNavIconId;
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
    profileLabelKey: 'owner_dashboard_profile',
    settingsLabelKey: 'owner_dashboard_settings',
    activityMetricKey: 'owner_dashboard_today_bookings',
    pendingMetricKey: 'owner_dashboard_pending_requests',
    catalogMetricKey: 'owner_dashboard_active_services',
  };
}

/** Every merchant type uses the same 5-tab shell; labels/icons change by business mode. */
export function getOwnerNavTabs(shopType: ShopType): OwnerNavTabConfig[] {
  const config = getOwnerDashboardConfig(shopType);
  const isStore = config.mode === 'store';
  return [
    { id: 'dashboard', labelKey: 'owner_dashboard_overview', icon: 'overview' },
    {
      id: 'management',
      labelKey: isStore ? config.activityLabelKey : 'owner_dashboard_management',
      icon: isStore ? 'management-store' : 'management',
    },
    {
      id: 'operations',
      labelKey: config.catalogLabelKey,
      icon: isStore ? 'catalog-store' : 'catalog-service',
    },
    { id: 'profile', labelKey: 'owner_dashboard_profile', icon: 'profile' },
    { id: 'settings', labelKey: 'owner_dashboard_settings', icon: 'settings' },
  ];
}
