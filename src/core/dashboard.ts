/**
 * core/dashboard.ts — identifying and positioning Tab Out's own tab.
 *
 * Two rules share the question "which open tab is the dashboard?":
 *   - only one dashboard may exist at a time
 *   - the dashboard stays rightmost, so new pages open to its left
 *
 * Both are decided here, purely, and executed by `TabActions`.
 */

import type { TabInfo } from '../types';

/**
 * Every URL that means "a Tab Out dashboard".
 *
 * Chrome reports an overridden new tab either as the extension page URL or,
 * depending on how it was opened, as `chrome://newtab/` — so both count.
 */
export function dashboardUrls(extensionId: string): string[] {
  return [
    `chrome-extension://${extensionId}/index.html`,
    `chrome-extension://${extensionId}/index.html#`,
    'chrome://newtab/',
  ];
}

/**
 * Returns the dashboard tab's id if it is open but no longer the last tab in
 * its window, or `null` when there is nothing to do.
 *
 * Chrome keeps the dashboard last on its own in the common case — inserting a
 * tab before the last one pushes that one's index up. The exception is a tab
 * appended *past* it, which is what duplicating the last tab does.
 */
export function findDashboardTabNeedingMove(
  tabs: readonly TabInfo[],
  dashboardUrls: readonly string[],
): number | null {
  const dashboard = tabs.find((tab) => dashboardUrls.includes(tab.url));
  if (!dashboard) return null;

  const sameWindow = tabs
    .filter((tab) => tab.windowId === dashboard.windowId)
    .sort((a, b) => a.index - b.index);
  const last = sameWindow[sameWindow.length - 1];

  return !last || last.id === dashboard.id ? null : dashboard.id;
}
