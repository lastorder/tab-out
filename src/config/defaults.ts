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
 * URLs are written in already-normalised form (with the trailing slash the URL
 * parser produces) so that `normalizeSettings(defaults)` returns the defaults
 * unchanged. The settings-schema tests assert that invariant.
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
 * own card. This is why the rule format is declarative rather than a
 * hard-coded predicate function.
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

/** Rules that merge or split tabs into custom cards. Empty by default. */
export const DEFAULT_CUSTOM_GROUPS: readonly CustomGroupRule[] = Object.freeze([]);

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
