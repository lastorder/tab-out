/**
 * config/store.ts — reading and writing the user's settings.
 *
 * Settings live in `chrome.storage.sync` so they follow the user between
 * machines (they are small — well under the sync quota). Saved tabs, which can
 * grow large, stay in `chrome.storage.local`; see `services/saved-tabs.ts`.
 */

import type { TabOutSettings } from '../types';
import type { KeyValueStore } from '../platform/storage';
import { createDefaultSettings } from './defaults';
import { migrateSettings, normalizeSettings } from './schema';

/** Storage key holding the serialised {@link TabOutSettings}. */
export const SETTINGS_KEY = 'settings';

export class SettingsStore {
  readonly #store: KeyValueStore;

  constructor(store: KeyValueStore) {
    this.#store = store;
  }

  /**
   * Loads settings, repairing anything invalid.
   *
   * Never rejects: if storage itself fails, the caller still gets usable
   * defaults so the new tab page always renders.
   */
  async load(): Promise<TabOutSettings> {
    try {
      const raw = await this.#store.get<unknown>(SETTINGS_KEY);
      if (raw === undefined) return createDefaultSettings();
      const { settings } = normalizeSettings(raw);
      return migrateSettings(settings);
    } catch {
      return createDefaultSettings();
    }
  }

  /** Validates then persists settings, returning what was actually stored. */
  async save(settings: TabOutSettings): Promise<TabOutSettings> {
    const { settings: normalized } = normalizeSettings(settings);
    await this.#store.set(SETTINGS_KEY, normalized);
    return normalized;
  }

  /** Applies a partial update on top of the currently stored settings. */
  async patch(partial: Partial<TabOutSettings>): Promise<TabOutSettings> {
    const current = await this.load();
    return this.save({ ...current, ...partial });
  }

  /** Restores the built-in defaults. */
  async reset(): Promise<TabOutSettings> {
    return this.save(createDefaultSettings());
  }

  /**
   * Notifies when settings change in another context — e.g. the user saves in
   * the options tab while a dashboard is open in another tab.
   */
  onChanged(listener: (settings: TabOutSettings) => void): () => void {
    return this.#store.onChanged((key) => {
      if (key !== SETTINGS_KEY) return;
      void this.load().then(listener);
    });
  }
}
