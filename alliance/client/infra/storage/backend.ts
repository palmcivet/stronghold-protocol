import { createStore as createIdbStore, del, get, keys, set } from 'idb-keyval';
import { getPlatform } from '#infra/platform/index.js';

/**
 * The adapter a host provides. Values are JSON-compatible; every call is async, so a host can back it with the
 * Tauri store plugin, Capacitor Preferences or SQLite, or the OS keychain. `watch` reports keys another instance
 * changed (other tabs in a browser); a single-instance host leaves it out.
 */
export interface StorageBackend {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  /** Keys starting with `prefix` (every key without one). */
  keys(prefix?: string): Promise<readonly string[]>;
  watch?(listener: (key: string) => void): () => void;
}

const withPrefix = (all: Iterable<string>, prefix = ''): string[] =>
  [...all].filter((key) => key.startsWith(prefix));

/** Values in memory: the tests' adapter, and the fallback when the host has no storage. */
export function memoryBackend(): StorageBackend {
  const values = new Map<string, unknown>();
  return {
    get: async (key) => structuredClone(values.get(key)),
    set: async (key, value) => {
      values.set(key, structuredClone(value));
    },
    delete: async (key) => {
      values.delete(key);
    },
    keys: async (prefix) => withPrefix(values.keys(), prefix),
  };
}

function webStorage(kind: 'local' | 'session'): Storage | null {
  try {
    return (
      (kind === 'local'
        ? globalThis.localStorage
        : globalThis.sessionStorage) ?? null
    );
  } catch {
    return null;
  }
}

function storageKeys(storage: Storage | null): string[] {
  const out: string[] = [];
  try {
    for (let index = 0; storage && index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key !== null) {
        out.push(key);
      }
    }
  } catch {
    // unreadable
  }
  return out;
}

/** One Web Storage area as an adapter; a blocked or full area keeps values in memory for this page. */
function webAreaBackend(kind: 'local' | 'session'): StorageBackend {
  const spare = new Map<string, unknown>();
  return {
    get: async (key) => {
      let raw: string | null = null;
      try {
        raw = webStorage(kind)?.getItem(key) ?? null;
      } catch {
        raw = null;
      }
      if (raw === null) {
        return spare.get(key);
      }
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        // not JSON: handed over as text, which the item layer keeps as a damaged backup
        return raw;
      }
    },
    set: async (key, value) => {
      try {
        const area = webStorage(kind);
        if (area) {
          area.setItem(key, JSON.stringify(value));
          spare.delete(key);
          return;
        }
      } catch {
        // full or blocked
      }
      spare.set(key, value);
    },
    delete: async (key) => {
      try {
        webStorage(kind)?.removeItem(key);
      } catch {
        // nothing to remove
      }
      spare.delete(key);
    },
    keys: async (prefix) =>
      withPrefix(
        new Set([...storageKeys(webStorage(kind)), ...spare.keys()]),
        prefix,
      ),
  };
}

/** The browser's adapter for small data: localStorage, with other tabs' writes from the `storage` event. */
export function browserSmallBackend(): StorageBackend {
  const area = webAreaBackend('local');
  return {
    ...area,
    watch: (listener) => {
      if (typeof window === 'undefined') {
        return () => {};
      }
      const onStorage = (event: StorageEvent): void => {
        if (event.key !== null) {
          listener(event.key);
        }
      };
      window.addEventListener('storage', onStorage);
      return () => window.removeEventListener('storage', onStorage);
    },
  };
}

/** The browser's adapter for large data: IndexedDB through idb-keyval, other tabs told over a BroadcastChannel. */
export function browserLargeBackend(name = 'wsde'): StorageBackend {
  const store = createIdbStore(name, 'items');
  const channel = getPlatform().broadcastChannel
    ? new BroadcastChannel(`${name}:storage`)
    : null;
  const tell = (key: string): void => channel?.postMessage({ key });
  return {
    get: (key) => get(key, store),
    set: async (key, value) => {
      await set(key, value, store);
      tell(key);
    },
    delete: async (key) => {
      await del(key, store);
      tell(key);
    },
    keys: async (prefix) => withPrefix((await keys(store)).map(String), prefix),
    watch: (listener) => {
      if (!getPlatform().broadcastChannel) {
        return () => {};
      }
      // a channel does not hear its own messages, so this one hears only other tabs
      const own = new BroadcastChannel(`${name}:storage`);
      own.onmessage = (event: MessageEvent<{ key?: unknown }>) => {
        if (typeof event.data?.key === 'string') {
          listener(event.data.key);
        }
      };
      return () => own.close();
    },
  };
}

/** The browser's tab secret slot: this tab's sessionStorage, which a new tab never inherits. */
export function browserTabBackend(): StorageBackend {
  return webAreaBackend('session');
}

/**
 * The browser's device secret slot: localStorage, shared by the tabs (the recent token list). The browser has no
 * keychain; a host replaces both secret slots with its own.
 */
export function browserDeviceSecretBackend(): StorageBackend {
  return webAreaBackend('local');
}
