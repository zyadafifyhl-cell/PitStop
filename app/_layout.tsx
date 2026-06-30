import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import 'react-native-reanimated';

import { AppBootstrap } from '@/components/AppBootstrap';
import { AuthGate } from '@/components/AuthGate';
import { AuthProvider } from '@/context/AuthContext';
import { I18nProvider, useI18n } from '@/context/I18nContext';
import { ShopAuthProvider } from '@/context/ShopAuthContext';
import { ShopCatalogProvider } from '@/context/ShopCatalogContext';
import { CustomerAuthProvider } from '@/context/CustomerAuthContext';
import { ThemePreferenceProvider, useThemePreference } from '@/context/ThemePreferenceContext';

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

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  if (!loaded) return null;

  return <RootLayoutNav />;
}

function RootStack() {
  const { t, locale } = useI18n();
  const { theme } = useThemePreference();

  return (
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
      <Stack.Screen name="service/[type]/index" options={{ title: t('area_pick_title') }} />
      <Stack.Screen name="service/[type]/[areaId]" options={{ title: t('shops_screen_title') }} />
      <Stack.Screen name="book/[shopId]" options={{ title: t('book_screen_title') }} />
      <Stack.Screen name="shop-profile/[shopId]" options={{ title: t('shop_profile_screen_title') }} />
      <Stack.Screen name="driver-network/[postId]" options={{ title: t('feed_post_screen_title') }} />
      <Stack.Screen name="parts-shop/[shopId]" options={{ title: t('parts_shop_screen_title') }} />
      <Stack.Screen name="nearby/[type]" options={{ title: t('nearby_title') }} />
      <Stack.Screen name="settings/vehicles" options={{ title: t('settings_vehicle_management') }} />
      <Stack.Screen name="points-marketplace" options={{ title: t('loyalty_marketplace_screen_title') }} />
      <Stack.Screen name="auth-required" options={{ title: t('guest_gate_header') }} />
      <Stack.Screen name="reset-password" options={{ title: t('customer_reset_password_title') }} />
      <Stack.Screen name="login" options={{ title: t('auth_login_title') }} />
      <Stack.Screen name="verify" options={{ title: t('auth_verify_title') }} />
      <Stack.Screen name="shop/wash-notifications" options={{ headerShown: false }} />
      <Stack.Screen name="shop/wash-owner-hub" options={{ headerShown: false }} />
      <Stack.Screen name="shop/merchant-settings" options={{ title: t('merchant_settings_title') }} />
      <Stack.Screen name="shop/merchant-staff" options={{ title: t('merchant_settings_staff_row') }} />
      <Stack.Screen name="shop/merchant-services" options={{ title: t('merchant_settings_services_row') }} />
      <Stack.Screen name="shop/merchant-hours" options={{ title: t('merchant_settings_hours_row') }} />
      <Stack.Screen name="shop/merchant-password" options={{ title: t('merchant_settings_change_password') }} />
      <Stack.Screen name="admin" options={{ headerShown: false }} />
    </Stack>
  );
}

function RootLayoutNav() {
  return (
    <ThemePreferenceProvider>
      <RootLayoutWithTheme />
    </ThemePreferenceProvider>
  );
}

function RootLayoutWithTheme() {
  const { effectivePreference, theme } = useThemePreference();
  const base = effectivePreference === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      background: theme.bg,
      card: theme.bgElevated,
      text: theme.text,
      border: theme.border,
      primary: theme.accent,
    },
  };

  return (
    <ThemeProvider value={navTheme}>
      <I18nProvider>
        <ShopCatalogProvider>
          <CustomerAuthProvider>
            <AuthProvider>
              <ShopAuthProvider>
                <AppBootstrap>
                  <AuthGate />
                  <RootStack />
                </AppBootstrap>
              </ShopAuthProvider>
            </AuthProvider>
          </CustomerAuthProvider>
        </ShopCatalogProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
