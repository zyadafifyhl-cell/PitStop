import { useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';

import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useShopAuth } from '@/context/ShopAuthContext';
import { resolveReturnTo } from '@/lib/auth/returnTo';

const PUBLIC_PATHS = ['/welcome', '/reset-password', '/auth-required', '/login', '/verify'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Wait for auth, hide splash once, then route to the correct entry screen (no home↔welcome flash). */
export function AppBootstrap({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useGlobalSearchParams();
  const { ready: customerReady, customer, isGuest } = useCustomerAuth();
  const { ready: shopReady, shop } = useShopAuth();
  const splashHidden = useRef(false);
  const initialRouteDone = useRef(false);

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
    const isLoggedIn = !!customer || !!shop || isGuest;

    if (shop) {
      if (pathname !== '/shop') {
        router.replace('/shop');
      }
      initialRouteDone.current = true;
      return;
    }

    if (!isLoggedIn && !isPublic) {
      router.replace('/welcome');
      initialRouteDone.current = true;
      return;
    }

    if ((customer || isGuest) && pathname === '/welcome' && !resolveReturnTo(params.returnTo)) {
      router.replace('/');
      initialRouteDone.current = true;
      return;
    }
  }, [authReady, customer, shop, isGuest, pathname, router, params.returnTo]);

  return <>{children}</>;
}
