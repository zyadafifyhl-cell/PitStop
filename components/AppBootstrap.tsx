import * as Linking from 'expo-linking';
import {
  useGlobalSearchParams,
  usePathname,
  useRootNavigationState,
  useRouter,
  type Href,
} from 'expo-router';
import { useEffect } from 'react';

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

/** Route to the correct entry screen after both auth and the root navigator are ready. */
export function AppBootstrap({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const params = useGlobalSearchParams();
  const { ready: customerReady, customer, isGuest, hasSession, busy: customerBusy } = useCustomerAuth();
  const { ready: shopReady, shop, staff, isAdmin, isPendingOwner, busy: shopBusy } = useShopAuth();

  const authReady = customerReady && shopReady;
  const navigationReady = Boolean(rootNavigationState?.key);

  useEffect(() => {
    if (!navigationReady) return;

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
  }, [navigationReady, router]);

  useEffect(() => {
    if (!navigationReady || !authReady) return;

    const isPublic = isPublicPath(pathname);
    const isLoggedIn = !!customer || !!shop || isGuest || !!staff;
    const loginInFlight = customerBusy || shopBusy;
    const restoringSession = hasSession && !customer && !shop && !staff && !loginInFlight;

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

    // Keep /welcome mounted during a login attempt. Unmounting here looked like a
    // full page reload and wiped the email/password fields on invalid credentials.
    if (loginInFlight && !isLoggedIn) {
      return;
    }

    if (restoringSession && !isLoggedIn && !isPublic) {
      return;
    }

    if (!isLoggedIn && !isPublic && !restoringSession && !loginInFlight) {
      router.replace('/welcome?focus=login');
      return;
    }

    if ((customer || isGuest) && pathname === '/welcome') {
      if (loginInFlight) {
        return;
      }
      const focus = readRouteParam(params.focus);
      if (isGuest && isWelcomeAuthIntent(focus)) {
        return;
      }

      const destination = resolveReturnTo(params.returnTo) ?? '/';
      router.replace(destination);
    }
  }, [
    navigationReady,
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
