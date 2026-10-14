import { router, type Href } from 'expo-router';

type RootNav = {
  navigate: (name: string, params?: object) => void;
};

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

/** Paths pushed above each tab, oldest first. */
const stacks = new Map<string, string[]>();

function normalize(pathname: string): string {
  if (!pathname || pathname === '/index') return '/';
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

/** Record the screen the user is on so leaving a tab can restore it later. */
export function noteTabPath(tabHref: string, pathname: string) {
  const path = normalize(pathname);
  if (TAB_ROOTS.has(path)) {
    stacks.set(tabHref, []);
    return;
  }

  const list = stacks.get(tabHref) ?? [];
  const existing = list.lastIndexOf(path);
  if (existing >= 0) {
    stacks.set(tabHref, list.slice(0, existing + 1));
    return;
  }
  stacks.set(tabHref, [...list, path]);
}

/**
 * Switch tabs without dropping the screen the previous tab was showing.
 * Deep routes live on the root stack, so a normal tab navigate pops them.
 * We remember that path and open it again when the tab is selected.
 */
export function switchPreservedTab(
  nav: RootNav | null | undefined,
  currentHref: string,
  target: { href: string; screen: string },
) {
  if (currentHref === target.href) return;

  const saved = stacks.get(target.href) ?? [];
  const deepest = saved[saved.length - 1];
  if (deepest) {
    router.navigate(deepest as Href);
    return;
  }

  nav?.navigate('(tabs)', { screen: target.screen });
}
