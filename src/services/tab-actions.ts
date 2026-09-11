/**
 * services/tab-actions.ts — every mutation Tab Out performs on your browser.
 *
 * A thin orchestration layer: the *decisions* live in `core/selection.ts` and
 * `core/grouping.ts`, and the *effects* go through the {@link BrowserTabs}
 * seam. That split is what makes this class testable with a fake browser.
 */

import type { BrowserTabs } from '../platform/browser';
import type { PinnedSite, TabGroup, TabInfo } from '../types';
import { selectDuplicateTabIds } from '../core/duplicates';
import { LANDING_GROUP_KEY, pinnedInsertIndex } from '../core/grouping';
import {
  findFocusTarget,
  selectStaleDashboardTabIds,
  selectTabIdsByExactUrl,
  selectTabIdsByHostname,
} from '../core/selection';
import { hostnameOf, isInternalUrl } from '../core/url';

export class TabActions {
  readonly #browser: BrowserTabs;

  constructor(browser: BrowserTabs) {
    this.#browser = browser;
  }

  /** All open tabs, normalised. */
  async getTabs(): Promise<TabInfo[]> {
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
   * Homepages and custom groups match by exact URL, because their keys are not
   * real hostnames and a hostname sweep would take unrelated tabs with it.
   * Plain domain cards match by hostname, which is the whole point of the card.
   */
  async closeGroup(group: TabGroup): Promise<number> {
    const urls = group.tabs.map((tab) => tab.url);
    const tabs = await this.#browser.queryAll();
    const useExact = group.kind !== 'domain' || group.key === LANDING_GROUP_KEY;
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
   * Enforces the "one dashboard" rule: closes every other Tab Out page so the
   * one you just opened is the only one left.
   */
  async closeOtherDashboards(dashboardUrls: readonly string[], keepTabId: number): Promise<number> {
    const tabs = await this.#browser.queryAll();
    const ids = selectStaleDashboardTabIds(tabs, dashboardUrls, keepTabId);
    await this.#browser.close(ids);
    return ids.length;
  }
}
