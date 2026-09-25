/**
 * core/selection.ts — deciding *which* tabs an action applies to.
 *
 * Kept separate from the service that actually calls `chrome.tabs.remove`, so
 * the risky part (picking tabs to close) is pure and exhaustively testable.
 */

import type { TabGroup, TabInfo } from '../types';
import { hostnameOf } from './url';

/**
 * Selects tabs to close for a Chrome-tab-group card: every currently open
 * tab whose live `groupId` matches, not the snapshot the card was rendered
 * with — a tab could have joined or left the group since the last render.
 */
export function selectTabIdsByGroupId(
  tabs: readonly TabInfo[],
  chromeGroupId: number,
): number[] {
  return tabs.filter((tab) => (tab.groupId ?? -1) === chromeGroupId).map((tab) => tab.id);
}

/**
 * Selects tabs to close for a domain card.
 *
 * Hostname matching is intentional here: closing the "GitHub" card should take
 * every GitHub tab with it. `file://` URLs have no hostname, so they fall back
 * to exact matching.
 */
export function selectTabIdsByHostname(
  tabs: readonly TabInfo[],
  urls: readonly string[],
): number[] {
  const hostnames = new Set<string>();
  const exactUrls = new Set<string>();

  for (const url of urls) {
    if (url.startsWith('file://')) {
      exactUrls.add(url);
      continue;
    }
    const host = hostnameOf(url);
    if (host) hostnames.add(host);
  }

  return tabs
    .filter((tab) => {
      if (tab.url.startsWith('file://')) return exactUrls.has(tab.url);
      const host = hostnameOf(tab.url);
      return host !== '' && hostnames.has(host);
    })
    .map((tab) => tab.id);
}

/**
 * Selects tabs by exact URL.
 *
 * Used for the Disposable card: closing "Gmail inbox" must not also close the
 * email threads you have open on the same hostname.
 */
export function selectTabIdsByExactUrl(
  tabs: readonly TabInfo[],
  urls: readonly string[],
): number[] {
  const wanted = new Set(urls);
  return tabs.filter((tab) => wanted.has(tab.url)).map((tab) => tab.id);
}

/**
 * Finds the tab to jump to when a chip is clicked.
 *
 * Exact URL wins; otherwise any tab on the same hostname. When several match,
 * a tab in a *different* window is preferred so the click visibly switches
 * windows instead of appearing to do nothing.
 */
export function findFocusTarget(
  tabs: readonly TabInfo[],
  url: string,
  currentWindowId: number,
): TabInfo | null {
  if (!url) return null;

  let matches = tabs.filter((tab) => tab.url === url);

  if (matches.length === 0) {
    const targetHost = hostnameOf(url);
    if (!targetHost) return null;
    matches = tabs.filter((tab) => hostnameOf(tab.url) === targetHost);
  }

  if (matches.length === 0) return null;
  return matches.find((tab) => tab.windowId !== currentWindowId) ?? matches[0]!;
}

/**
 * Picks the stale Tab Out pages to close when a new one opens.
 *
 * Tab Out is a singleton dashboard: opening a new tab should leave exactly one
 * Tab Out page alive — the one you are looking at. Every other copy, in any
 * window, is closed automatically. This replaces the old "Close extras" banner,
 * which asked the user to do by hand what now happens on its own.
 */
export function selectStaleDashboardTabIds(
  tabs: readonly TabInfo[],
  dashboardUrls: readonly string[],
  keepTabId: number,
): number[] {
  const dashboardSet = new Set(dashboardUrls);
  return tabs
    .filter((tab) => tab.id !== keepTabId && dashboardSet.has(tab.url))
    .map((tab) => tab.id);
}

/**
 * Computes the desired tab-bar order from the dashboard's group order,
 * restricted to one window.
 *
 * Chrome-tab-group cards are skipped entirely: those tabs are already
 * ordered and kept contiguous by Chrome itself, and the user arranged that
 * group on purpose. Folding them into the auto-sort/"Sort tabs" move plan
 * would mean issuing `chrome.tabs.move()` calls that shuffle a group's tabs
 * to match the dashboard's card order (alphabetical-ish, not the user's own
 * arrangement) — actively fighting the group instead of leaving it alone.
 */
export function desiredTabOrder(
  groups: readonly Pick<TabGroup, 'kind' | 'tabs'>[],
  windowId: number,
): number[] {
  const order: number[] = [];
  for (const group of groups) {
    if (group.kind === 'chrome-group') continue;
    const windowTabs = group.tabs
      .filter((tab) => tab.windowId === windowId)
      .sort((a, b) => a.index - b.index);
    order.push(...windowTabs.map((tab) => tab.id));
  }
  return order;
}

/**
 * Ids of every tab currently rendered under a Chrome-tab-group card.
 *
 * Used to keep the "actual tab order" side of the sort-mismatch check
 * consistent with {@link desiredTabOrder}, which leaves those same tabs out
 * of the desired side — comparing a filtered list against an unfiltered one
 * would report a mismatch (and re-trigger auto-sort) for no reason.
 */
export function chromeGroupedTabIds(groups: readonly Pick<TabGroup, 'kind' | 'tabs'>[]): Set<number> {
  const ids = new Set<number>();
  for (const group of groups) {
    if (group.kind !== 'chrome-group') continue;
    for (const tab of group.tabs) ids.add(tab.id);
  }
  return ids;
}

/** True when the real tab-bar order differs from the dashboard's order. */
export function needsSorting(actual: readonly number[], desired: readonly number[]): boolean {
  if (desired.length <= 1) return false;
  if (actual.length !== desired.length) return true;
  return actual.some((id, i) => id !== desired[i]);
}
