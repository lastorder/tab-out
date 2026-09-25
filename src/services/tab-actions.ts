/**
 * services/tab-actions.ts — every mutation Tab Out performs on your browser.
 *
 * A thin orchestration layer: the *decisions* live in `core/selection.ts` and
 * `core/grouping.ts`, and the *effects* go through the {@link BrowserTabs}
 * seam. That split is what makes this class testable with a fake browser.
 */

import type { BrowserTabs } from '../platform/browser';
import type { PinnedSite, TabGroup, TabInfo, TabOutSettings } from '../types';
import { planTabGrouping } from '../core/auto-group';
import { selectDuplicateTabIds } from '../core/duplicates';
import { pinnedInsertIndex } from '../core/grouping';
import { findDashboardTabNeedingMove } from '../core/dashboard';
import {
  findFocusTarget,
  selectStaleDashboardTabIds,
  selectTabIdsByExactUrl,
  selectTabIdsByGroupId,
  selectTabIdsByHostname,
} from '../core/selection';
import { hostnameOf, isInternalUrl } from '../core/url';

export class TabActions {
  readonly #browser: BrowserTabs;

  constructor(browser: BrowserTabs) {
    this.#browser = browser;
  }

  /**
   * Every open tab across all windows.
   *
   * Exposed so a caller that must *decide* something from the tab list — the
   * global-shortcut handler asking "is a dashboard already open?" — can do so
   * through this seam rather than reaching for `chrome.tabs` itself.
   */
  async queryAllTabs(): Promise<TabInfo[]> {
    return this.#browser.queryAll();
  }

  /** Closes one tab by exact URL. Returns true when something was closed. */
  async closeByUrl(url: string): Promise<boolean> {
    const tabs = await this.#browser.queryAll();
    const match = tabs.find((tab) => tab.url === url);
    if (!match) return false;
    await this.#browser.close([match.id]);
    return true;
  }

  /**
   * Closes an entire group.
   *
   * The Disposable card matches by exact URL, because its key is not a real
   * hostname and a hostname sweep would take unrelated tabs with it. A
   * Chrome-tab-group card matches by the live `groupId`, since two tabs can
   * share a hostname but sit in different (or no) Chrome group. Plain
   * domain cards match by hostname, which is the whole point of the card.
   */
  async closeGroup(group: TabGroup): Promise<number> {
    const tabs = await this.#browser.queryAll();

    if (group.kind === 'chrome-group' && group.chromeGroupId !== undefined) {
      const ids = selectTabIdsByGroupId(tabs, group.chromeGroupId);
      await this.#browser.close(ids);
      return ids.length;
    }

    const urls = group.tabs.map((tab) => tab.url);
    const useExact = group.kind === 'disposable';
    const ids = useExact
      ? selectTabIdsByExactUrl(tabs, urls)
      : selectTabIdsByHostname(tabs, urls);
    await this.#browser.close(ids);
    return ids.length;
  }

  /** Closes every real web tab, leaving browser-internal pages alone. */
  async closeAllRealTabs(): Promise<number> {
    const tabs = await this.#browser.queryAll();
    const ids = tabs.filter((tab) => !isInternalUrl(tab.url)).map((tab) => tab.id);
    await this.#browser.close(ids);
    return ids.length;
  }

  /**
   * Closes an already-computed set of tab ids — used by "Tidy up", whose
   * selection logic lives in `core/tidy.ts` since it's a pure decision, not
   * a browser effect.
   */
  async closeTabs(tabIds: readonly number[]): Promise<void> {
    await this.#browser.close(tabIds);
  }

  /** Closes duplicate copies of the given URLs, keeping one of each by default. */
  async closeDuplicates(urls: readonly string[], keepOne = true): Promise<number> {
    const tabs = await this.#browser.queryAll();
    const ids = selectDuplicateTabIds(tabs, urls, keepOne);
    await this.#browser.close(ids);
    return ids.length;
  }

  /** Jumps to the tab showing this URL, switching windows if necessary. */
  async focus(url: string): Promise<boolean> {
    const [tabs, currentWindowId] = await Promise.all([
      this.#browser.queryAll(),
      this.#browser.currentWindowId(),
    ]);
    const target = findFocusTarget(tabs, url, currentWindowId);
    if (!target) return false;
    await this.#browser.activate(target.id, target.windowId);
    return true;
  }

