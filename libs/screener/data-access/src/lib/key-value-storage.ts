import { InjectionToken } from '@angular/core';

/**
 * Minimal persistent storage. Exists so adapters never touch `localStorage` directly: it can be
 * missing (SSR, some privacy modes) or throw (quota, disabled storage), and tests need a fake.
 */
export interface KeyValueStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export const KEY_VALUE_STORAGE = new InjectionToken<KeyValueStorage>(
  'KEY_VALUE_STORAGE',
  { providedIn: 'root', factory: () => browserStorage() },
);

/** `localStorage` when usable, otherwise an in-memory fallback for the session. */
export function browserStorage(): KeyValueStorage {
  try {
    const storage = globalThis.localStorage;
    const probe = '__dh_probe__';
    storage.setItem(probe, probe);
    storage.removeItem(probe);
    return {
      get: (key) => storage.getItem(key),
      set: (key, value) => storage.setItem(key, value),
    };
  } catch {
    return memoryStorage();
  }
}

export function memoryStorage(
  initial: Record<string, string> = {},
): KeyValueStorage {
  const values = new Map(Object.entries(initial));
  return {
    get: (key) => values.get(key) ?? null,
    set: (key, value) => {
      values.set(key, value);
    },
  };
}
