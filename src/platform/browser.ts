/**
 * platform/browser.ts — the seam between Tab Out and the Chrome tabs API.
 *
 * `BrowserTabs` describes everything the app needs from the browser. The real
 * implementation forwards to `chrome.tabs` / `chrome.windows`; tests supply a
 * plain object instead, which is why the services layer needs no globals
 * stubbing at all.
 */

import type { ChromeGroupInfo, TabInfo } from '../types';

/** Everything Tab Out does to the browser, in one interface. */
export interface BrowserTabs {
  /** All open tabs across all windows. */
  queryAll(): Promise<TabInfo[]>;
  /** Open tabs in the focused window. */
  queryCurrentWindow(): Promise<TabInfo[]>;
  /** Closes the given tabs. A no-op for an empty list. */
  close(tabIds: readonly number[]): Promise<void>;
  /** Activates a tab and focuses its window. */
  activate(tabId: number, windowId: number): Promise<void>;
  /** Opens a new tab. With no index, Chrome appends it at the end of the tab bar. */
  create(url: string, index?: number): Promise<void>;
  /** Moves a tab to a new position in the tab bar. */
  move(tabId: number, index: number): Promise<void>;
  /** The id of the currently focused window. */
  currentWindowId(): Promise<number>;
  /** The id of the tab this code is running in, or -1 outside a tab. */
  currentTabId(): Promise<number>;
  /** Subscribes to tab open/close/navigate events. Returns an unsubscribe fn. */
  onChanged(listener: () => void): () => void;
  /** Every Chrome tab group that currently exists, across all windows. */
  queryGroups(): Promise<ChromeGroupInfo[]>;
  /** Puts the given tabs into a new Chrome tab group titled `title`, returning its id. */
  createGroup(tabIds: readonly number[], title: string): Promise<number>;
  /** Adds the given tabs to an existing Chrome tab group. */
  addToGroup(tabIds: readonly number[], groupId: number): Promise<void>;
}

/** Converts Chrome's tab object into our narrower {@link TabInfo}. */
export function toTabInfo(tab: chrome.tabs.Tab): TabInfo {
  return {
    id: tab.id ?? -1,
    url: tab.url ?? '',
    title: tab.title ?? '',
    windowId: tab.windowId ?? -1,
    active: tab.active ?? false,
    index: tab.index ?? 0,
    groupId: tab.groupId ?? -1,
    pinned: tab.pinned ?? false,
  };
}

/** The production {@link BrowserTabs}, backed by the real Chrome APIs. */
export function createChromeBrowserTabs(): BrowserTabs {
  return {
    async queryAll(): Promise<TabInfo[]> {
      const tabs = await chrome.tabs.query({});
      return tabs.map(toTabInfo).filter((tab) => tab.id !== -1);
    },

    async queryCurrentWindow(): Promise<TabInfo[]> {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      return tabs.map(toTabInfo).filter((tab) => tab.id !== -1);
    },

    async close(tabIds: readonly number[]): Promise<void> {
      if (tabIds.length === 0) return;
      await chrome.tabs.remove([...tabIds]);
    },

    async activate(tabId: number, windowId: number): Promise<void> {
      await chrome.tabs.update(tabId, { active: true });
      await chrome.windows.update(windowId, { focused: true });
    },

    async create(url: string, index?: number): Promise<void> {
      await chrome.tabs.create(index === undefined ? { url, active: true } : { url, index, active: true });
    },

    async move(tabId: number, index: number): Promise<void> {
      await chrome.tabs.move(tabId, { index });
    },

    async currentWindowId(): Promise<number> {
      const win = await chrome.windows.getCurrent();
      return win.id ?? -1;
    },

    async currentTabId(): Promise<number> {
      const tab = await chrome.tabs.getCurrent();
      return tab?.id ?? -1;
    },

    onChanged(listener: () => void): () => void {
      const onCreated = (): void => listener();
      const onRemoved = (): void => listener();
      const onUpdated = (_id: number, change: chrome.tabs.TabChangeInfo): void => {
        // Ignore intermediate loading states; only URL changes and completed
        // loads can alter how a tab is grouped.
        if (change.url || change.status === 'complete') listener();
      };

      chrome.tabs.onCreated.addListener(onCreated);
      chrome.tabs.onRemoved.addListener(onRemoved);
      chrome.tabs.onUpdated.addListener(onUpdated);

      return () => {
        chrome.tabs.onCreated.removeListener(onCreated);
        chrome.tabs.onRemoved.removeListener(onRemoved);
        chrome.tabs.onUpdated.removeListener(onUpdated);
      };
    },

    async queryGroups(): Promise<ChromeGroupInfo[]> {
      const groups = await chrome.tabGroups.query({});
      return groups.map((group) => ({ id: group.id, title: group.title ?? '', color: group.color }));
    },

    async createGroup(tabIds: readonly number[], title: string): Promise<number> {
      const groupId = await chrome.tabs.group({ tabIds: [...tabIds] });
      await chrome.tabGroups.update(groupId, { title });
      return groupId;
    },

    async addToGroup(tabIds: readonly number[], groupId: number): Promise<void> {
      if (tabIds.length === 0) return;
      await chrome.tabs.group({ tabIds: [...tabIds], groupId });
    },
  };
}
