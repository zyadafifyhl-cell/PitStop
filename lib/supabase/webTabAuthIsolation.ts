import { Platform } from 'react-native';

const LEGACY_LOCAL_STORAGE_PREFIX = 'sb-';

/**
 * Supabase GoTrueClient syncs auth across browser tabs via BroadcastChannel.
 * Stub it so duplicated tabs stay independent (owner in tab 1, customer in tab 2).
 */
export function disableSupabaseCrossTabAuthSync(): void {
  if (Platform.OS !== 'web' || typeof globalThis.BroadcastChannel === 'undefined') return;

  class NoopBroadcastChannel {
    constructor(_name: string) {}

    postMessage(_message: unknown): void {}

    close(): void {}

    addEventListener(): void {}

    removeEventListener(): void {}
  }

  globalThis.BroadcastChannel = NoopBroadcastChannel as unknown as typeof BroadcastChannel;
}

/** Remove old localStorage Supabase tokens from before sessionStorage migration. */
export function clearLegacySupabaseLocalStorageAuth(): void {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return;

  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key?.startsWith(LEGACY_LOCAL_STORAGE_PREFIX)) keysToRemove.push(key);
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
}

export function prepareWebTabAuthIsolation(): void {
  if (Platform.OS !== 'web') return;
  disableSupabaseCrossTabAuthSync();
  clearLegacySupabaseLocalStorageAuth();
}

/** Sign out only this tab on web so other tabs keep their session. */
export async function signOutCurrentTab(
  signOut: (options?: { scope?: 'global' | 'local' | 'others' }) => Promise<{ error: Error | null }>,
): Promise<void> {
  const scope = Platform.OS === 'web' ? 'local' : 'global';
  await signOut({ scope });
}
