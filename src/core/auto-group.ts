/**
 * core/auto-group.ts — deciding which Chrome tab groups the open tabs should
 * belong to.
 *
 * Pure decision logic: given the open tabs and settings, says which tabs
 * should be swept into a Chrome tab group, and whether that means creating a
 * new group or joining one that already exists. The actual
 * `chrome.tabs.group()` call is an effect, performed by
 * `services/tab-actions.ts` through `BrowserTabs`.
 */

import type { TabInfo, TabOutSettings } from '../types';
import { groupDisplayTitle } from './grouping';
import { getRealTabs } from './grouping';
import { isDisposable } from './matching';
import { groupKeyOf } from './url';

/** How many tabs a domain needs before a *new* group is created for it. */
export const AUTO_GROUP_MIN_TABS = 2;

/**
 * `'\u0000'`-joined composite key for "this domain, in this window".
 *
 * A Chrome tab group belongs to exactly one window and `chrome.tabs.group()`
 * refuses tabs spanning windows, so every bucket and every existing-group
 * lookup here is scoped per window — `groupKeyOf` alone is not enough.
 */
function windowDomainKey(windowId: number, domainKey: string): string {
  return `${windowId}\u0000${domainKey}`;
}

/**
 * One thing the sweep should do: put `tabIds` into a brand-new Chrome tab
 * group titled `title`, or add them to an existing one.
 *
 * The two variants are what keep a domain from ending up with two groups:
 * once a domain group exists, later tabs *join* it rather than seeding a
 * second one (see {@link planTabGrouping}).
 */
export type TabGroupingAction =
  | {
      kind: 'create';
      /** The domain card's key — informational, not used by the browser call. */
      key: string;
      /** Title to give the new Chrome tab group. */
      title: string;
      /** The window the new group belongs to. */
      windowId: number;
      /** Ids of the tabs to put in it. */
      tabIds: number[];
    }
  | {
      kind: 'adopt';
      /** The domain card's key — informational, not used by the browser call. */
      key: string;
      /** The id of the existing Chrome tab group to add these tabs to. */
      groupId: number;
      /** The window that group lives in. */
      windowId: number;
      /** Ids of the tabs to add. */
      tabIds: number[];
    };

/**
 * Maps each existing Chrome tab group to the one domain it stands for, keyed
 * by window + domain.
 *
 * A group only counts as a *domain* group when every tab in it that has a
 * parseable URL shares a single registrable domain. A group the user built
 * by hand out of several unrelated sites is deliberately not a match: moving
 * a fresh tab into it because one of its members happened to share a domain
 * would be guessing at the user's intent, and the whole point of the
 * chrome-group precedence in `groupTabs()` is that a manual group is left
 * exactly as the user made it.
 */
function domainGroupsByWindowDomain(tabs: readonly TabInfo[]): Map<string, number> {
  const domainsByGroup = new Map<number, { keys: Set<string>; windowId: number }>();

  for (const tab of tabs) {
    const groupId = tab.groupId ?? -1;
    if (groupId === -1) continue;
    const key = groupKeyOf(tab.url);
    if (!key) continue;

    const entry = domainsByGroup.get(groupId) ?? { keys: new Set<string>(), windowId: tab.windowId };
    entry.keys.add(key);
    domainsByGroup.set(groupId, entry);
  }

  const byWindowDomain = new Map<string, number>();
  for (const [groupId, { keys, windowId }] of domainsByGroup) {
    if (keys.size !== 1) continue;
    const [key] = [...keys];
    const composite = windowDomainKey(windowId, key!);
    // First entry wins; two same-domain groups in one window is already the
    // state we are trying to avoid creating, not one to add more into.
    if (!byWindowDomain.has(composite)) byWindowDomain.set(composite, groupId);
  }
  return byWindowDomain;
}

/**
 * Computes every grouping action the sweep should take.
 *
 * Only tabs that aren't already in *any* Chrome tab group are considered —
 * `chrome.tabs.group()` would silently move a tab out of an existing group,
 * and a tab the user manually grouped is exactly the case `groupTabs()`'s
 * chrome-group precedence exists to leave alone. Disposable tabs are
 * excluded the same way the dashboard itself excludes them from domain
 * cards, so grouping never scoops up a site's own disposable homepage tab.
 *
 * Those ungrouped tabs are bucketed by registrable domain *and window*, then
 * each bucket takes one of two paths:
 *
 *   - the domain already has a group in that window → **adopt**: the tabs
 *     join it, however few of them there are. This is what a newly opened
 *     tab of an already-grouped site needs, and it is also what stops a
 *     domain from ending up with two groups — counting only *ungrouped*
 *     tabs meant two fresh tabs of an already-grouped domain looked like a
 *     brand-new domain and seeded a duplicate group.
 *   - the domain has no group yet → **create**, but only once the bucket has
 *     `AUTO_GROUP_MIN_TABS` or more tabs.
 */
export function planTabGrouping(
  tabs: readonly TabInfo[],
  settings: Pick<TabOutSettings, 'disposableEnabled' | 'disposableRules'>,
): TabGroupingAction[] {
  const realTabs = getRealTabs(tabs);
  const existingDomainGroups = domainGroupsByWindowDomain(realTabs);

  const buckets = new Map<
    string,
    { key: string; windowId: number; tabs: TabInfo[] }
  >();

  for (const tab of realTabs) {
    if ((tab.groupId ?? -1) !== -1) continue;
    // A pinned tab must never be swept into a group: Chrome un-pins a tab the
    // moment it joins one, so grouping it would silently undo the user's pin.
    if (tab.pinned === true) continue;
    if (settings.disposableEnabled && isDisposable(tab.url, settings.disposableRules)) continue;

    const key = groupKeyOf(tab.url);
    if (!key) continue;

    const composite = windowDomainKey(tab.windowId, key);
    const bucket = buckets.get(composite) ?? { key, windowId: tab.windowId, tabs: [] };
    bucket.tabs.push(tab);
    buckets.set(composite, bucket);
  }

  const actions: TabGroupingAction[] = [];
  for (const [composite, bucket] of buckets) {
    const tabIds = bucket.tabs.map((tab) => tab.id);
    const existingGroupId = existingDomainGroups.get(composite);

    if (existingGroupId !== undefined) {
      actions.push({ kind: 'adopt', key: bucket.key, groupId: existingGroupId, windowId: bucket.windowId, tabIds });
      continue;
    }

    if (bucket.tabs.length >= AUTO_GROUP_MIN_TABS) {
      actions.push({
        kind: 'create',
        key: bucket.key,
        title: groupDisplayTitle({ key: bucket.key }),
        windowId: bucket.windowId,
        tabIds,
      });
    }
  }

  return actions;
}
