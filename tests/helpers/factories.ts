/**
 * tests/helpers/factories.ts — concise builders for test data.
 */

import type { TabInfo, TabOutSettings } from '@/types';
import { createDefaultSettings } from '@/config/defaults';

let nextId = 1;

/** Resets the auto-increment tab id, so ids are predictable per test. */
export function resetTabIds(): void {
  nextId = 1;
}

/** Builds a {@link TabInfo}; only `url` is required. */
export function tab(url: string, overrides: Partial<TabInfo> = {}): TabInfo {
  return {
    id: nextId++,
    url,
    title: url,
    windowId: 1,
    active: false,
    index: 0,
    ...overrides,
  };
}

/** Builds a list of tabs with sequential tab-bar indexes. */
export function tabs(...urls: string[]): TabInfo[] {
  return urls.map((url, i) => tab(url, { index: i }));
}

/** Settings with everything empty — the neutral baseline for grouping tests. */
export function emptySettings(overrides: Partial<TabOutSettings> = {}): TabOutSettings {
  return {
    version: 1,
    pinnedSites: [],
    landingPatterns: [],
    customGroups: [],
    ...overrides,
  };
}

/** The shipped defaults, for tests that assert on out-of-the-box behaviour. */
export function defaultSettings(): TabOutSettings {
  return createDefaultSettings();
}
