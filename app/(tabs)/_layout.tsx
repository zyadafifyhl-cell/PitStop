import React from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Platform, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';

import { CustomerNotificationsBell } from '@/components/customer/CustomerNotificationsBell';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useShopAuth } from '@/context/ShopAuthContext';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';

function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={22} style={{ marginBottom: -2 }} {...props} />;
}

export default function TabLayout() {
  const { t, locale } = useI18n();
  const { customer, isGuest } = useCustomerAuth();
  const { shop } = useShopAuth();
  const theme = useAppTheme();
  const hasCustomerArea = !shop && (!!customer || isGuest);
  const customerHeaderRight = () => (customer && !isGuest && !shop ? <CustomerNotificationsBell /> : null);

  return (
    <Tabs
      key={locale}
      screenOptions={{
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textDim,
        tabBarStyle: {
          backgroundColor: theme.card,
          borderTopColor: theme.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          height: Platform.OS === 'ios' ? 88 : 68,
          paddingTop: 8,
          paddingBottom: Platform.OS === 'ios' ? 24 : 10,
          display: shop && !hasCustomerArea ? 'none' : 'flex',
          ...Platform.select({
            ios: {
              shadowColor: '#000',
              shadowOpacity: 0.25,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: -4 },
            },
            android: { elevation: 12 },
            default: {},
          }),
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        headerStyle: {
          backgroundColor: theme.bg,
          borderBottomColor: theme.border,
          borderBottomWidth: StyleSheet.hairlineWidth,
        },
        headerTintColor: theme.text,
        headerTitleStyle: { fontWeight: '700' },
        sceneStyle: { backgroundColor: theme.bg },
        headerShown: useClientOnlyValue(false, true),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('tab_home'),
          tabBarIcon: ({ color }) => <TabBarIcon name="home" color={color} />,
          headerRight: customerHeaderRight,
          href: hasCustomerArea || !shop ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: t('tab_my_bookings'),
          tabBarIcon: ({ color }) => <TabBarIcon name="list-alt" color={color} />,
          headerRight: customerHeaderRight,
          href: hasCustomerArea || !shop ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: t('tab_favorites'),
          tabBarIcon: ({ color }) => <TabBarIcon name="heart" color={color} />,
          headerRight: customerHeaderRight,
          href: hasCustomerArea ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="assistant"
        options={{
          title: t('tab_driver_network'),
          tabBarIcon: ({ color }) => <TabBarIcon name="comments" color={color} />,
          headerShown: false,
          href: hasCustomerArea ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="shop"
        options={{
          title: t('tab_shop'),
          tabBarIcon: ({ color }) => <TabBarIcon name="briefcase" color={color} />,
          href: shop ? undefined : hasCustomerArea ? null : undefined,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tab_settings'),
          tabBarIcon: ({ color }) => <TabBarIcon name="cog" color={color} />,
          headerRight: customerHeaderRight,
          href: shop ? '/shop/merchant-settings' : hasCustomerArea ? undefined : null,
        }}
      />
      <Tabs.Screen name="catalog" options={{ href: null }} />
      <Tabs.Screen name="alerts" options={{ href: null }} />
    </Tabs>
  );
}
