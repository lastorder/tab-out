/**
 * newtab/singleton.ts — "there can be only one dashboard".
 *
 * Tab Out is a place you pass through, not a tab you collect. Previously the
 * dashboard noticed extra copies of itself and showed a "Close extras" banner
 * asking you to clean them up. That banner is gone: opening a new Tab Out page
 * now closes every other one automatically.
 */

import type { BrowserTabs } from '../platform/browser';
import type { TabActions } from '../services/tab-actions';
import { dashboardUrls } from '../core/dashboard';

export { dashboardUrls };

/**
 * Closes every Tab Out page except the one calling this.
 *
 * Never throws: if the browser refuses (e.g. the tab id is unavailable), the
 * dashboard still renders normally.
 *
 * @returns how many stale dashboards were closed.
 */
export async function enforceSingleDashboard(
  browser: BrowserTabs,
  tabActions: TabActions,
  extensionId: string,
): Promise<number> {
  try {
    const currentTabId = await browser.currentTabId();
    if (currentTabId === -1) return 0;
    return await tabActions.closeOtherDashboards(dashboardUrls(extensionId), currentTabId);
  } catch {
    return 0;
  }
}
