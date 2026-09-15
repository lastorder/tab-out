/**
 * services/saved-tabs.ts — the "Saved for later" checklist.
 *
 * Backed by a {@link KeyValueStore} (in production, `chrome.storage.local`).
 * Items are never hard-deleted: checking one off sets `completed` so it moves
 * to the searchable archive, and dismissing sets `dismissed` so it disappears
 * from both lists but the record survives.
 */

import type { SavedTab, SavedTabBuckets } from '../types';
import type { KeyValueStore } from '../platform/storage';
import { matchesQueryTerms, tokenizeQuery } from '../core/query';

/** Storage key holding the saved-tab array. */
export const SAVED_TABS_KEY = 'deferred';

/** Injected so tests can produce deterministic ids and timestamps. */
export interface SavedTabsDeps {
  now: () => Date;
  makeId: () => string;
}

const defaultDeps: SavedTabsDeps = {
  now: () => new Date(),
  makeId: () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
};

export class SavedTabsService {
  readonly #store: KeyValueStore;
  readonly #deps: SavedTabsDeps;

  constructor(store: KeyValueStore, deps: Partial<SavedTabsDeps> = {}) {
    this.#store = store;
    this.#deps = { ...defaultDeps, ...deps };
  }

  /** Reads the raw list, tolerating a missing or corrupt value. */
  async #readAll(): Promise<SavedTab[]> {
    try {
      const raw = await this.#store.get<unknown>(SAVED_TABS_KEY);
      if (!Array.isArray(raw)) return [];
      return raw.filter(
        (item): item is SavedTab =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as SavedTab).id === 'string' &&
          typeof (item as SavedTab).url === 'string',
      );
    } catch {
      return [];
    }
  }

  async #writeAll(items: SavedTab[]): Promise<void> {
    await this.#store.set(SAVED_TABS_KEY, items);
  }

  /** Appends a tab to the checklist and returns the created record. */
  async save(tab: { url: string; title?: string }): Promise<SavedTab> {
    const items = await this.#readAll();
    const entry: SavedTab = {
      id: this.#deps.makeId(),
      url: tab.url,
      title: tab.title || tab.url,
      savedAt: this.#deps.now().toISOString(),
      completed: false,
      dismissed: false,
    };
    items.push(entry);
    await this.#writeAll(items);
    return entry;
  }

  /** Returns the checklist split into active items and the archive. */
  async list(): Promise<SavedTabBuckets> {
    const visible = (await this.#readAll()).filter((item) => !item.dismissed);
    return {
      active: visible.filter((item) => !item.completed),
      archived: visible.filter((item) => item.completed),
    };
  }

  /** Checks an item off; it moves to the archive. */
  async complete(id: string): Promise<boolean> {
    const items = await this.#readAll();
    const target = items.find((item) => item.id === id);
    if (!target) return false;
    target.completed = true;
    target.completedAt = this.#deps.now().toISOString();
    await this.#writeAll(items);
    return true;
  }

  /** Dismisses an item; it disappears from both lists. */
  async dismiss(id: string): Promise<boolean> {
    const items = await this.#readAll();
    const target = items.find((item) => item.id === id);
    if (!target) return false;
    target.dismissed = true;
    await this.#writeAll(items);
    return true;
  }

  /** Case-insensitive search across archived titles and URLs. */
  async searchArchive(query: string): Promise<SavedTab[]> {
    const { archived } = await this.list();
    return filterSavedTabs(archived, query);
  }
}

/**
 * Pure filter used by the archive search box. Queries shorter than two
 * characters return everything, so the list does not flicker while typing.
 * Space-separated terms narrow the list, matching every other search box in
 * the extension — see `core/query.ts`.
 */
function filterSavedTabs(items: readonly SavedTab[], query: string): SavedTab[] {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [...items];
  const terms = tokenizeQuery(trimmed);
  return items.filter((item) => matchesQueryTerms(terms, [item.title || '', item.url || '']));
}
