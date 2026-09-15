/**
 * tests/helpers/factories.ts — concise builders for test data.
 */

import type { ClosedTabEntry, TabInfo, TabOutSettings } from '@/types';
import { createDefaultSettings, SETTINGS_VERSION } from '@/config/defaults';

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

/** Builds a closed-tab history entry; only `url` is required. */
export function historyEntry(
  url: string,
  overrides: Partial<ClosedTabEntry> = {},
): ClosedTabEntry {
  return {
    id: `hist-${nextId++}`,
    url,
    title: url,
    closedAt: new Date(2026, 3, 4, 12, 0, 0).toISOString(),
    ...overrides,
  };
}

/** Settings with everything empty — the neutral baseline for grouping tests. */
export function emptySettings(overrides: Partial<TabOutSettings> = {}): TabOutSettings {
  return {
    // Taken from the source constant rather than hard-coded, so bumping the
    // settings shape doesn't leave every fixture looking like a stale upgrade.
    version: SETTINGS_VERSION,
    pinnedEnabled: true,
    pinnedSites: [],
    disposableEnabled: true,
    disposableRules: [],
    maxHistoryItems: 100,
    autoSortTabs: true,
    searchShortcut: { key: 'f', ctrl: true, meta: false, alt: false, shift: false },
    globalSearchShortcutEnabled: false,
    globalDashboardShortcutEnabled: false,
    ...overrides,
  };
}

/** The shipped defaults, for tests that assert on out-of-the-box behaviour. */
export function defaultSettings(): TabOutSettings {
  return createDefaultSettings();
}
