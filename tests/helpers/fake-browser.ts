/**
 * tests/helpers/fake-browser.ts — an in-memory {@link BrowserTabs}.
 *
 * Implements the same contract as the real Chrome adapter, so `TabActions` can
 * be tested end to end: close a group, then assert on which tabs survived.
 */

import type { BrowserTabs } from '@/platform/browser';
import type { TabInfo } from '@/types';

export interface FakeBrowser extends BrowserTabs {
  /** Current tabs, in tab-bar order. */
  readonly tabs: TabInfo[];
  /** Tab ids passed to `close()`, in call order. */
  readonly closed: number[];
  /** `{ url, index }` pairs passed to `create()`. `index` is omitted when appending. */
  readonly created: { url: string; index?: number }[];
  /** `{ tabId, index }` pairs passed to `move()`. */
  readonly moved: { tabId: number; index: number }[];
  /** The most recently activated tab, if any. */
  readonly activated: { tabId: number; windowId: number } | null;
  /** Fires the tab-change listeners. */
  emitChange(): void;
}

export interface FakeBrowserOptions {
  currentWindowId?: number;
  currentTabId?: number;
}

/** Creates a fake browser preloaded with `initialTabs`. */
export function createFakeBrowser(
  initialTabs: TabInfo[] = [],
  options: FakeBrowserOptions = {},
): FakeBrowser {
  const state = {
    tabs: [...initialTabs],
    closed: [] as number[],
    created: [] as { url: string; index?: number }[],
    moved: [] as { tabId: number; index: number }[],
    activated: null as { tabId: number; windowId: number } | null,
  };
  const listeners = new Set<() => void>();
  const currentWindowId = options.currentWindowId ?? 1;
  const currentTabId = options.currentTabId ?? -1;

  const browser: FakeBrowser = {
    get tabs() {
      return state.tabs;
    },
    get closed() {
      return state.closed;
    },
    get created() {
      return state.created;
    },
    get moved() {
      return state.moved;
    },
    get activated() {
      return state.activated;
    },

    async queryAll() {
      return [...state.tabs];
    },

    async queryCurrentWindow() {
      return state.tabs.filter((t) => t.windowId === currentWindowId);
    },

    async close(tabIds) {
      if (tabIds.length === 0) return;
      state.closed.push(...tabIds);
      const removing = new Set(tabIds);
      state.tabs = state.tabs.filter((t) => !removing.has(t.id));
    },

    async activate(tabId, windowId) {
      state.activated = { tabId, windowId };
    },

    async create(url, index) {
      state.created.push({ url, index });
    },

    async move(tabId, index) {
      state.moved.push({ tabId, index });
    },

    async currentWindowId() {
      return currentWindowId;
    },

    async currentTabId() {
      return currentTabId;
    },

    onChanged(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    emitChange() {
      for (const listener of listeners) listener();
    },
  };

  return browser;
}
