import * as Linking from 'expo-linking';
import { useGlobalSearchParams, usePathname, useRouter, type Href } from 'expo-router';
import { useEffect, useLayoutEffect, useState } from 'react';

import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useShopAuth } from '@/context/ShopAuthContext';
import { resolveReturnTo } from '@/lib/auth/returnTo';
import { parsePitstopDeepLink } from '@/lib/linking/share';

const PUBLIC_PATHS = ['/welcome', '/reset-password', '/auth-required'];

function readRouteParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isWelcomeAuthIntent(focus: string | undefined): boolean {
  return focus === 'login' || focus === 'register' || focus === 'owner';
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Wait for auth, route to the correct entry screen, then mount navigation (no guest/home flash). */
export function AppBootstrap({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useGlobalSearchParams();
  const { ready: customerReady, customer, isGuest, hasSession, busy: customerBusy } = useCustomerAuth();
  const { ready: shopReady, shop, staff, isAdmin, isPendingOwner, busy: shopBusy } = useShopAuth();
  const [entryReady, setEntryReady] = useState(false);

  const authReady = customerReady && shopReady;

  useEffect(() => {
    function openDeepLink(url: string) {
      const path = parsePitstopDeepLink(url);
      if (path) router.push(path as Href);
    }

    Linking.getInitialURL()
      .then((url) => {
        if (url) openDeepLink(url);
      })
      .catch(() => {});

    const subscription = Linking.addEventListener('url', ({ url }) => openDeepLink(url));
    return () => subscription.remove();
  }, [router]);

  useLayoutEffect(() => {
    if (!authReady) {
      setEntryReady(false);
      return;
    }

    const isPublic = isPublicPath(pathname);
    const isLoggedIn = !!customer || !!shop || isGuest || !!staff;
    const authPending =
      customerBusy || shopBusy || (hasSession && !customer && !shop && !staff);

    if (isAdmin) {
      const onAdminArea = pathname === '/admin' || pathname.startsWith('/admin/');
      if (!onAdminArea) {
        router.replace('/admin' as Href);
      }
      setEntryReady(true);
      return;
    }

    if (isPendingOwner) {
      if (pathname !== '/welcome' && !isPublic) {
        router.replace('/welcome?focus=owner&pending=1');
      }
      setEntryReady(true);
      return;
    }

    if (shop) {
      const onShopArea = pathname === '/shop' || pathname.startsWith('/shop/');
      if (!onShopArea) {
        router.replace('/shop');
      }
      setEntryReady(true);
      return;
    }

    if (authPending && !isLoggedIn) {
      setEntryReady(false);
      return;
    }

    if (!isLoggedIn && !isPublic && !authPending) {
      router.replace('/welcome?focus=login');
      setEntryReady(true);
      return;
    }

    if ((customer || isGuest) && pathname === '/welcome') {
      const focus = readRouteParam(params.focus);
      if (isGuest && isWelcomeAuthIntent(focus)) {
        setEntryReady(true);
        return;
      }

      const destination = resolveReturnTo(params.returnTo) ?? '/';
      router.replace(destination);
    }

    setEntryReady(true);
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

  if (!authReady || !entryReady) return null;

  return <>{children}</>;
}
