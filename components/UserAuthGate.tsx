import { useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useShopAuth } from '@/context/ShopAuthContext';
import { resolveReturnTo } from '@/lib/auth/returnTo';

const PUBLIC_PATHS = ['/welcome', '/reset-password', '/auth-required'];

/** Require customer or shop login before using the app. */
export function UserAuthGate() {
  const pathname = usePathname();
  const router = useRouter();
  const params = useGlobalSearchParams();
  const { ready: customerReady, customer, isGuest } = useCustomerAuth();
  const { ready: shopReady, shop } = useShopAuth();

  useEffect(() => {
    if (!customerReady || !shopReady) return;

    const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
    const isLoggedIn = !!customer || !!shop || isGuest;

    if (shop) return;

    if (!isLoggedIn && !isPublic) {
      router.replace('/welcome');
      return;
    }

    if (customer && pathname === '/welcome' && !resolveReturnTo(params.returnTo)) {
      router.replace('/');
    }
  }, [customerReady, shopReady, customer, shop, isGuest, pathname, router, params.returnTo]);

  return null;
}
