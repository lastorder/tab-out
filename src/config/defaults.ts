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
 * Google Calendar, Gmail and Google Chat are pinned *and* configured as one
 * merged custom group below (`DEFAULT_CUSTOM_GROUPS`) — both at once is
 * intentional and is what `applyPinnedSites()` (in `core/grouping.ts`) is
 * built to support: when a pinned site's URL is claimed by a custom-group
 * rule, the whole group becomes the pinned unit, not just that one hostname.
 * The result is one "Google" card, always pinned first, that shows either
 * whichever of the three is actually open, or — if none are — a single
 * click-to-open placeholder (opening Calendar, the first of the three
 * listed here) instead of three separate placeholders.
 *
 * URLs must be written in already-normalised form (with the trailing slash
 * the URL parser produces) so that `normalizeSettings(defaults)` returns the
 * defaults unchanged. The settings-schema tests assert that invariant.
 */
export const DEFAULT_PINNED_SITES: readonly PinnedSite[] = Object.freeze([
  { url: 'https://calendar.google.com/', label: 'Google Calendar' },
  { url: 'https://mail.google.com/', label: 'Gmail' },
  { url: 'https://chat.google.com/', label: 'Google Chat' },
]);

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
 * These same three hostnames are *also* pinned (`DEFAULT_PINNED_SITES`
 * above) — that combination is deliberate, not a leftover: it's what makes
 * the "Google" card pinned first *and* what makes its placeholder (when
 * none of the three are open) a single card rather than three. See
 * `applyPinnedSites()`'s doc comment for exactly how the two interact.
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
