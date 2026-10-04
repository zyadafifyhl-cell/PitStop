import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { View } from 'react-native';
import 'react-native-reanimated';

import { AppBootstrap } from '@/components/AppBootstrap';
import { PremiumAnimatedSplash } from '@/components/PremiumAnimatedSplash';
import {
  CustomerBrowseTabBar,
  shouldShowCustomerBrowseTabBar,
} from '@/components/ui/CustomerBrowseTabBar';
import { CustomerAuthProvider, useCustomerAuth } from '@/context/CustomerAuthContext';
import { I18nProvider, useI18n } from '@/context/I18nContext';
import { ShopAuthProvider, useShopAuth } from '@/context/ShopAuthContext';
import { ShopCatalogProvider } from '@/context/ShopCatalogContext';
import { StoreCartProvider } from '@/context/StoreCartContext';
import { ThemePreferenceProvider, useThemePreference } from '@/context/ThemePreferenceContext';
import { AppDialogProvider } from '@/lib/ui/AppDialogProvider';
import { CustomConfirmProvider } from '@/lib/ui/CustomConfirmProvider';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: 'welcome',
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });
  const [showAnimatedSplash, setShowAnimatedSplash] = useState(true);

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (!loaded) return;
    SplashScreen.hideAsync().catch(() => {});
  }, [loaded]);

  return (
    <ThemePreferenceProvider>
      <RootLayoutWithTheme />
      {loaded && showAnimatedSplash ? (
        <PremiumAnimatedSplash onFinish={() => setShowAnimatedSplash(false)} />
      ) : null}
    </ThemePreferenceProvider>
  );
}

function RootStack() {
  const { t, locale } = useI18n();
  const { theme, effectivePreference } = useThemePreference();
  const pathname = usePathname();
  const { customer, isGuest } = useCustomerAuth();
  const { shop } = useShopAuth();
  const showBrowseTabBar = shouldShowCustomerBrowseTabBar(pathname, !shop && (!!customer || isGuest));
  const [browseTabBarHeight, setBrowseTabBarHeight] = useState(96);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar style={effectivePreference === 'dark' ? 'light' : 'dark'} />
      <View style={{ flex: 1, paddingBottom: showBrowseTabBar ? browseTabBarHeight : 0 }}>
      <Stack
        key={locale}
        screenOptions={{
          headerStyle: { backgroundColor: theme.bgElevated },
          headerTintColor: theme.text,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: theme.bg },
          animation: 'slide_from_right',
        }}>
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="store" options={{ headerShown: false, title: t('store_title') }} />
        <Stack.Screen name="service/[type]/index" options={{ title: t('area_pick_title') }} />
        <Stack.Screen name="service/[type]/[areaId]" options={{ title: t('shops_screen_title') }} />
        <Stack.Screen name="book/[shopId]" options={{ title: t('book_screen_title') }} />
        <Stack.Screen name="booking/[id]" options={{ title: t('order_details_title') }} />
        <Stack.Screen name="shop-profile/[shopId]" options={{ title: t('shop_profile_screen_title') }} />
        <Stack.Screen name="driver-network/[postId]" options={{ title: t('feed_post_screen_title') }} />
        <Stack.Screen name="parts-shop/[shopId]" options={{ title: t('parts_shop_screen_title') }} />
        <Stack.Screen name="nearby/[type]" options={{ title: t('nearby_title') }} />
        <Stack.Screen name="settings/vehicles" options={{ title: t('settings_vehicle_management') }} />
        <Stack.Screen name="points-marketplace" options={{ title: t('loyalty_marketplace_screen_title') }} />
        <Stack.Screen name="auth-required" options={{ title: t('guest_gate_header') }} />
        <Stack.Screen name="reset-password" options={{ title: t('customer_reset_password_title') }} />
        <Stack.Screen name="shop/wash-owner-hub" options={{ headerShown: false }} />
        <Stack.Screen name="shop/wash-reports" options={{ title: t('wash_report_title') }} />
        <Stack.Screen name="shop/store-reports" options={{ title: t('store_reports_title') }} />
        <Stack.Screen name="shop/wash-history" options={{ title: t('wash_hub_tab_history') }} />
        <Stack.Screen name="shop/merchant-settings" options={{ title: t('merchant_settings_title') }} />
        <Stack.Screen name="shop/merchant-staff" options={{ title: t('merchant_settings_staff_row') }} />
        <Stack.Screen name="shop/merchant-services" options={{ title: t('merchant_settings_services_row') }} />
        <Stack.Screen name="shop/merchant-hours" options={{ title: t('merchant_settings_hours_row') }} />
        <Stack.Screen name="shop/merchant-password" options={{ title: t('merchant_settings_change_password') }} />
        <Stack.Screen name="shop/merchant-terms" options={{ title: t('merchant_settings_terms_row') }} />
        <Stack.Screen name="shop/merchant-privacy" options={{ title: t('merchant_settings_privacy_row') }} />
        <Stack.Screen name="admin" options={{ headerShown: false }} />
      </Stack>
      </View>
      {showBrowseTabBar ? (
        <CustomerBrowseTabBar pathname={pathname} onHeight={setBrowseTabBarHeight} />
      ) : null}
    </View>
  );
}

function RootLayoutWithTheme() {
  return (
    <I18nProvider>
      <AppDialogProvider>
        <CustomConfirmProvider>
        <ShopCatalogProvider>
          <CustomerAuthProvider>
            <StoreCartProvider>
            <ShopAuthProvider>
              <AppBootstrap>
                <RootStack />
              </AppBootstrap>
            </ShopAuthProvider>
            </StoreCartProvider>
          </CustomerAuthProvider>
        </ShopCatalogProvider>
        </CustomConfirmProvider>
      </AppDialogProvider>
    </I18nProvider>
  );
}
