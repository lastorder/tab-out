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
 * Whether Tab Out may reposition this tab in the tab bar.
 *
 * Two kinds of tab are off limits, and for the same underlying reason — the
 * user has already placed them deliberately, and Chrome enforces structure
 * around them that a naive `chrome.tabs.move()` would break:
 *
 *   - **pinned** tabs live in a reserved region at the front of the tab bar
 *     that cannot interleave with ordinary tabs; Chrome clamps any attempt to
 *     move one out of it, so a move plan that includes them is meaningless.
 *   - **grouped** tabs are kept contiguous and ordered by Chrome itself. The
 *     group is the user's own arrangement, and moving a member would either
 *     be refused or would drag the whole group.
 */
export function isMovableTab(tab: Pick<TabInfo, 'pinned' | 'groupId'>): boolean {
  return tab.pinned !== true && (tab.groupId ?? -1) === -1;
}

/** One repositioning: put `tabId` at `index`. */
export interface TabMove {
  tabId: number;
  index: number;
}

/**
 * Every movable tab in a window, in tab-bar order.
 *
 * These are the only tabs {@link planTabSort} will ever move, and their
 * current indices are the only positions it will ever move them *to*.
 */
export function movableTabsInWindow(
  windowTabs: readonly TabInfo[],
  windowId: number,
): TabInfo[] {
  return windowTabs
    .filter((tab) => tab.windowId === windowId && isMovableTab(tab))
    .sort((a, b) => a.index - b.index);
}

/**
 * Computes the desired tab-bar order from the dashboard's group order,
 * restricted to one window.
 *
 * Chrome-tab-group cards are skipped entirely, and so are pinned tabs — see
 * {@link isMovableTab}. Both are the user's own arrangement, and neither can
 * be reordered by `chrome.tabs.move()` without fighting Chrome's own rules
 * about where they may sit.
 */
export function desiredTabOrder(
  groups: readonly Pick<TabGroup, 'kind' | 'tabs'>[],
  windowId: number,
): number[] {
  const order: number[] = [];
  for (const group of groups) {
    if (group.kind === 'chrome-group') continue;
    const windowTabs = group.tabs
      .filter((tab) => tab.windowId === windowId && isMovableTab(tab))
      .sort((a, b) => a.index - b.index);
    order.push(...windowTabs.map((tab) => tab.id));
  }
  return order;
}

/**
 * Turns "these movable tabs, in this order" into the concrete list of moves
 * that gets there — **without ever moving a pinned or grouped tab, and
 * without ever changing the index range any of them occupies.**
 *
 * The tab bar is treated as a series of fixed blocks (Chrome's pinned region,
 * each tab group) separated by *runs* of movable tabs. A run is a maximal set
 * of consecutive indices held by movable tabs. Sorting only ever permutes a
 * run's **own members** among the positions that run already occupies:
 *
 *   - a move targets a position inside the run the tab came from, so the
 *     shift it causes is confined to that run — fixed blocks outside it are
 *     never touched, and their positions are bit-for-bit unchanged. That is
 *     what stops a group being "pushed aside" by a sort, which is exactly
 *     what the old absolute-index version of this did;
 *   - a run's membership is therefore also fixed. A tab is never moved
 *     *across* a fixed block, even when the dashboard would rather it led the
 *     whole tab bar — reaching that position would mean dragging it past a
 *     group, which is the thing being avoided.
 *
 * The cost is that each run is sorted only relative to itself: a loose tab
 * stranded on its own before a group stays before that group, however late
 * it falls in dashboard order. The benefit is that the tab bar's skeleton is
 * entirely the user's, and sorting can never surprise them by rearranging
 * their groups.
 *
 * Returns `[]` when nothing needs to move, which is also the caller's
 * "in order" signal — there is no separate mismatch test, because the only
 * order this function can reach is the one it just computed, and comparing
 * against anything else would report a difference that could never be fixed
 * (and so would re-sort forever).
 */
export function planTabSort(
  windowTabs: readonly TabInfo[],
  windowId: number,
  desiredIds: readonly number[],
): TabMove[] {
  const movable = movableTabsInWindow(windowTabs, windowId);
  if (movable.length <= 1) return [];

  const desiredPosition = new Map(desiredIds.map((id, i) => [id, i]));
  const rankOf = (id: number): number => desiredPosition.get(id) ?? Number.MAX_SAFE_INTEGER;

  // Split the movable tabs' indices into maximal consecutive runs.
  const runs: TabInfo[][] = [];
  for (const tab of movable) {
    const current = runs[runs.length - 1];
    if (current && current[current.length - 1]!.index === tab.index - 1) current.push(tab);
    else runs.push([tab]);
  }

  const moves: TabMove[] = [];
  for (const run of runs) {
    if (run.length <= 1) continue; // a lone tab has no run-mate to swap with

    // The ids in this run, in the order they currently sit in.
    const currentIds = run.map((tab) => tab.id);
    const orderedIds = [...currentIds].sort((a, b) => rankOf(a) - rankOf(b));

    for (let i = 0; i < run.length; i++) {
      const wantedId = orderedIds[i]!;
      if (currentIds[i] === wantedId) continue;

      moves.push({ tabId: wantedId, index: run[i]!.index });
      // Replay the move locally: pull the tab out of its current slot in the
      // run and drop it into position `i`. Everything after `i` is still
      // unsettled, so this is the whole bookkeeping needed.
      currentIds.splice(currentIds.indexOf(wantedId), 1);
      currentIds.splice(i, 0, wantedId);
    }
  }

  return moves;
}
