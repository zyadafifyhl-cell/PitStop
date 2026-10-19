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

/** Screens opened above each tab, oldest first. Empty = sit on that tab's root. */
const stacks = new Map<string, string[]>();

/**
 * While restoring a tab we briefly navigate to its root, then push the saved
 * screens. That root visit must not wipe the stack we are in the middle of restoring.
 */
let restoreGuard: { tab: string; top: string } | null = null;

export function deepestPathForTab(tabHref: string): string {
  const stack = stacks.get(tabHref);
  return stack?.length ? stack[stack.length - 1] : '';
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

function isBrowseTab(tabHref: string): tabHref is BrowseTabHref {
  return (
    tabHref === '/' ||
    tabHref === '/bookings' ||
    tabHref === '/orders' ||
    tabHref === '/favorites' ||
    tabHref === '/assistant' ||
    tabHref === '/settings' ||
    tabHref === '/shop'
  );
}

function rememberPath(tabHref: string, path: string) {
  const list = stacks.get(tabHref) ?? [];
  const existing = list.lastIndexOf(path);
  if (existing >= 0) {
    stacks.set(tabHref, list.slice(0, existing + 1));
    return;
  }
  stacks.set(tabHref, [...list, path]);
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
  rememberPath(tabHref, normalize(path.split('?')[0] ?? path));
  router.push(href);
}

/** Record where this tab currently is so we can return to it later. */
export function noteTabPath(tabHref: string, pathname: string) {
  const path = normalize(pathname);

  if (restoreGuard && tabHref !== restoreGuard.tab && !TAB_ROOTS.has(path)) {
    restoreGuard = null;
  }

  if (TAB_ROOTS.has(path)) {
    if (restoreGuard?.tab === tabHref) return;
    stacks.set(tabHref, []);
    if (isBrowseTab(tabHref)) setActiveBrowseTab(tabHref);
    return;
  }

  rememberPath(tabHref, path);
  if (restoreGuard?.tab === tabHref && path === restoreGuard.top) {
    restoreGuard = null;
  }
}

/**
 * Switch tabs without dropping deep screens owned by the tab you leave.
 * Service/shop routes live on the root stack above `(tabs)`, so a plain tab
 * navigate pops them — we remember each tab's path and restore it.
 *
 * The restored screens are pushed on top of that tab's own root. Otherwise
 * Back would return to whichever tab was open when the restore happened.
 */
export function switchPreservedTab(
  nav: RootNav | null | undefined,
  currentHref: string,
  currentPathname: string,
  target: { href: string; screen: string },
) {
  restoreGuard = null;
  noteTabPath(currentHref, currentPathname);

  if (currentHref === target.href) {
    // Tapping the open tab returns to that tab's first page.
    if (TAB_ROOTS.has(normalize(currentPathname))) return;
    stacks.set(target.href, []);
    setActiveBrowseTab(target.href as BrowseTabHref);
    try {
      router.navigate(tabRootHref(target.href));
    } catch {
      nav?.navigate('(tabs)', { screen: target.screen });
    }
    return;
  }

  setActiveBrowseTab(target.href as BrowseTabHref);

  const saved = [...(stacks.get(target.href) ?? [])];
  if (saved.length > 0) {
    restoreGuard = { tab: target.href, top: saved[saved.length - 1] };
    router.navigate(tabRootHref(target.href));
    for (const path of saved) {
      router.push(path as Href);
    }
    return;
  }

  try {
    router.navigate(tabRootHref(target.href));
  } catch {
    nav?.navigate('(tabs)', { screen: target.screen });
  }
}
