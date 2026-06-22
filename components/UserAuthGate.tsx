import { usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useShopAuth } from '@/context/ShopAuthContext';

const PUBLIC_PATHS = ['/welcome', '/reset-password'];

/** Require customer or shop login before using the app. */
export function UserAuthGate() {
  const pathname = usePathname();
  const router = useRouter();
  const { ready: customerReady, customer } = useCustomerAuth();
  const { ready: shopReady, shop } = useShopAuth();

  useEffect(() => {
    if (!customerReady || !shopReady) return;

    const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
    const isLoggedIn = !!customer || !!shop;

    if (shop) return;

    if (!isLoggedIn && !isPublic) {
      router.replace('/welcome');
      return;
    }

    if (customer && pathname === '/welcome') {
      router.replace('/');
    }
  }, [customerReady, shopReady, customer, shop, pathname, router]);

  return null;
}
