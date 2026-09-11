/**
 * services/tab-snapshot-cache.ts — durable tab-id → last-known-info cache.
 *
 * `chrome.tabs.onRemoved` reports that a tab id closed, but not what URL or
 * title it had — by then Chrome has discarded that. So the background worker
 * keeps a running snapshot of every open tab, keyed by tab id, and consults
 * it at close time to record history.
 *
 * Backed by `chrome.storage.session`: it survives the service worker being
 * killed and restarted, but clears when the browser closes — exactly the
 * lifetime this needs, since a tab id is meaningless beyond its session.
 * Keys are strings because that is what they become once round-tripped
 * through JSON-backed storage.
 */

import type { KeyValueStore } from '../platform/storage';

export interface TabSnapshot {
  url: string;
  title: string;
}

const SNAPSHOT_KEY = 'tabSnapshots';

export class TabSnapshotCache {
  readonly #store: KeyValueStore;

  constructor(store: KeyValueStore) {
    this.#store = store;
  }

  async #read(): Promise<Record<string, TabSnapshot>> {
    try {
      const raw = await this.#store.get<unknown>(SNAPSHOT_KEY);
      return raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as Record<string, TabSnapshot>)
        : {};
    } catch {
      return {};
    }
  }

  /** Records or refreshes what a tab currently looks like. */
  async record(tabId: number, snapshot: TabSnapshot): Promise<void> {
    const map = await this.#read();
    await this.#store.set(SNAPSHOT_KEY, { ...map, [String(tabId)]: snapshot });
  }

  /**
   * Removes and returns a tab's last-known snapshot.
   *
   * Always removes, whether or not the caller uses the result: Chrome reuses
   * tab ids, so a lingering entry could later be attributed to an unrelated
   * tab.
   */
  async consume(tabId: number): Promise<TabSnapshot | null> {
    const map = await this.#read();
    const key = String(tabId);
    const snapshot = map[key];
    if (!snapshot) return null;

    const rest = { ...map };
    delete rest[key];
    await this.#store.set(SNAPSHOT_KEY, rest);
    return snapshot;
  }
}
