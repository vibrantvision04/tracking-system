import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { KEYS } from './storageKeys';

/**
 * Secure token/profile storage.
 *
 * Thin wrapper over `expo-secure-store` exposing get/set/delete/clear for the
 * `KEYS.{ACCESS_TOKEN,REFRESH_TOKEN,USER_PROFILE}` keys used across the app.
 *
 * On web (`Platform.OS === 'web'`), where `expo-secure-store` is unavailable,
 * the wrapper transparently falls back to `AsyncStorage`.
 *
 * Requirements: 11.1 (tokens reside only in secure storage), 1.3 (token persistence).
 */

export type SecureStorageKey = (typeof KEYS)[keyof typeof KEYS];

const MANAGED_KEYS: SecureStorageKey[] = [
  KEYS.ACCESS_TOKEN,
  KEYS.REFRESH_TOKEN,
  KEYS.USER_PROFILE,
];

const useSecureStore = Platform.OS !== 'web';

/** Read a value for the given key, or `null` when absent. */
async function get(key: SecureStorageKey): Promise<string | null> {
  if (useSecureStore) {
    return SecureStore.getItemAsync(key);
  }
  return AsyncStorage.getItem(key);
}

/** Persist a value for the given key. */
async function set(key: SecureStorageKey, value: string): Promise<void> {
  if (useSecureStore) {
    await SecureStore.setItemAsync(key, value);
    return;
  }
  await AsyncStorage.setItem(key, value);
}

/** Remove the value for a single key. */
async function del(key: SecureStorageKey): Promise<void> {
  if (useSecureStore) {
    await SecureStore.deleteItemAsync(key);
    return;
  }
  await AsyncStorage.removeItem(key);
}

/** Remove all managed keys (used on logout / session end). */
async function clear(): Promise<void> {
  if (useSecureStore) {
    await Promise.all(MANAGED_KEYS.map((key) => SecureStore.deleteItemAsync(key)));
    return;
  }
  await AsyncStorage.multiRemove(MANAGED_KEYS);
}

/**
 * One-time migration from `AsyncStorage` to `SecureStore`.
 *
 * Copies any existing managed values out of `AsyncStorage` into `SecureStore`,
 * then deletes them from `AsyncStorage` so tokens reside only in secure storage.
 * No-op on web, where `AsyncStorage` remains the backing store.
 */
async function migrate(): Promise<void> {
  if (!useSecureStore) {
    return;
  }

  const migratedKeys: SecureStorageKey[] = [];
  for (const key of MANAGED_KEYS) {
    const existing = await AsyncStorage.getItem(key);
    if (existing !== null) {
      await SecureStore.setItemAsync(key, existing);
      migratedKeys.push(key);
    }
  }

  if (migratedKeys.length > 0) {
    await AsyncStorage.multiRemove(migratedKeys);
  }
}

export const secureStorage = {
  get,
  set,
  delete: del,
  clear,
  migrate,
};

export default secureStorage;
