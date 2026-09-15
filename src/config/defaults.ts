/**
 * config/defaults.ts — the settings a fresh install starts with.
 *
 * These are only *seeds*. Once the user saves anything from the options page,
 * their stored settings take over completely. Changing a default therefore
 * only affects new installs and anyone who hits "Reset to defaults".
 */

import type { DisposableRule, KeyCombo, PinnedSite, TabOutSettings } from '../types';
import { defaultSearchShortcut } from '../core/shortcut';

/**
 * Whether this default set targets macOS. Read once at module load — the
 * only place that needs it — since defaults are generated per-runtime, not
 * per-render. `navigator` is absent in the Node test environment, hence the
 * guard.
 */
const IS_MAC =
  typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || navigator.userAgent || '');

/** Bumped whenever the stored shape changes; drives migrations. */
export const SETTINGS_VERSION = 4;

/**
 * Sites always pinned for quick access.
 *
 * Pinning is tab-level: each entry highlights its matching open tab inside
 * its own domain card and surfaces it in the "Pinned" strip above the grid.
 * Gmail, Calendar and Chat all live under `google.com`'s registrable domain
 * (see `core/url.ts`'s `registrableDomainOf`), so they already share one
 * domain card without needing a merge feature.
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
 * own card — the shared "google.com" domain card, since `mail.google.com` and
 * `calendar.google.com` share a registrable domain. Disposable rules are
 * checked first, so only the vetoed (non-disposable) Gmail tabs ever reach
 * domain grouping. This is why the rule format is declarative rather than a
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

/** How many recently-closed tabs to remember by default. */
export const DEFAULT_MAX_HISTORY_ITEMS = 100;

/**
 * Whether the dashboard auto-sorts your tabs by default.
 *
 * On by default: most people would rather their tabs just match the
 * dashboard than have to notice a banner and click a button.
 */
export const DEFAULT_AUTO_SORT_TABS = true;

/**
 * The default Search-overlay shortcut: Cmd+F on macOS, Ctrl+F elsewhere —
 * whichever key survives per-platform "find on page" muscle memory, since
 * the overlay works like an omnibox-style find across tabs and history.
 */
export const DEFAULT_SEARCH_SHORTCUT: KeyCombo = defaultSearchShortcut(IS_MAC);

/**
 * Whether the browser-global shortcuts are armed by default.
 *
 * Both are **off**: a global shortcut claims a browser-wide chord, and a
 * fresh install should not silently take one over. The user opts in from the
 * options page, which is also where the current binding is shown.
 */
export const DEFAULT_GLOBAL_SEARCH_SHORTCUT_ENABLED = false;
export const DEFAULT_GLOBAL_DASHBOARD_SHORTCUT_ENABLED = false;

/** Returns a fresh, deeply-copied default settings object. */
export function createDefaultSettings(): TabOutSettings {
  return {
    version: SETTINGS_VERSION,
    pinnedEnabled: DEFAULT_PINNED_ENABLED,
    pinnedSites: DEFAULT_PINNED_SITES.map((site) => ({ ...site })),
    disposableEnabled: DEFAULT_DISPOSABLE_ENABLED,
    disposableRules: DEFAULT_DISPOSABLE_RULES.map((rule) => ({ ...rule })),
    maxHistoryItems: DEFAULT_MAX_HISTORY_ITEMS,
    autoSortTabs: DEFAULT_AUTO_SORT_TABS,
    searchShortcut: { ...DEFAULT_SEARCH_SHORTCUT },
    globalSearchShortcutEnabled: DEFAULT_GLOBAL_SEARCH_SHORTCUT_ENABLED,
    globalDashboardShortcutEnabled: DEFAULT_GLOBAL_DASHBOARD_SHORTCUT_ENABLED,
  };
}
