import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

function useWebStorage(): boolean {
  return Platform.OS === 'web' && typeof localStorage !== 'undefined';
}

/** Persist Supabase auth session (localStorage on web for reliable auth). */
export const supabaseAuthStorage = {
  getItem: (key: string) => {
    if (useWebStorage()) {
      return Promise.resolve(localStorage.getItem(key));
    }
    if (typeof window === 'undefined') return Promise.resolve(null);
    return AsyncStorage.getItem(key);
  },
  setItem: (key: string, value: string) => {
    if (useWebStorage()) {
      localStorage.setItem(key, value);
      return Promise.resolve();
    }
    if (typeof window === 'undefined') return Promise.resolve();
    return AsyncStorage.setItem(key, value);
  },
  removeItem: (key: string) => {
    if (useWebStorage()) {
      localStorage.removeItem(key);
      return Promise.resolve();
    }
    if (typeof window === 'undefined') return Promise.resolve();
    return AsyncStorage.removeItem(key);
  },
};
