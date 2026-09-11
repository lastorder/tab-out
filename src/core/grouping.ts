/**
 * core/grouping.ts — the heart of the dashboard.
 *
 * Pure functions that turn a flat list of open tabs plus the user's settings
 * into the exact ordered list of cards the UI should render. Because nothing
 * here touches `chrome.*` or the DOM, the whole layout algorithm is unit
 * testable with plain objects.
 */

import type { PinnedSite, TabGroup, TabInfo, TabOutSettings } from '../types';
import { findCustomGroup, isLandingDomain, isLandingPage } from './matching';
import { groupKeyOf, hostnameOf, isInternalUrl } from './url';

/** Reserved key for the synthetic "Homepages" card. */
export const LANDING_GROUP_KEY = '__landing-pages__';

/** Display name for the synthetic "Homepages" card. */
export const LANDING_GROUP_LABEL = 'Homepages';

/** One rendered card: either a real group of tabs or a pinned placeholder. */
export type DashboardEntry =
  | { type: 'group'; group: TabGroup }
  | { type: 'placeholder'; site: PinnedSite; pinnedIndex: number };

/** Everything the renderer needs for one paint of the dashboard. */
export interface DashboardModel {
  /** Cards in render order: pinned sites first, then the rest by size. */
  entries: DashboardEntry[];
  /** Just the groups, in render order. Drives the "sort tabs" feature. */
  orderedGroups: TabGroup[];
  /** Tabs that are real web pages (the denominator for "close all N tabs"). */
  realTabs: TabInfo[];
  /** Number of group cards (placeholders excluded). */
  groupCount: number;
}

/** Filters out browser-internal pages — chrome://, extension pages, about:. */
export function getRealTabs(tabs: readonly TabInfo[]): TabInfo[] {
  return tabs.filter((tab) => !isInternalUrl(tab.url));
}

/**
 * Buckets tabs into groups and sorts them.
 *
 * Precedence per tab: homepage patterns win, then custom-group rules, then a
 * plain hostname bucket. Homepages are pulled out first so that closing the
 * "Homepages" card never takes content tabs from the same domain with it.
 */
export function groupTabs(
  tabs: readonly TabInfo[],
  settings: Pick<TabOutSettings, 'landingPatterns' | 'customGroups'>,
): TabGroup[] {
  const { landingPatterns, customGroups } = settings;
  const byKey = new Map<string, TabGroup>();
  const landingTabs: TabInfo[] = [];

  const ensureGroup = (key: string, kind: TabGroup['kind'], label?: string): TabGroup => {
    let group = byKey.get(key);
    if (!group) {
      group = label === undefined ? { key, kind, tabs: [] } : { key, kind, label, tabs: [] };
      byKey.set(key, group);
    }
    return group;
  };

  for (const tab of tabs) {
    if (isLandingPage(tab.url, landingPatterns)) {
      landingTabs.push(tab);
      continue;
    }

    const customRule = findCustomGroup(tab.url, customGroups);
    if (customRule) {
      ensureGroup(customRule.groupKey, 'custom', customRule.groupLabel).tabs.push(tab);
      continue;
    }

    const key = groupKeyOf(tab.url);
    if (!key) continue;
    ensureGroup(key, 'domain').tabs.push(tab);
  }

  if (landingTabs.length > 0) {
    byKey.set(LANDING_GROUP_KEY, {
      key: LANDING_GROUP_KEY,
      kind: 'landing',
      label: LANDING_GROUP_LABEL,
      tabs: landingTabs,
    });
  }

  return sortGroups([...byKey.values()], landingPatterns);
}

/**
 * Orders groups for display: the Homepages card first, then domains that the
 * user's homepage rules mention, then the biggest groups. Ties break on key so
 * the layout does not shuffle between renders.
 */
