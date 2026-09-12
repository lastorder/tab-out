/**
 * config/defaults.ts — the settings a fresh install starts with.
 *
 * These are only *seeds*. Once the user saves anything from the options page,
 * their stored settings take over completely. Changing a default therefore
 * only affects new installs and anyone who hits "Reset to defaults".
 */

import type { CustomGroupRule, DisposableRule, PinnedSite, TabOutSettings } from '../types';

/** Bumped whenever the stored shape changes; drives migrations. */
export const SETTINGS_VERSION = 2;

/**
 * Sites always shown at the front of the dashboard.
 *
 * Empty by default. Calendar, Gmail and Chat used to live here as three
 * separate pinned entries, but Pinned sites always renders one card per
 * *exact hostname* — so even with a custom group merging those three
 * hostnames into one card (see `DEFAULT_CUSTOM_GROUPS` below), pinning them
 * would have reclaimed each hostname's tabs back out into three separate
 * cards, undoing the merge. Moving them to custom groups is what actually
 * puts them on one card; see that constant's doc comment for the full story.
 *
 * URLs must be written in already-normalised form (with the trailing slash
 * the URL parser produces) so that `normalizeSettings(defaults)` returns the
 * defaults unchanged. The settings-schema tests assert that invariant.
 */
export const DEFAULT_PINNED_SITES: readonly PinnedSite[] = Object.freeze([]);

/** Whether pinned sites are applied by default. */
export const DEFAULT_PINNED_ENABLED = true;

/**
 * Rules describing which tabs are "disposable" — safe to close because
 * reopening them costs nothing — and therefore belong in the shared
 * Disposable card. Two shapes of tab qualify:
 *
 *   - a site's own homepage (`github.com/`, `x.com/home`) — closing it
 *     never loses anything, since it's not "content" you were reading
 *   - a spent one-off page, like the screen Zoom leaves behind after a
 *     meeting has already opened in the desktop app
 *
 * Note the Gmail rule: it matches every Gmail path (`pathPrefix: '/'`) but is
 * vetoed for URLs containing a thread fragment, so reading an email keeps its
 * own card — in this case, the shared "Google" card from
 * `DEFAULT_CUSTOM_GROUPS`, since disposable rules are checked first and only
 * the vetoed (non-disposable) Gmail tabs ever reach the custom-group check.
 * This is why the rule format is declarative rather than a hard-coded
 * predicate function.
 *
 * Google Meet and Microsoft Teams meeting URLs are deliberately **not**
 * included here: unlike Zoom's post-join page, the call itself runs inside
 * the tab, so auto-closing it would end an active meeting. Add rules for
 * them yourself only if that's genuinely safe for how you use them.
 */
export const DEFAULT_DISPOSABLE_RULES: readonly DisposableRule[] = Object.freeze([
  {
    hostname: 'mail.google.com',
    pathPrefix: '/',
    urlNotContains: ['#inbox/', '#sent/', '#search/'],
  },
  { hostname: 'x.com', pathExact: ['/home'] },
  { hostname: 'www.linkedin.com', pathExact: ['/', '/feed/'] },
  { hostname: 'github.com', pathExact: ['/'] },
  { hostname: 'www.youtube.com', pathExact: ['/'] },
  { hostnameEndsWith: '.zoom.us', pathPrefix: '/j/' },
]);

/** Whether disposable rules are applied by default. */
export const DEFAULT_DISPOSABLE_ENABLED = true;

/**
 * Rules that merge or split tabs into custom cards.
 *
 * Shipped as a worked example of the "merge several hostnames into one
 * card" pattern: Google Calendar, Gmail and Google Chat are three unrelated
 * hostnames (`calendar.google.com`, `mail.google.com`, `chat.google.com`)
 * that would otherwise render as three separate domain cards. Giving all
 * three rules the same `groupKey` buckets their tabs into a single "Google"
 * card instead — see `core/grouping.ts`'s `groupTabs()`, which keys cards by
 * `groupKey`, not by hostname, for `kind: 'custom'` groups.
 *
 * This only works because these three hostnames are *not* also configured
 * as pinned sites (see `DEFAULT_PINNED_SITES` above) — a pinned entry claims
 * tabs by exact hostname and would split this same merge back apart.
 */
export const DEFAULT_CUSTOM_GROUPS: readonly CustomGroupRule[] = Object.freeze([
  { groupKey: 'google-suite', groupLabel: 'Google', hostname: 'calendar.google.com' },
  { groupKey: 'google-suite', groupLabel: 'Google', hostname: 'mail.google.com' },
  { groupKey: 'google-suite', groupLabel: 'Google', hostname: 'chat.google.com' },
]);

/** How many recently-closed tabs to remember by default. */
export const DEFAULT_MAX_HISTORY_ITEMS = 100;

/**
 * Whether the dashboard auto-sorts your tabs by default.
 *
 * On by default: most people would rather their tabs just match the
 * dashboard than have to notice a banner and click a button.
 */
export const DEFAULT_AUTO_SORT_TABS = true;

/** Returns a fresh, deeply-copied default settings object. */
export function createDefaultSettings(): TabOutSettings {
  return {
    version: SETTINGS_VERSION,
    pinnedEnabled: DEFAULT_PINNED_ENABLED,
    pinnedSites: DEFAULT_PINNED_SITES.map((site) => ({ ...site })),
    disposableEnabled: DEFAULT_DISPOSABLE_ENABLED,
    disposableRules: DEFAULT_DISPOSABLE_RULES.map((rule) => ({ ...rule })),
    customGroups: DEFAULT_CUSTOM_GROUPS.map((rule) => ({ ...rule })),
    maxHistoryItems: DEFAULT_MAX_HISTORY_ITEMS,
    autoSortTabs: DEFAULT_AUTO_SORT_TABS,
  };
}
