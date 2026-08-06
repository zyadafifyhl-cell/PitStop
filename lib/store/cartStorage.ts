import AsyncStorage from '@react-native-async-storage/async-storage';

import type { StoreCartItem } from '@/lib/store/types';

const KEY_PREFIX = '@pitstop/store-cart/v1';

function storageKey(userId: string): string {
  return `${KEY_PREFIX}:${userId}`;
}

export async function loadPersistedCartItems(userId: string): Promise<StoreCartItem[]> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoreCartItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function savePersistedCartItems(userId: string, items: StoreCartItem[]): Promise<void> {
  try {
    if (!items.length) {
      await AsyncStorage.removeItem(storageKey(userId));
      return;
    }
    await AsyncStorage.setItem(storageKey(userId), JSON.stringify(items));
  } catch {
    // Ignore local persistence failures; Supabase cart remains authoritative.
  }
}

export async function clearPersistedCartItems(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(storageKey(userId));
  } catch {
    // Ignore.
  }
}
