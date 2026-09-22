import React from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Platform, StyleSheet, View, type ColorValue } from 'react-native';
import { Tabs } from 'expo-router';

import { CustomerNotificationsBell } from '@/components/customer/CustomerNotificationsBell';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useShopAuth } from '@/context/ShopAuthContext';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';

function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: ColorValue;
  focused: boolean;
}) {
  const { focused, ...iconProps } = props;
  return (
    <View style={styles.tabIconFrame}>
      <FontAwesome size={22} {...iconProps} />
      {focused ? <View style={styles.activeDot} /> : null}
    </View>
  );
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
        tabBarActiveTintColor: '#3B82F6',
        tabBarInactiveTintColor: '#64748B',
        tabBarStyle: {
          backgroundColor: theme.bgElevated,
          borderTopColor: 'rgba(255, 255, 255, 0.06)',
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 88 : 68,
          paddingTop: 8,
          paddingBottom: Platform.OS === 'ios' ? 24 : 10,
          display: shop && !hasCustomerArea ? 'none' : 'flex',
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
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
          tabBarIcon: ({ color, focused }) => <TabBarIcon name="home" color={color} focused={focused} />,
          headerShown: false,
          href: hasCustomerArea || !shop ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: t('tab_my_bookings'),
          tabBarIcon: ({ color, focused }) => <TabBarIcon name="list-alt" color={color} focused={focused} />,
          headerRight: customerHeaderRight,
          href: hasCustomerArea || !shop ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: t('tab_my_orders'),
          tabBarIcon: ({ color, focused }) => (
            <View style={styles.tabIconFrame}>
              <Ionicons name="bag-handle-outline" size={22} color={color} />
              {focused ? <View style={styles.activeDot} /> : null}
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
          tabBarIcon: ({ color, focused }) => <TabBarIcon name="heart" color={color} focused={focused} />,
          headerRight: customerHeaderRight,
          href: hasCustomerArea ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="assistant"
        options={{
          title: t('tab_driver_network'),
          tabBarIcon: ({ color, focused }) => <TabBarIcon name="comments" color={color} focused={focused} />,
          headerShown: false,
          href: hasCustomerArea ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="shop"
        options={{
          title: t('tab_shop'),
          tabBarIcon: ({ color, focused }) => <TabBarIcon name="briefcase" color={color} focused={focused} />,
          href: shop ? undefined : hasCustomerArea ? null : undefined,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: shop ? t('tab_settings') : t('tab_account'),
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={shop ? 'cog' : 'user'} color={color} focused={focused} />
          ),
          headerRight: customerHeaderRight,
          href: shop ? '/shop/merchant-settings' : hasCustomerArea ? undefined : null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabIconFrame: {
    minWidth: 28,
    height: 30,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 4,
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#3B82F6',
  },
});
