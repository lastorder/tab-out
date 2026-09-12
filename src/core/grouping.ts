/**
 * core/grouping.ts — the heart of the dashboard.
 *
 * Pure functions that turn a flat list of open tabs plus the user's settings
 * into the exact ordered list of cards the UI should render. Because nothing
 * here touches `chrome.*` or the DOM, the whole layout algorithm is unit
 * testable with plain objects.
 */

import type { PinnedSite, TabGroup, TabInfo, TabOutSettings } from '../types';
import { friendlyDomain } from './domain';
import { isDisposable } from './matching';
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

/**
 * What a pinned site contributes to *any* tab sharing its hostname — used to
 * sort that tab's chip first within its card (by `pinnedIndex`, matching the
 * order pinned sites are configured in) and, when the site has a configured
 * `label`, to prefer that label over the tab's own title. This is what keeps
 * `https://calendar.google.com/` labelled "Google Calendar" even after it
 * navigates to `https://calendar.google.com/calendar/u/0/r` — the hostname
 * (and therefore this lookup) doesn't change, only the path does.
 */
export interface PinnedHostnameEntry {
  pinnedIndex: number;
  label?: string;
}

/** Everything the renderer needs for one paint of the dashboard. */
export interface DashboardModel {
  /** Cards in render order. */
  orderedGroups: TabGroup[];
  /** Pinned-but-not-open placeholder chips, keyed by the card's `key`. */
  placeholders: Map<string, PinnedPlaceholder[]>;
  /** Per-hostname pinned info (sort priority + preferred label), for chips. */
  pinnedHostnames: Map<string, PinnedHostnameEntry>;
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

/** The display name for a group: explicit label, else a friendly hostname. */
export function groupDisplayTitle(group: Pick<TabGroup, 'key' | 'label'>): string {
  if (group.key === DISPOSABLE_GROUP_KEY) return group.label ?? DISPOSABLE_GROUP_LABEL;
  return group.label ?? friendlyDomain(group.key);
}

/**
 * Orders groups for display: cards holding a pinned site first — in the
 * order those sites are configured, so an earlier pinned entry's card leads
 * even when pinned sites from different cards are interleaved — then
 * everything else alphabetically by displayed title, with the Disposable
 * card always last (it's a housekeeping bucket, not content worth leading
 * with).
 *
 * `pinnedGroupOrder` maps a card's `key` to the earliest `pinnedIndex` of any
 * pinned site that belongs under it (see {@link buildPinnedPriorities});
 * empty when pinning is off, so every card falls through to the alphabetical
 * tier as if pinning didn't exist.
 */
export function sortGroups(
  groups: readonly TabGroup[],
  pinnedGroupOrder: ReadonlyMap<string, number> = new Map(),
): TabGroup[] {
  return [...groups].sort((a, b) => {
    const aDisposable = a.key === DISPOSABLE_GROUP_KEY;
    const bDisposable = b.key === DISPOSABLE_GROUP_KEY;
    if (aDisposable !== bDisposable) return aDisposable ? 1 : -1;

    const aIdx = pinnedGroupOrder.get(a.key);
    const bIdx = pinnedGroupOrder.get(b.key);
    const aPinned = aIdx !== undefined;
    const bPinned = bIdx !== undefined;
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    if (aPinned && bPinned && aIdx !== bIdx) return (aIdx as number) - (bIdx as number);

    return groupDisplayTitle(a).localeCompare(groupDisplayTitle(b));
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

/**
 * Computes the two lookups the rest of the dashboard needs for pinned-site
 * priority: `byGroupKey` (registrable domain → earliest `pinnedIndex`) for
 * {@link sortGroups}, and `byHostname` (exact hostname → `pinnedIndex` +
 * optional `label`) for sorting and labelling chips *within* a card. Both
 * dedupe by "first entry wins" — if two pinned sites somehow resolve to the
 * same key, the earlier-configured one decides its priority.
 */
export function buildPinnedPriorities(pinnedSites: readonly PinnedSite[]): {
  byHostname: Map<string, PinnedHostnameEntry>;
  byGroupKey: Map<string, number>;
} {
  const byHostname = new Map<string, PinnedHostnameEntry>();
  const byGroupKey = new Map<string, number>();

  pinnedSites.forEach((site, pinnedIndex) => {
    const hostname = hostnameOf(site.url);
    if (!hostname) return;

    if (!byHostname.has(hostname)) {
      byHostname.set(hostname, site.label ? { pinnedIndex, label: site.label } : { pinnedIndex });
    }

    const key = registrableDomainOf(hostname);
    if (key && !byGroupKey.has(key)) byGroupKey.set(key, pinnedIndex);
  });

  return { byHostname, byGroupKey };
}

/**
 * One-shot: open tabs + settings → the complete render model.
 *
 * When `pinnedEnabled` is off, no placeholders are attached and nothing gets
 * pinned priority or a preferred label — every group and chip renders and
 * sorts exactly as if pinning didn't exist.
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

  const { byHostname, byGroupKey } = settings.pinnedEnabled
    ? buildPinnedPriorities(settings.pinnedSites)
    : { byHostname: new Map<string, PinnedHostnameEntry>(), byGroupKey: new Map<string, number>() };

  const orderedGroups = sortGroups(withPlaceholders, byGroupKey);

  const groupCount = orderedGroups.filter((group) => group.tabs.length > 0).length;

  return { orderedGroups, placeholders, pinnedHostnames: byHostname, realTabs, groupCount };
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
