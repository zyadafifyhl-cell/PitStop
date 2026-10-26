import FontAwesome from '@expo/vector-icons/FontAwesome';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRootNavigation } from 'expo-router';

import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { STORE_PRODUCTS_RELEASED } from '@/lib/features/releaseHold';
import {
  getActiveBrowseTab,
  isSharedBrowseDeepPath,
  switchPreservedTab,
} from '@/lib/navigation/preserveTabStack';

const TAB_ROUTES = new Set(['/', '/index', '/bookings', '/orders', '/favorites', '/assistant', '/shop', '/settings']);

type CustomerTab = {
  href: '/' | '/bookings' | '/orders' | '/favorites' | '/assistant' | '/settings';
  screen: 'index' | 'bookings' | 'orders' | 'favorites' | 'assistant' | 'settings';
  labelKey:
    | 'tab_home'
    | 'tab_my_bookings'
    | 'tab_my_orders'
    | 'tab_favorites'
    | 'tab_driver_network'
    | 'tab_account';
  icon: 'home' | 'list' | 'bag' | 'heart' | 'comments' | 'user';
};

const CUSTOMER_TABS: CustomerTab[] = [
  { href: '/', screen: 'index', labelKey: 'tab_home', icon: 'home' },
  { href: '/bookings', screen: 'bookings', labelKey: 'tab_my_bookings', icon: 'list' },
  { href: '/orders', screen: 'orders', labelKey: 'tab_my_orders', icon: 'bag' },
  { href: '/favorites', screen: 'favorites', labelKey: 'tab_favorites', icon: 'heart' },
  { href: '/assistant', screen: 'assistant', labelKey: 'tab_driver_network', icon: 'comments' },
  { href: '/settings', screen: 'settings', labelKey: 'tab_account', icon: 'user' },
].filter((tab) => STORE_PRODUCTS_RELEASED || tab.href !== '/orders');

export function normalizeAppPath(pathname: string): string {
  if (!pathname || pathname === '/(tabs)' || pathname === '/(tabs)/index') return '/';
  const stripped = pathname.startsWith('/(tabs)') ? pathname.slice('/(tabs)'.length) || '/' : pathname;
  if (stripped.length > 1 && stripped.endsWith('/')) return stripped.slice(0, -1);
  return stripped;
}

export function shouldShowCustomerBrowseTabBar(pathname: string, isCustomerSession: boolean): boolean {
  if (!isCustomerSession) return false;
  const path = normalizeAppPath(pathname);
  if (TAB_ROUTES.has(path)) return false;
  if (
    path === '/welcome' ||
    path.startsWith('/welcome/') ||
    path === '/admin' ||
    path.startsWith('/admin/') ||
    path === '/reset-password' ||
    path.startsWith('/reset-password/') ||
    path === '/auth-required' ||
    path.startsWith('/auth-required/') ||
    path.startsWith('/shop/')
  ) {
    return false;
  }
  return true;
}

export function focusedTabHref(pathname: string): CustomerTab['href'] {
  const path = normalizeAppPath(pathname);
  if (path === '/settings' || path.startsWith('/settings/')) return '/settings';
  if (
    path === '/assistant' ||
    path.startsWith('/assistant/') ||
    path.startsWith('/driver-network')
  ) {
    return '/assistant';
  }
  // Must check `/bookings` before falling through — `/bookings`.startsWith('/booking/') is false,
  // so without an exact match this tab was wrongly treated as Home and Home taps became no-ops.
  if (path === '/bookings' || path.startsWith('/booking/')) return '/bookings';
  if (path === '/favorites' || path.startsWith('/favorites/')) return '/favorites';
  if (path === '/orders' || path.startsWith('/orders/')) return '/orders';

  // Shop profile / book / service screens are shared on the root stack — keep the tab
  // that opened them highlighted (e.g. Favorites stays active after Open profile).
  if (isSharedBrowseDeepPath(path)) {
    const owner = getActiveBrowseTab();
    if (
      owner === '/' ||
      owner === '/bookings' ||
      owner === '/orders' ||
      owner === '/favorites' ||
      owner === '/assistant' ||
      owner === '/settings'
    ) {
      return owner;
    }
  }

  return '/';
}

function TabGlyph({ icon, color }: { icon: CustomerTab['icon']; color: string }) {
  if (icon === 'bag') return <Ionicons name="bag-handle-outline" size={20} color={color} />;
  if (icon === 'list') return <FontAwesome name="list-alt" size={20} color={color} />;
  if (icon === 'heart') return <FontAwesome name="heart" size={20} color={color} />;
  if (icon === 'comments') return <FontAwesome name="comments" size={20} color={color} />;
  if (icon === 'user') return <FontAwesome name="user" size={20} color={color} />;
  return <FontAwesome name="home" size={20} color={color} />;
}

export function CustomerBrowseTabBar({
  pathname,
  onHeight,
}: {
  pathname: string;
  onHeight?: (height: number) => void;
}) {
  const { t } = useI18n();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const rootNavigation = useRootNavigation();
  const focused = focusedTabHref(pathname);

  return (
    <View
      onLayout={(event) => onHeight?.(event.nativeEvent.layout.height)}
      style={[
        styles.dock,
        {
          backgroundColor: theme.bg,
          paddingBottom: Math.max(insets.bottom, 12),
        },
      ]}>
      <View
        style={[
          styles.pill,
          {
            backgroundColor: theme.card,
            borderColor: theme.border,
            shadowColor: theme.shadowColor,
          },
        ]}>
        {CUSTOMER_TABS.map((tab) => {
          const selected = focused === tab.href;
          const color = selected ? theme.accent : theme.textMuted;
          const label = t(tab.labelKey);
          return (
            <Pressable
              key={tab.href}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={label}
              onPress={() => {
                switchPreservedTab(rootNavigation, focused, pathname, {
                  href: tab.href,
                  screen: tab.screen,
                });
              }}
              style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}>
              <View style={[styles.iconWrap, selected && { backgroundColor: theme.accentSoft }]}>
                <TabGlyph icon={tab.icon} color={color} />
              </View>
              <Text style={[styles.label, { color }]} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 80,
    paddingHorizontal: 16,
    paddingTop: 8,
    ...(Platform.OS === 'web' ? ({ position: 'fixed' } as object) : null),
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 720,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 6,
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)' } as object) : null),
  },
  item: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  itemPressed: { opacity: 0.72 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.1,
    textAlign: 'center',
  },
});
