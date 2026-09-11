/**
 * services/tab-snapshot-cache.ts — durable tab-id → last-known-info cache.
 *
 * Backed by `chrome.storage.session`: it survives the background service
 * worker being killed and restarted, but is cleared when the browser closes —
 * exactly the lifetime this cache needs, since a tab id is meaningless once
 * the browser session that assigned it is gone.
 */

import type { KeyValueStore } from '../platform/storage';
import { removeSnapshot, updateSnapshot, type TabSnapshot, type TabSnapshotMap } from '../core/tab-snapshot';

export type { TabSnapshot };

const SNAPSHOT_KEY = 'tabSnapshots';

export class TabSnapshotCache {
  readonly #store: KeyValueStore;

  constructor(store: KeyValueStore) {
    this.#store = store;
  }

  async #readAll(): Promise<TabSnapshotMap> {
    try {
      const raw = await this.#store.get<unknown>(SNAPSHOT_KEY);
      return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as TabSnapshotMap) : {};
    } catch {
      return {};
    }
  }

  async #writeAll(map: TabSnapshotMap): Promise<void> {
    await this.#store.set(SNAPSHOT_KEY, map);
  }

  /** Records or refreshes what a tab currently looks like. */
  async record(tabId: number, snapshot: TabSnapshot): Promise<void> {
    const map = await this.#readAll();
    await this.#writeAll(updateSnapshot(map, tabId, snapshot));
  }

  /**
   * Removes and returns a tab's last-known snapshot. Called once per tab
   * close — after this, the entry is gone regardless of whether the caller
   * goes on to use it, so a stale tab id can never resurface a wrong result.
   */
  async consume(tabId: number): Promise<TabSnapshot | null> {
    const map = await this.#readAll();
    const { snapshots, removed } = removeSnapshot(map, tabId);
    await this.#writeAll(snapshots);
    return removed ?? null;
  }
}
