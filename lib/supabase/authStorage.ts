import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * Web: sessionStorage so each browser tab keeps its own Supabase session.
 * Duplicate tab → independent owner/customer login in parallel.
 * Native: AsyncStorage.
 */
function useWebTabStorage(): boolean {
  return Platform.OS === 'web' && typeof sessionStorage !== 'undefined';
}

export const supabaseAuthStorage = {
  getItem: (key: string) => {
    if (useWebTabStorage()) {
      return Promise.resolve(sessionStorage.getItem(key));
    }
    if (typeof window === 'undefined') return Promise.resolve(null);
    return AsyncStorage.getItem(key);
  },
  setItem: (key: string, value: string) => {
    if (useWebTabStorage()) {
      sessionStorage.setItem(key, value);
      return Promise.resolve();
    }
    if (typeof window === 'undefined') return Promise.resolve();
    return AsyncStorage.setItem(key, value);
  },
  removeItem: (key: string) => {
    if (useWebTabStorage()) {
      sessionStorage.removeItem(key);
      return Promise.resolve();
    }
    if (typeof window === 'undefined') return Promise.resolve();
    return AsyncStorage.removeItem(key);
  },
};