  /**
   * Opens a pinned site. If it is already open anywhere, focuses that tab
   * instead of creating a second one; otherwise inserts the new tab next to
   * its nearest open pinned neighbour.
   */
  async openPinnedSite(
    site: PinnedSite,
    pinnedIndex: number,
    pinnedSites: readonly PinnedSite[],
  ): Promise<void> {
    const hostname = hostnameOf(site.url);
    const windowTabs = await this.#browser.queryCurrentWindow();

    if (hostname) {
      const existing = windowTabs.find((tab) => hostnameOf(tab.url) === hostname);
      if (existing) {
        await this.#browser.activate(existing.id, existing.windowId);
        return;
      }
    }

    const index = pinnedInsertIndex(pinnedSites, pinnedIndex, windowTabs);
    await this.#browser.create(site.url, index);
  }

  /** Rearranges the tab bar to match the dashboard's card order. */
  async sortTabs(orderedTabIds: readonly number[]): Promise<void> {
    for (let i = 0; i < orderedTabIds.length; i++) {
      await this.#browser.move(orderedTabIds[i]!, i);
    }
  }

  /**
   * Opens a tab for a URL the dashboard doesn't already know a tab id for —
   * a saved-for-later bookmark, or a history entry. Used instead of a plain
   * `<a href>` link because Chrome blocks top-level navigation to `file://`
   * from an extension page; going through `chrome.tabs.create` avoids that.
   *
   * If a tab showing that exact URL is already open somewhere, focuses it
   * instead of creating a duplicate. Otherwise opens a new tab at the end of
   * the tab bar.
   *
   * @returns `'focused'` when an existing tab was activated, `'created'` when
   * a new one was opened, or `'failed'` when Chrome refused to open it — the
   * one common case is a `file://` URL and the extension lacking "Allow
   * access to file URLs" in `chrome://extensions`.
   */
  async openOrFocusTab(url: string): Promise<'focused' | 'created' | 'failed'> {
    const tabs = await this.#browser.queryAll();
    const existing = tabs.find((tab) => tab.url === url);
    if (existing) {
      await this.#browser.activate(existing.id, existing.windowId);
      return 'focused';
    }
    try {
      await this.#browser.create(url);
      return 'created';
    } catch {
      return 'failed';
    }
  }

  /**
   * Enforces the "one dashboard" rule: closes every other Tab Out page so the
   * page calling this is the only one left.
   *
   * Never throws — if the browser can't say which tab we are, the dashboard
   * should still render.
   *
   * @returns how many stale dashboards were closed.
   */
  async keepOnlyThisDashboard(dashboardUrls: readonly string[]): Promise<number> {
    try {
      const keepTabId = await this.#browser.currentTabId();
      if (keepTabId === -1) return 0;
      const tabs = await this.#browser.queryAll();
      const ids = selectStaleDashboardTabIds(tabs, dashboardUrls, keepTabId);
      await this.#browser.close(ids);
      return ids.length;
    } catch {
      return 0;
    }
  }

  /**
   * When auto-grouping is enabled, brings the browser's real Chrome tab
   * groups in line with the dashboard: any ungrouped domain bucket with 2+
   * tabs becomes a new Chrome tab group, and any ungrouped tab whose domain
   * already has one *joins* that group instead — see
   * `core/auto-group.ts#planTabGrouping`.
   *
   * A no-op (never queries or touches the browser) when the setting is off.
   *
   * @returns how many grouping actions were applied.
   */
  async runAutoGroup(settings: Pick<TabOutSettings, 'autoGroupEnabled' | 'disposableEnabled' | 'disposableRules'>): Promise<number> {
    if (!settings.autoGroupEnabled) return 0;
    const tabs = await this.#browser.queryAll();
    const actions = planTabGrouping(tabs, settings);

    let applied = 0;
    for (const action of actions) {
      if (action.tabIds.length === 0) continue;
      if (action.kind === 'create') {
        await this.#browser.createGroup(action.tabIds, action.title);
      } else {
        await this.#browser.addToGroup(action.tabIds, action.groupId);
      }
      applied++;
    }
    return applied;
  }

  /**
   * Keeps the dashboard pinned to the rightmost tab of its window, so any
   * newly opened page lands to its left.
   *
   * @returns `true` when the dashboard was moved, `false` when there was
   * nothing to do — no dashboard tab is open, or it was already last.
   */
  async moveDashboardToEnd(dashboardUrls: readonly string[]): Promise<boolean> {
    const tabs = await this.#browser.queryAll();
    const tabId = findDashboardTabNeedingMove(tabs, dashboardUrls);
    if (tabId === null) return false;
    await this.#browser.move(tabId, -1);
    return true;
  }
}
