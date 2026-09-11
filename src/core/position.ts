/**
 * core/position.ts — keeping the dashboard pinned to the end of the tab bar.
 *
 * The rule: any newly-opened page should land to the *left* of Tab Out,
 * never to its right — the dashboard is always the rightmost tab in its
 * window. Chrome already gets this right in the common case: inserting a
 * tab before the current last tab pushes that tab's index up, so it stays
 * last automatically. The one time it doesn't is when a tab is appended
 * *past* the current last tab — duplicating the last tab is the main way
 * that happens. This module decides whether the dashboard needs to move;
 * `TabActions.moveDashboardToEnd` performs the move.
 */

import type { TabInfo } from '../types';

/**
 * Returns the dashboard tab's id if one is open and it is not already the
 * last tab in its window, or `null` when there is nothing to do — either no
 * dashboard tab is open, or it is already at the end.
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

  if (!last || last.id === dashboard.id) return null;
  return dashboard.id;
}
