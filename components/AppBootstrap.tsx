import { useGlobalSearchParams, usePathname, useRouter, type Href } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';

import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useShopAuth } from '@/context/ShopAuthContext';
import { resolveReturnTo } from '@/lib/auth/returnTo';

const PUBLIC_PATHS = ['/welcome', '/reset-password', '/auth-required', '/login', '/verify'];

function readRouteParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isWelcomeAuthIntent(focus: string | undefined): boolean {
  return focus === 'login' || focus === 'register' || focus === 'owner';
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Wait for auth, hide splash once, then route to the correct entry screen (no home↔welcome flash). */
export function AppBootstrap({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useGlobalSearchParams();
  const { ready: customerReady, customer, isGuest, hasSession, busy: customerBusy } = useCustomerAuth();
  const { ready: shopReady, shop, staff, isAdmin, isPendingOwner, busy: shopBusy } = useShopAuth();
  const splashHidden = useRef(false);

  const authReady = customerReady && shopReady;

  useEffect(() => {
    if (!authReady) return;
    if (!splashHidden.current) {
      splashHidden.current = true;
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [authReady]);

  useEffect(() => {
    if (!authReady) return;

    const isPublic = isPublicPath(pathname);
    const isLoggedIn = !!customer || !!shop || isGuest || !!staff;
    const authPending =
      customerBusy || shopBusy || (hasSession && !customer && !shop && !staff);

    if (isAdmin) {
      const onAdminArea = pathname === '/admin' || pathname.startsWith('/admin/');
      if (!onAdminArea) {
        router.replace('/admin' as Href);
      }
      return;
    }

    if (isPendingOwner) {
      if (pathname !== '/welcome' && !isPublic) {
        router.replace('/welcome?focus=owner&pending=1');
      }
      return;
    }

    if (shop) {
      const onShopArea = pathname === '/shop' || pathname.startsWith('/shop/');
      if (!onShopArea) {
        router.replace('/shop');
      }
      return;
    }

    if (!isLoggedIn && !isPublic && !authPending) {
      router.replace('/welcome');
      return;
    }

    if ((customer || isGuest) && pathname === '/welcome') {
      const focus = readRouteParam(params.focus);
      if (isGuest && isWelcomeAuthIntent(focus)) return;

      const destination = resolveReturnTo(params.returnTo) ?? '/';
      router.replace(destination);
    }
  }, [
    authReady,
    customer,
    shop,
    staff,
    isGuest,
    isAdmin,
    isPendingOwner,
    hasSession,
    customerBusy,
    shopBusy,
    pathname,
    router,
    params.returnTo,
    params.focus,
  ]);

  return <>{children}</>;
}
