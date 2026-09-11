/**
 * platform/storage.ts — a tiny key/value abstraction over `chrome.storage`.
 *
 * Every module that persists data talks to a {@link KeyValueStore} rather than
 * to `chrome.storage` directly. That keeps the storage API surface small, and
 * lets tests swap in {@link createMemoryStore} with no mocking of globals.
 */

/** The minimal storage contract the rest of the app depends on. */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  /** Subscribes to external writes. Returns an unsubscribe function. */
  onChanged(listener: (key: string) => void): () => void;
}

/** Wraps one `chrome.storage` area (`sync` or `local`). */
export function createChromeStore(areaName: 'sync' | 'local'): KeyValueStore {
  const area = chrome.storage[areaName];

  return {
    async get<T>(key: string): Promise<T | undefined> {
      const result = await area.get(key);
      return result[key] as T | undefined;
    },

    async set<T>(key: string, value: T): Promise<void> {
      await area.set({ [key]: value });
    },

    async remove(key: string): Promise<void> {
      await area.remove(key);
    },

    onChanged(listener: (key: string) => void): () => void {
      const handler = (
        changes: Record<string, chrome.storage.StorageChange>,
        changedArea: string,
      ): void => {
        if (changedArea !== areaName) return;
        for (const key of Object.keys(changes)) listener(key);
      };
      chrome.storage.onChanged.addListener(handler);
      return () => chrome.storage.onChanged.removeListener(handler);
    },
  };
}

/**
 * An in-memory {@link KeyValueStore}, used by the unit tests and as a fallback
 * if `chrome.storage` is somehow unavailable.
 */
export function createMemoryStore(seed: Record<string, unknown> = {}): KeyValueStore {
  const data = new Map<string, unknown>(Object.entries(seed));
  const listeners = new Set<(key: string) => void>();

  const emit = (key: string): void => {
    for (const listener of listeners) listener(key);
  };

  return {
    async get<T>(key: string): Promise<T | undefined> {
      // Structured-clone the value so callers cannot mutate stored state.
      const value = data.get(key);
      return value === undefined ? undefined : (structuredClone(value) as T);
    },

    async set<T>(key: string, value: T): Promise<void> {
      data.set(key, structuredClone(value));
      emit(key);
    },

    async remove(key: string): Promise<void> {
      data.delete(key);
      emit(key);
    },

    onChanged(listener: (key: string) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
