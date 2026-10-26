import { router, type Href } from 'expo-router';

type RootNav = {
  navigate: (name: string, params?: object) => void;
};

export type BrowseTabHref =
  | '/'
  | '/bookings'
  | '/orders'
  | '/favorites'
  | '/assistant'
  | '/settings'
  | '/shop';

const TAB_ROOTS = new Set([
  '/',
  '/index',
  '/bookings',
  '/orders',
  '/favorites',
  '/assistant',
  '/shop',
  '/settings',
]);

/** Tab that currently "owns" shared deep screens (shop profile, book, etc.). */
let activeBrowseTab: BrowseTabHref = '/';

/** Deepest remembered path for each tab (empty = sit on that tab's root). */
const deepestByTab = new Map<string, string>();

export function deepestPathForTab(tabHref: string): string {
  return deepestByTab.get(tabHref) ?? '';
}

export function getActiveBrowseTab(): BrowseTabHref {
  return activeBrowseTab;
}

export function setActiveBrowseTab(tabHref: BrowseTabHref) {
  activeBrowseTab = tabHref;
}

function normalize(pathname: string): string {
  if (!pathname || pathname === '/index' || pathname === '/(tabs)' || pathname === '/(tabs)/index') {
    return '/';
  }
  const stripped = pathname.startsWith('/(tabs)') ? pathname.slice('/(tabs)'.length) || '/' : pathname;
  if (stripped.length > 1 && stripped.endsWith('/')) return stripped.slice(0, -1);
  return stripped;
}

function tabRootHref(href: string): Href {
  return (href === '/' ? '/' : href) as Href;
}

/** Shared screens that can be opened from more than one tab (not exclusive to Home). */
export function isSharedBrowseDeepPath(pathname: string): boolean {
  const path = normalize(pathname);
  return (
    path.startsWith('/shop-profile/') ||
    path.startsWith('/parts-shop/') ||
    path.startsWith('/book/') ||
    path.startsWith('/service/') ||
    path.startsWith('/nearby/') ||
    path === '/store' ||
    path.startsWith('/store/') ||
    path.startsWith('/points-marketplace')
  );
}

/** Open a shared deep screen while keeping the given tab highlighted/owning the stack. */
export function pushFromBrowseTab(tabHref: BrowseTabHref, href: Href) {
  setActiveBrowseTab(tabHref);
  const path = typeof href === 'string' ? href : String(href);
  deepestByTab.set(tabHref, normalize(path.split('?')[0] ?? path));
  router.push(href);
}

/** Record where this tab currently is so we can return to it later. */
export function noteTabPath(tabHref: string, pathname: string) {
  const path = normalize(pathname);
  if (TAB_ROOTS.has(path)) {
    deepestByTab.set(tabHref, '');
    if (
      tabHref === '/' ||
      tabHref === '/bookings' ||
      tabHref === '/orders' ||
      tabHref === '/favorites' ||
      tabHref === '/assistant' ||
      tabHref === '/settings' ||
      tabHref === '/shop'
    ) {
      setActiveBrowseTab(tabHref);
    }
    return;
  }
  deepestByTab.set(tabHref, path);
}

/**
 * Switch tabs without dropping deep screens owned by the tab you leave.
 * Service/shop routes live on the root stack above `(tabs)`, so a plain tab
 * navigate pops them — we remember each tab's last path and restore it.
 * Home is the exception: that button always returns to the first page.
 */
export function switchPreservedTab(
  nav: RootNav | null | undefined,
  currentHref: string,
  currentPathname: string,
  target: { href: string; screen: string },
) {
  const path = normalize(currentPathname);
  const goingHome = target.href === '/' || target.href === '/index' || target.screen === 'index';

  if (goingHome) {
    if (currentHref !== '/' && currentHref !== '/index') {
      noteTabPath(currentHref, currentPathname);
    }
    deepestByTab.set('/', '');
    setActiveBrowseTab('/');
    if (path === '/' || path === '/index') return;
    try {
      // The tab router only handles NAVIGATE / JUMP_TO. dismissTo() is POP_TO,
      // which that router drops without throwing — so Home from My bookings
      // (or any other tab) never left the page. Pop first only when a screen
      // is stacked above the tabs, then select Home with navigate().
      if (!TAB_ROOTS.has(path)) {
        router.dismissTo('/');
      }
      router.navigate('/');
    } catch {
      nav?.navigate('(tabs)', { screen: 'index' });
    }
    return;
  }

  noteTabPath(currentHref, currentPathname);

  if (currentHref === target.href && (path === target.href || TAB_ROOTS.has(path))) {
    return;
  }

  setActiveBrowseTab(target.href as BrowseTabHref);

  const saved = deepestByTab.get(target.href) ?? '';
  if (saved) {
    router.navigate(saved as Href);
    return;
  }

  try {
    router.navigate(tabRootHref(target.href));
  } catch {
    nav?.navigate('(tabs)', { screen: target.screen });
  }
}
