/**
 * core/grouping.ts — the heart of the dashboard.
 *
 * Pure functions that turn a flat list of open tabs plus the user's settings
 * into the exact ordered list of cards the UI should render. Because nothing
 * here touches `chrome.*` or the DOM, the whole layout algorithm is unit
 * testable with plain objects.
 */

import type { ChromeGroupInfo, PinnedSite, TabGroup, TabInfo, TabOutSettings } from '../types';
import { friendlyDomain } from './domain';
import { isDisposable } from './matching';
import { groupKeyOf, hostnameOf, isInternalUrl, pathnameOf, registrableDomainOf } from './url';

/** Reserved key for the synthetic "Disposable" card. */
export const DISPOSABLE_GROUP_KEY = '__disposable__';

/** Display name for the synthetic "Disposable" card. */
export const DISPOSABLE_GROUP_LABEL = 'Disposable';

/** Fallback label for a Chrome tab group the user never gave a title. */
export const UNTITLED_CHROME_GROUP_LABEL = 'Group';

/** The `TabGroup.key` used for a Chrome tab group with this id — see {@link groupTabs}. */
export function chromeGroupKey(groupId: number): string {
  return `__chrome-group-${groupId}__`;
}

/** `tab.groupId`, treating a missing value the same as "ungrouped" (`-1`). */
function groupIdOf(tab: Pick<TabInfo, 'groupId'>): number {
  return tab.groupId ?? -1;
}

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
 * What a pinned site contributes to any tab it claims — used to sort that
 * tab's chip first within its card (by `pinnedIndex`, matching the order
 * pinned sites are configured in) and, when the site has a configured
 * `label`, to prefer that label over the tab's own title.
 *
 * A pinned site claims a tab by hostname **plus path prefix** (see
 * {@link matchPinnedSite}), not by hostname alone. That distinction is
 * load-bearing in both directions:
 *
 *   - `https://calendar.google.com/` has prefix `/`, so it still claims
 *     `https://calendar.google.com/calendar/u/0/r` after the redirect — the
 *     label survives navigation, which is the whole point.
 *   - a deep pin like `.../jira/software/c/projects/ROTF2OTROR/boards/10559`
 *     claims only that board and pages under it, so an unrelated issue at
 *     `/browse/ROTF2OTROR-260` on the same Jira host keeps its own title
 *     instead of being mislabelled "Jira Board".
 */
export interface PinnedMatch {
  hostname: string;
  /** Pathname of the pinned URL, without a trailing slash (`''` means site root). */
  pathPrefix: string;
  pinnedIndex: number;
  label?: string;
}

/** Everything the renderer needs for one paint of the dashboard. */
export interface DashboardModel {
  /** Cards in render order. */
  orderedGroups: TabGroup[];
  /** Pinned-but-not-open placeholder chips, keyed by the card's `key`. */
  placeholders: Map<string, PinnedPlaceholder[]>;
  /** Pinned sites, for sorting and labelling chips. Empty when pinning is off. */
  pinnedMatches: PinnedMatch[];
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
 * Precedence per tab: a real Chrome tab group the user created wins first —
 * that's an explicit, manual signal stronger than anything Tab Out infers on
 * its own — then disposable rules, then a plain registrable-domain bucket
 * (subdomains of the same site share one card — see `core/url.ts`'s
 * `groupKeyOf`). Disposable tabs are pulled out before domain grouping so
 * that closing the "Disposable" card never takes content tabs from the same
 * domain with it. When `disposableEnabled` is off, that step is skipped
 * entirely and every remaining tab groups by domain as if no rule existed —
 * the rules themselves are left untouched in storage, just not applied.
 *
 * `chromeGroups` (empty when there are none, or the browser doesn't support
 * `chrome.tabGroups`) maps a Chrome tab group id to its title/colour, so a
 * card can be labelled and coloured to match what the user named it in the
 * real tab bar. A tab whose `groupId` isn't in this map (stale/removed
 * group) falls through to disposable/domain grouping as if it were
 * ungrouped.
 *
 * Unsorted — callers sort with {@link sortGroups} once placeholders (if any)
 * have been attached, so pinned-site priority can be taken into account too.
 */