export function sortGroups(
  groups: readonly TabGroup[],
  landingPatterns: TabOutSettings['landingPatterns'],
): TabGroup[] {
  return [...groups].sort((a, b) => {
    const aLanding = a.key === LANDING_GROUP_KEY;
    const bLanding = b.key === LANDING_GROUP_KEY;
    if (aLanding !== bLanding) return aLanding ? -1 : 1;

    const aPriority = isLandingDomain(a.key, landingPatterns);
    const bPriority = isLandingDomain(b.key, landingPatterns);
    if (aPriority !== bPriority) return aPriority ? -1 : 1;

    if (b.tabs.length !== a.tabs.length) return b.tabs.length - a.tabs.length;
    return a.key.localeCompare(b.key);
  });
}

/**
 * Places pinned sites at the front of the dashboard.
 *
 * For each pinned site, in the user's configured order:
 *   1. If a domain group already exists for its hostname, promote that group.
 *   2. Otherwise, if any open tab matches the hostname (it may be sitting in
 *      the Homepages card), build a synthetic group from those tabs and take
 *      them away from whichever group currently holds them, so no tab is
 *      rendered twice.
 *   3. Otherwise, render a click-to-open placeholder card.
 */
export function applyPinnedSites(
  groups: readonly TabGroup[],
  realTabs: readonly TabInfo[],
  pinnedSites: readonly PinnedSite[],
): { entries: DashboardEntry[]; orderedGroups: TabGroup[] } {
  let remaining = groups.map((group) => ({ ...group, tabs: [...group.tabs] }));
  const entries: DashboardEntry[] = [];
  const orderedGroups: TabGroup[] = [];

  pinnedSites.forEach((site, pinnedIndex) => {
    const hostname = hostnameOf(site.url);
    if (!hostname) return;

    const existingIdx = remaining.findIndex(
      (group) => group.kind === 'domain' && group.key === hostname,
    );

    if (existingIdx !== -1) {
      const [group] = remaining.splice(existingIdx, 1);
      const promoted: TabGroup = site.label ? { ...group!, label: site.label } : group!;
      entries.push({ type: 'group', group: promoted });
      orderedGroups.push(promoted);
      return;
    }

    const matchingTabs = realTabs.filter((tab) => hostnameOf(tab.url) === hostname);
    if (matchingTabs.length === 0) {
      entries.push({ type: 'placeholder', site, pinnedIndex });
      return;
    }

    const synthetic: TabGroup = {
      key: hostname,
      kind: 'domain',
      ...(site.label ? { label: site.label } : {}),
      tabs: matchingTabs,
    };
    entries.push({ type: 'group', group: synthetic });
    orderedGroups.push(synthetic);

    // Reclaim these tabs from whichever group (usually Homepages) held them.
    const claimed = new Set(matchingTabs.map((tab) => tab.id));
    remaining = remaining
      .map((group) => ({ ...group, tabs: group.tabs.filter((tab) => !claimed.has(tab.id)) }))
      .filter((group) => group.tabs.length > 0);
  });

  for (const group of remaining) {
    entries.push({ type: 'group', group });
    orderedGroups.push(group);
  }

  return { entries, orderedGroups };
}

/** One-shot: open tabs + settings → the complete render model. */
export function buildDashboardModel(
  tabs: readonly TabInfo[],
  settings: TabOutSettings,
): DashboardModel {
  const realTabs = getRealTabs(tabs);
  const groups = groupTabs(realTabs, settings);
  const { entries, orderedGroups } = applyPinnedSites(groups, realTabs, settings.pinnedSites);
  return { entries, orderedGroups, realTabs, groupCount: orderedGroups.length };
}

/**
 * Chooses the tab-bar position for a pinned site that is about to be opened:
 * immediately after the nearest already-open pinned sibling, so the tab bar
 * gradually settles into the same order as the dashboard.
 */
export function pinnedInsertIndex(
  pinnedSites: readonly PinnedSite[],
  pinnedIndex: number,
  windowTabs: readonly TabInfo[],
): number {
  for (let i = pinnedIndex - 1; i >= 0; i--) {
    const siblingHost = hostnameOf(pinnedSites[i]?.url);
    if (!siblingHost) continue;
    const siblingTab = windowTabs.find((tab) => hostnameOf(tab.url) === siblingHost);
    if (siblingTab) return siblingTab.index + 1;
  }
  return 0;
}
