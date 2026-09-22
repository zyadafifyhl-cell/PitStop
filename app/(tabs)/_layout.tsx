import React from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View, type ColorValue } from 'react-native';
import { Tabs } from 'expo-router';

import { CustomerNotificationsBell } from '@/components/customer/CustomerNotificationsBell';
import { FintechTabBar } from '@/components/ui/FintechTabBar';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useShopAuth } from '@/context/ShopAuthContext';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';

function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: ColorValue;
}) {
  return <FontAwesome size={20} {...props} />;
}

export default function TabLayout() {
  const { t, locale } = useI18n();
  const { customer, isGuest } = useCustomerAuth();
  const { shop } = useShopAuth();
  const theme = useAppTheme();
  const hasCustomerArea = !shop && (!!customer || isGuest);
  const customerHeaderRight = () => (customer && !isGuest && !shop ? <CustomerNotificationsBell /> : null);
  const hideTabBar = Boolean(shop && !hasCustomerArea);

  return (
    <Tabs
      key={locale}
      tabBar={(props) => (hideTabBar ? null : <FintechTabBar {...(props as any)} />)}
      screenOptions={{
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textMuted,
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
          headerShown: false,
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
        name="orders"
        options={{
          title: t('tab_my_orders'),
          tabBarIcon: ({ color }) => (
            <View style={styles.iconSlot}>
              <Ionicons name="bag-handle-outline" size={20} color={color} />
            </View>
          ),
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
          title: shop ? t('tab_settings') : t('tab_account'),
          tabBarIcon: ({ color }) => <TabBarIcon name={shop ? 'cog' : 'user'} color={color} />,
          headerRight: customerHeaderRight,
          href: shop ? '/shop/merchant-settings' : hasCustomerArea ? undefined : null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconSlot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
