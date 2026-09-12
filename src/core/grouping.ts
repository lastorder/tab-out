/**
 * core/grouping.ts — the heart of the dashboard.
 *
 * Pure functions that turn a flat list of open tabs plus the user's settings
 * into the exact ordered list of cards the UI should render. Because nothing
 * here touches `chrome.*` or the DOM, the whole layout algorithm is unit
 * testable with plain objects.
 */

import type { PinnedSite, TabGroup, TabInfo, DisposableRule, TabOutSettings } from '../types';
import { isDisposable, isDisposableDomain } from './matching';
import { groupKeyOf, hostnameOf, isInternalUrl, registrableDomainOf } from './url';

/** Reserved key for the synthetic "Disposable" card. */
export const DISPOSABLE_GROUP_KEY = '__disposable__';

/** Display name for the synthetic "Disposable" card. */
export const DISPOSABLE_GROUP_LABEL = 'Disposable';

/**
 * A pinned site with no currently-open tab, surfaced as a grayed,
 * click-to-open chip *inside* its own domain (or Disposable) card — never as
 * a card of its own. Keyed by `attachPinnedPlaceholders`'s returned map so
 * the renderer knows which card each placeholder belongs under.
 */
export interface PinnedPlaceholder {
  site: PinnedSite;
  pinnedIndex: number;
}

/** Everything the renderer needs for one paint of the dashboard. */
export interface DashboardModel {
  /** Cards in render order. */
  orderedGroups: TabGroup[];
  /** Pinned-but-not-open placeholder chips, keyed by the card's `key`. */
  placeholders: Map<string, PinnedPlaceholder[]>;
  /** Tabs that are real web pages (the denominator for "close all N tabs"). */
  realTabs: TabInfo[];
  /** Number of cards that actually have open tabs (placeholder-only cards don't count). */
  groupCount: number;
}

/** Filters out browser-internal pages — chrome://, extension pages, about:. */
export function getRealTabs(tabs: readonly TabInfo[]): TabInfo[] {
  return tabs.filter((tab) => !isInternalUrl(tab.url));
}

/**
 * Buckets tabs into groups.
 *
 * Precedence per tab: disposable rules win, then a plain registrable-domain
 * bucket (subdomains of the same site share one card — see
 * `core/url.ts`'s `groupKeyOf`). Disposable tabs are pulled out first so
 * that closing the "Disposable" card never takes content tabs from the same
 * domain with it. When `disposableEnabled` is off, that step is skipped
 * entirely and every tab groups by domain as if no rule existed — the rules
 * themselves are left untouched in storage, just not applied.
 *
 * Unsorted — callers sort with {@link sortGroups} once placeholders (if any)
 * have been attached, so pinned-site priority can be taken into account too.
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

  return [...byKey.values()];
}

/**
 * Orders groups for display: the Disposable card first, then cards holding a
 * pinned site (open or not), then domains the user's disposable rules
 * mention, then the biggest groups. Ties break on key so the layout does not
 * shuffle between renders.
 */
export function sortGroups(
  groups: readonly TabGroup[],
  disposableRules: readonly DisposableRule[],
  pinnedGroupKeys: ReadonlySet<string> = new Set(),
): TabGroup[] {
  return [...groups].sort((a, b) => {
    const aDisposable = a.key === DISPOSABLE_GROUP_KEY;
    const bDisposable = b.key === DISPOSABLE_GROUP_KEY;
    if (aDisposable !== bDisposable) return aDisposable ? -1 : 1;

    const aPinned = pinnedGroupKeys.has(a.key);
    const bPinned = pinnedGroupKeys.has(b.key);
    if (aPinned !== bPinned) return aPinned ? -1 : 1;

    const aPriority = isDisposableDomain(a.key, disposableRules);
    const bPriority = isDisposableDomain(b.key, disposableRules);
    if (aPriority !== bPriority) return aPriority ? -1 : 1;

    if (b.tabs.length !== a.tabs.length) return b.tabs.length - a.tabs.length;
    return a.key.localeCompare(b.key);
  });
}

/**
 * Ensures every pinned site's own card exists, and hands back — keyed by
 * that card's `key` — the placeholders for whichever pinned sites have no
 * open tab right now.
 *
 * A pinned site that *is* open needs nothing extra: `groupTabs()` already
 * put its tab in the right card. One that *isn't* open still surfaces
 * inside that same card (by registrable domain, same as any tab would) as a
 * grayed, click-to-open placeholder chip — it never gets a card of its own,
 * and if the card wouldn't otherwise exist (nothing else from that domain is
 * open), an empty one is created just to hold the placeholder.
 */
export function attachPinnedPlaceholders(
  groups: readonly TabGroup[],
  realTabs: readonly TabInfo[],
  pinnedSites: readonly PinnedSite[],
): { groups: TabGroup[]; placeholders: Map<string, PinnedPlaceholder[]> } {
  const byKey = new Map(groups.map((group) => [group.key, group]));
  const placeholders = new Map<string, PinnedPlaceholder[]>();

  pinnedSites.forEach((site, pinnedIndex) => {
    const hostname = hostnameOf(site.url);
    if (!hostname) return;
    if (realTabs.some((tab) => hostnameOf(tab.url) === hostname)) return; // already open somewhere

    const key = registrableDomainOf(hostname);
    if (!key) return;
    if (!byKey.has(key)) {
      byKey.set(key, { key, kind: 'domain', tabs: [] });
    }

    const list = placeholders.get(key) ?? [];
    list.push({ site, pinnedIndex });
    placeholders.set(key, list);
  });

  return { groups: [...byKey.values()], placeholders };
}

/** Registrable domains of every pinned site, for the sort-priority bump in {@link sortGroups}. */
function pinnedGroupKeysOf(pinnedSites: readonly PinnedSite[]): Set<string> {
  const keys = new Set<string>();
  for (const site of pinnedSites) {
    const key = registrableDomainOf(hostnameOf(site.url));
    if (key) keys.add(key);
  }
  return keys;
}

/**
 * One-shot: open tabs + settings → the complete render model.
 *
 * When `pinnedEnabled` is off, no placeholders are attached and no card gets
 * pinned-priority in the sort — every group renders exactly as `groupTabs()`
 * produced it, as if pinning didn't exist.
 */
export function buildDashboardModel(
  tabs: readonly TabInfo[],
  settings: TabOutSettings,
): DashboardModel {
  const realTabs = getRealTabs(tabs);
  const baseGroups = groupTabs(realTabs, settings);

  const { groups: withPlaceholders, placeholders } = settings.pinnedEnabled
    ? attachPinnedPlaceholders(baseGroups, realTabs, settings.pinnedSites)
    : { groups: baseGroups, placeholders: new Map<string, PinnedPlaceholder[]>() };

  const pinnedGroupKeys = settings.pinnedEnabled ? pinnedGroupKeysOf(settings.pinnedSites) : new Set<string>();

  const orderedGroups = sortGroups(
    withPlaceholders,
    settings.disposableEnabled ? settings.disposableRules : [],
    pinnedGroupKeys,
  );

  const groupCount = orderedGroups.filter((group) => group.tabs.length > 0).length;

  return { orderedGroups, placeholders, realTabs, groupCount };
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
