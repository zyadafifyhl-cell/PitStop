import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * Web: sessionStorage — isolated per browser tab (duplicate tab gets its own copy).
 * Native: AsyncStorage as usual.
 *
 * Lets you keep owner in one tab and customer in another without cross-tab logout.
 */
function useTabSessionStorage(): boolean {
  return Platform.OS === 'web' && typeof sessionStorage !== 'undefined';
}

export const tabAuthStorage = {
  getItem(key: string): Promise<string | null> {
    if (useTabSessionStorage()) {
      return Promise.resolve(sessionStorage.getItem(key));
    }
    return AsyncStorage.getItem(key);
  },

  setItem(key: string, value: string): Promise<void> {
    if (useTabSessionStorage()) {
      sessionStorage.setItem(key, value);
      return Promise.resolve();
    }
    return AsyncStorage.setItem(key, value);
  },

  removeItem(key: string): Promise<void> {
    if (useTabSessionStorage()) {
      sessionStorage.removeItem(key);
      return Promise.resolve();
    }
    return AsyncStorage.removeItem(key);
  },

  multiRemove(keys: string[]): Promise<void> {
    if (useTabSessionStorage()) {
      keys.forEach((key) => sessionStorage.removeItem(key));
      return Promise.resolve();
    }
    return AsyncStorage.multiRemove(keys);
  },
};