export function groupTabs(
  tabs: readonly TabInfo[],
  settings: Pick<TabOutSettings, 'disposableEnabled' | 'disposableRules'>,
  chromeGroups: ReadonlyMap<number, ChromeGroupInfo> = new Map(),
): TabGroup[] {
  const { disposableEnabled, disposableRules } = settings;
  const byKey = new Map<string, TabGroup>();
  const disposableTabs: TabInfo[] = [];

  for (const tab of tabs) {
    const chromeGroup = chromeGroups.get(groupIdOf(tab));
    if (chromeGroup) {
      const key = chromeGroupKey(chromeGroup.id);
      let group = byKey.get(key);
      if (!group) {
        group = {
          key,
          kind: 'chrome-group',
          label: chromeGroup.title || UNTITLED_CHROME_GROUP_LABEL,
          tabs: [],
          chromeGroupId: chromeGroup.id,
          chromeGroupColor: chromeGroup.color,
        };
        byKey.set(key, group);
      }
      group.tabs.push(tab);
      continue;
    }

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
  if (group.label !== undefined) return group.label;
  return friendlyDomain(group.key);
}

/**
 * A Chrome-group card's position in the tab bar: the lowest `index` among
 * its tabs. Groups are contiguous in Chrome, so this is also effectively the
 * group's own leftmost position — using it (rather than alphabetical title)
 * keeps the dashboard's card order matching the order the user already gave
 * their groups in the real tab bar. `undefined` for anything that isn't a
 * chrome-group card.
 */
function chromeGroupOrderKey(group: Pick<TabGroup, 'kind' | 'tabs'>): number | undefined {
  if (group.kind !== 'chrome-group' || group.tabs.length === 0) return undefined;
  return Math.min(...group.tabs.map((tab) => tab.index));
}

/**
 * Orders groups for display: cards holding a pinned site first — in the
 * order those sites are configured, so an earlier pinned entry's card leads
 * even when pinned sites from different cards are interleaved — then real
 * Chrome tab group cards next, ordered by their own position in the tab bar
 * (leftmost group first, matching what the user already arranged there
 * rather than resorting them alphabetically), then everything else
 * alphabetically by displayed title, with the Disposable card always last
 * (it's a housekeeping bucket, not content worth leading with).
 *
 * `pinnedGroupOrder` maps a card's `key` to the earliest `pinnedIndex` of any
 * pinned site that belongs under it (see {@link buildPinnedPriorities});
 * empty when pinning is off, so every card falls through to the alphabetical
 * tier as if pinning didn't exist. A pinned site's key is always a
 * registrable domain, never a chrome-group key, so a pinned card still leads
 * even ahead of a Chrome tab group.
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

    const aChromeOrder = chromeGroupOrderKey(a);
    const bChromeOrder = chromeGroupOrderKey(b);
    const aIsChromeGroup = aChromeOrder !== undefined;
    const bIsChromeGroup = bChromeOrder !== undefined;
    if (aIsChromeGroup !== bIsChromeGroup) return aIsChromeGroup ? -1 : 1;
    if (aIsChromeGroup && bIsChromeGroup && aChromeOrder !== bChromeOrder) {
      return (aChromeOrder as number) - (bChromeOrder as number);
    }

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
 * {@link sortGroups}, and `matches` (one {@link PinnedMatch} per pinned site,
 * in configured order) for sorting and labelling chips *within* a card.
 *
 * `byGroupKey` dedupes by "first entry wins" — if two pinned sites resolve to
 * the same card, the earlier-configured one decides its priority. `matches`
 * deliberately keeps every entry: two pins on one hostname with different
 * paths are a legitimate, separately-labelled pair, which is exactly the case
 * hostname-only matching used to collapse.
 */
export function buildPinnedPriorities(pinnedSites: readonly PinnedSite[]): {
  matches: PinnedMatch[];
  byGroupKey: Map<string, number>;
} {
  const matches: PinnedMatch[] = [];
  const byGroupKey = new Map<string, number>();

  pinnedSites.forEach((site, pinnedIndex) => {
    const hostname = hostnameOf(site.url);
    if (!hostname) return;

    matches.push({
      hostname,
      pathPrefix: normalizePathPrefix(pathnameOf(site.url)),
      pinnedIndex,
      ...(site.label ? { label: site.label } : {}),
    });

    const key = registrableDomainOf(hostname);
    if (key && !byGroupKey.has(key)) byGroupKey.set(key, pinnedIndex);
  });

  return { matches, byGroupKey };
}

/** Strips a trailing slash so `/jira/` and `/jira` compare identically; `/` becomes `''`. */
function normalizePathPrefix(pathname: string): string {
  return pathname.replace(/\/+$/, '');
}

/**
 * Finds the pinned site that claims `url`, or `null`.
 *
 * A pinned site claims a URL when the hostname matches exactly *and* the
 * URL's path sits at or under the pinned path. "Under" respects segment
 * boundaries, so a pin on `/board` never claims `/boardroom`.
 *
 * When several pinned sites claim the same URL, the most specific one wins
 * (longest `pathPrefix`), so pinning both a site root and a deep page inside
 * it labels each tab with the closest match rather than the first one
 * configured. Equal-specificity ties fall back to configured order.
 */
export function matchPinnedSite(
  url: string,
  matches: readonly PinnedMatch[],
): PinnedMatch | null {
  const hostname = hostnameOf(url);
  if (!hostname) return null;
  const pathname = normalizePathPrefix(pathnameOf(url));

  let best: PinnedMatch | null = null;
  for (const match of matches) {
    if (match.hostname !== hostname) continue;
    if (match.pathPrefix && pathname !== match.pathPrefix && !pathname.startsWith(`${match.pathPrefix}/`)) {
      continue;
    }
    if (
      !best ||
      match.pathPrefix.length > best.pathPrefix.length ||
      (match.pathPrefix.length === best.pathPrefix.length && match.pinnedIndex < best.pinnedIndex)
    ) {
      best = match;
    }
  }
  return best;
}

/**
 * One-shot: open tabs + settings → the complete render model.
 *
 * When `pinnedEnabled` is off, no placeholders are attached and nothing gets
 * pinned priority or a preferred label — every group and chip renders and
 * sorts exactly as if pinning didn't exist.
 *
 * `chromeGroups` (empty when there are none) lets real Chrome tab groups take
 * priority over domain grouping — see {@link groupTabs}.
 */
export function buildDashboardModel(
  tabs: readonly TabInfo[],
  settings: TabOutSettings,
  chromeGroups: ReadonlyMap<number, ChromeGroupInfo> = new Map(),
): DashboardModel {
  const realTabs = getRealTabs(tabs);
  const baseGroups = groupTabs(realTabs, settings, chromeGroups);

  const { groups: withPlaceholders, placeholders } = settings.pinnedEnabled
    ? attachPinnedPlaceholders(baseGroups, realTabs, settings.pinnedSites)
    : { groups: baseGroups, placeholders: new Map<string, PinnedPlaceholder[]>() };

  const { matches, byGroupKey } = settings.pinnedEnabled
    ? buildPinnedPriorities(settings.pinnedSites)
    : { matches: [] as PinnedMatch[], byGroupKey: new Map<string, number>() };

  const orderedGroups = sortGroups(withPlaceholders, byGroupKey);

  const groupCount = orderedGroups.filter((group) => group.tabs.length > 0).length;

  return { orderedGroups, placeholders, pinnedMatches: matches, realTabs, groupCount };
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
