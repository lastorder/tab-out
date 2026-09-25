/**
 * core/auto-group.ts — deciding which ungrouped tabs should become a real
 * Chrome tab group.
 *
 * Pure decision logic: given the open tabs and settings, says which sets of
 * tab ids should be grouped and what to title each group. The actual
 * `chrome.tabs.group()` call is an effect, performed by
 * `services/tab-actions.ts` through `BrowserTabs.createGroup`.
 */

import type { TabInfo, TabOutSettings } from '../types';
import { groupDisplayTitle, groupTabs } from './grouping';
import { getRealTabs } from './grouping';

/** How many tabs a domain needs before auto-grouping kicks in. */
export const AUTO_GROUP_MIN_TABS = 2;

/** One group `chrome.tabs.group()` should create. */
export interface AutoGroupPlan {
  /** The domain card's key — informational, not used by the browser call. */
  key: string;
  /** Title to give the new Chrome tab group. */
  title: string;
  /** Ids of the tabs to put in it, in no particular order. */
  tabIds: number[];
}

/**
 * Computes which domain cards should become real Chrome tab groups.
 *
 * Only tabs that aren't already in *any* Chrome tab group are considered —
 * `chrome.tabs.group()` would silently move a tab out of an existing group,
 * and a tab the user manually grouped is exactly the case
 * `groupTabs()`'s chrome-group precedence exists to leave alone. Disposable
 * tabs are excluded the same way the dashboard itself excludes them from
 * domain cards, so grouping never scoops up a site's own disposable
 * homepage tab. A domain qualifies once it has `AUTO_GROUP_MIN_TABS` or more
 * qualifying tabs.
 */
export function planAutoGroups(
  tabs: readonly TabInfo[],
  settings: Pick<TabOutSettings, 'disposableEnabled' | 'disposableRules'>,
): AutoGroupPlan[] {
  const ungrouped = getRealTabs(tabs).filter((tab) => (tab.groupId ?? -1) === -1);
  const domainGroups = groupTabs(ungrouped, settings).filter((group) => group.kind === 'domain');

  return domainGroups
    .filter((group) => group.tabs.length >= AUTO_GROUP_MIN_TABS)
    .map((group) => ({
      key: group.key,
      title: groupDisplayTitle(group),
      tabIds: group.tabs.map((tab) => tab.id),
    }));
}
