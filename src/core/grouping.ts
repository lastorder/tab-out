/**
 * core/grouping.ts — the heart of the dashboard.
 *
 * Pure functions that turn a flat list of open tabs plus the user's settings
 * into the exact ordered list of cards the UI should render, plus the pinned
 * strip's contents. Because nothing here touches `chrome.*` or the DOM, the
 * whole layout algorithm is unit testable with plain objects.
 */

import type { PinnedSite, TabGroup, TabInfo, DisposableRule, TabOutSettings } from '../types';
import { isDisposable, isDisposableDomain } from './matching';
import { groupKeyOf, hostnameOf, isInternalUrl } from './url';

/** Reserved key for the synthetic "Disposable" card. */
export const DISPOSABLE_GROUP_KEY = '__disposable__';

/** Display name for the synthetic "Disposable" card. */
export const DISPOSABLE_GROUP_LABEL = 'Disposable';

/**
 * One entry in the "Pinned" strip shown above the grid.
 *
 * Pinning is tab-level: `tab` is the pinned site's matching open tab, if any
 * — it is *not* a separate card, and it is still rendered in its own domain
 * group below like any other tab. When nothing matches, `tab` is `null` and
 * the strip renders a click-to-open placeholder chip instead.
 */
export interface PinnedStripItem {
  site: PinnedSite;
  pinnedIndex: number;
  tab: TabInfo | null;
}

/** Everything the renderer needs for one paint of the dashboard. */
export interface DashboardModel {
  /** Cards in render order. */
  orderedGroups: TabGroup[];
  /** The "Pinned" strip's contents, in the user's configured order. */
  pinned: PinnedStripItem[];
  /** Tabs that are real web pages (the denominator for "close all N tabs"). */
  realTabs: TabInfo[];
  /** Number of group cards. */
  groupCount: number;
}

/** Filters out browser-internal pages — chrome://, extension pages, about:. */
export function getRealTabs(tabs: readonly TabInfo[]): TabInfo[] {
  return tabs.filter((tab) => !isInternalUrl(tab.url));
}

/**
 * Buckets tabs into groups and sorts them.
 *
 * Precedence per tab: disposable rules win, then a plain registrable-domain
 * bucket (subdomains of the same site share one card — see
 * `core/url.ts`'s `groupKeyOf`). Disposable tabs are pulled out first so
 * that closing the "Disposable" card never takes content tabs from the same
 * domain with it. When `disposableEnabled` is off, that step is skipped
 * entirely and every tab groups by domain as if no rule existed — the rules
 * themselves are left untouched in storage, just not applied.
 */
export function groupTabs(
  tabs: readonly TabInfo[],
  settings: Pick<TabOutSettings, 'disposableEnabled' | 'disposableRules'>,
): TabGroup[] {
  const { disposableEnabled, disposableRules } = settings;
  const byKey = new Map<string, TabGroup>();
  const disposableTabs: TabInfo[] = [];

  for (const tab of tabs) {
    if (disposableEnabled && isDisposable(tab.url, disposableRules)) {
      disposableTabs.push(tab);
      continue;
    }

    const key = groupKeyOf(tab.url);
    if (!key) continue;
    let group = byKey.get(key);
    if (!group) {
      group = { key, kind: 'domain', tabs: [] };
      byKey.set(key, group);
    }
    group.tabs.push(tab);
  }

  if (disposableTabs.length > 0) {
    byKey.set(DISPOSABLE_GROUP_KEY, {
      key: DISPOSABLE_GROUP_KEY,
      kind: 'disposable',
      label: DISPOSABLE_GROUP_LABEL,
      tabs: disposableTabs,
    });
  }

  return sortGroups([...byKey.values()], disposableEnabled ? disposableRules : []);
}

/**
 * Orders groups for display: the Disposable card first, then domains that the
 * user's disposable rules mention, then the biggest groups. Ties break on key
 * so the layout does not shuffle between renders.
 */
export function sortGroups(
  groups: readonly TabGroup[],
  disposableRules: readonly DisposableRule[],
): TabGroup[] {
  return [...groups].sort((a, b) => {
    const aDisposable = a.key === DISPOSABLE_GROUP_KEY;
    const bDisposable = b.key === DISPOSABLE_GROUP_KEY;
    if (aDisposable !== bDisposable) return aDisposable ? -1 : 1;

    const aPriority = isDisposableDomain(a.key, disposableRules);
    const bPriority = isDisposableDomain(b.key, disposableRules);
    if (aPriority !== bPriority) return aPriority ? -1 : 1;

    if (b.tabs.length !== a.tabs.length) return b.tabs.length - a.tabs.length;
    return a.key.localeCompare(b.key);
  });
}

/**
 * Builds the "Pinned" strip: one entry per pinned site, in the user's
 * configured order, each carrying its matching open tab (by hostname) if one
 * exists. Duplicate hostnames (two pinned entries for the same site) collapse
 * to the first — a second chip for the same tab would be redundant.
 *
 * This does *not* touch `groups` — a pinned tab still renders in its own
 * domain (or Disposable) card exactly like any other tab. The strip is a
 * quick-access shortcut, not a second copy of the grid.
 */
export function buildPinnedStrip(
  pinnedSites: readonly PinnedSite[],
  realTabs: readonly TabInfo[],
): PinnedStripItem[] {
  const seenHostnames = new Set<string>();
  const items: PinnedStripItem[] = [];

  pinnedSites.forEach((site, pinnedIndex) => {
    const hostname = hostnameOf(site.url);
    if (!hostname || seenHostnames.has(hostname)) return;
    seenHostnames.add(hostname);

    const tab = realTabs.find((candidate) => hostnameOf(candidate.url) === hostname) ?? null;
    items.push({ site, pinnedIndex, tab });
  });

  return items;
}

/**
 * Set of hostnames currently pinned, for highlighting a tab's chip inside its
 * own domain card. Empty when pinning is disabled.
 */
export function pinnedHostnameSet(pinned: readonly PinnedStripItem[]): Set<string> {
  return new Set(pinned.map((item) => hostnameOf(item.site.url)).filter(Boolean));
}

/**
 * One-shot: open tabs + settings → the complete render model.
 *
 * When `pinnedEnabled` is off, the pinned strip is empty and no tab is
 * highlighted as pinned — grouping itself is completely unaffected by
 * pinning either way, since pinning no longer changes which card a tab
 * belongs to.
 */
export function buildDashboardModel(
  tabs: readonly TabInfo[],
  settings: TabOutSettings,
): DashboardModel {
  const realTabs = getRealTabs(tabs);
  const orderedGroups = groupTabs(realTabs, settings);
  const pinned = settings.pinnedEnabled ? buildPinnedStrip(settings.pinnedSites, realTabs) : [];
  return { orderedGroups, pinned, realTabs, groupCount: orderedGroups.length };
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
