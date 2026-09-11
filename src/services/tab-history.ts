/**
 * services/tab-history.ts — the "recently closed tabs" list.
 *
 * Backed by a {@link KeyValueStore} (in production, `chrome.storage.local` —
 * the list can grow to hundreds of entries, so it stays off `sync`'s tighter
 * quota). All the interesting decisions — dedup, ordering, trimming — live in
 * `core/history.ts`; this class is just storage plumbing around them.
 */

import type { ClosedTabEntry } from '../types';
import type { KeyValueStore } from '../platform/storage';
import { clampHistory, sortHistoryByRecency, upsertHistoryEntry } from '../core/history';

/** Storage key holding the closed-tab array. */
export const HISTORY_KEY = 'closedTabHistory';

/** Injected so tests can produce deterministic ids and timestamps. */
export interface TabHistoryDeps {
  now: () => Date;
  makeId: () => string;
}

const defaultDeps: TabHistoryDeps = {
  now: () => new Date(),
  makeId: () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
};

export class TabHistoryService {
  readonly #store: KeyValueStore;
  readonly #deps: TabHistoryDeps;

  constructor(store: KeyValueStore, deps: Partial<TabHistoryDeps> = {}) {
    this.#store = store;
    this.#deps = { ...defaultDeps, ...deps };
  }

  /** Reads the raw list, tolerating a missing or corrupt stored value. */
  async #readAll(): Promise<ClosedTabEntry[]> {
    try {
      const raw = await this.#store.get<unknown>(HISTORY_KEY);
      if (!Array.isArray(raw)) return [];
      return raw.filter(
        (item): item is ClosedTabEntry =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as ClosedTabEntry).id === 'string' &&
          typeof (item as ClosedTabEntry).url === 'string' &&
          typeof (item as ClosedTabEntry).closedAt === 'string',
      );
    } catch {
      return [];
    }
  }

  async #writeAll(entries: ClosedTabEntry[]): Promise<void> {
    await this.#store.set(HISTORY_KEY, entries);
  }

  /**
   * Records a tab closure. Replaces any earlier entry for the same URL and
   * trims the list to `maxItems`.
   */
  async record(tab: { url: string; title?: string }, maxItems: number): Promise<ClosedTabEntry> {
    const entry: ClosedTabEntry = {
      id: this.#deps.makeId(),
      url: tab.url,
      title: tab.title || tab.url,
      closedAt: this.#deps.now().toISOString(),
    };
    const history = await this.#readAll();
    await this.#writeAll(upsertHistoryEntry(history, entry, maxItems));
    return entry;
  }

  /**
   * Returns the history list, newest first, with any URL currently open
   * filtered out — the panel must never show a "closed" tab that is open.
   */
  async list(openUrls: ReadonlySet<string> = new Set()): Promise<ClosedTabEntry[]> {
    const history = sortHistoryByRecency(await this.#readAll());
    return openUrls.size === 0 ? history : history.filter((h) => !openUrls.has(h.url));
  }

  /** Removes every entry for a URL — called when that page is opened again. */
  async removeByUrl(url: string): Promise<void> {
    const history = await this.#readAll();
    await this.#writeAll(history.filter((h) => h.url !== url));
  }

  /** Removes one entry by id — the panel's per-row remove button. */
  async removeById(id: string): Promise<boolean> {
    const history = await this.#readAll();
    if (!history.some((h) => h.id === id)) return false;
    await this.#writeAll(history.filter((h) => h.id !== id));
    return true;
  }

  /** Empties the list — the panel's "Clear all" button. */
  async clear(): Promise<void> {
    await this.#writeAll([]);
  }

  /** Re-applies a (possibly lowered) limit immediately, rather than waiting for it to bite on the next `record()`. */
  async trimTo(maxItems: number): Promise<void> {
    const history = await this.#readAll();
    await this.#writeAll(clampHistory(history, maxItems));
  }

  /**
   * Notifies when the history list changes in another context — most
   * importantly, when the background worker records a newly-closed tab
   * while a dashboard page is already open. Without this, the History panel
   * would only pick up a closed tab on its next full render.
   */
  onChanged(listener: () => void): () => void {
    return this.#store.onChanged((key) => {
      if (key !== HISTORY_KEY) return;
      listener();
    });
  }
}
