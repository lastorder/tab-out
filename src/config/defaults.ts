/**
 * config/defaults.ts — the settings a fresh install starts with.
 *
 * These are only *seeds*. Once the user saves anything from the options page,
 * their stored settings take over completely. Changing a default therefore
 * only affects new installs and anyone who hits "Reset to defaults".
 */

import type { CustomGroupRule, LandingPattern, PinnedSite, TabOutSettings } from '../types';

/** Bumped whenever the stored shape changes; drives migrations. */
export const SETTINGS_VERSION = 1;

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

/**
 * Rules describing which URLs count as a "homepage" and therefore belong in
 * the shared Homepages card.
 *
 * Note the Gmail rule: it matches every Gmail path (`pathPrefix: '/'`) but is
 * vetoed for URLs containing a thread fragment, so reading an email keeps its
 * own card. This replaces what used to be a hard-coded predicate function and
 * is why the rule format is declarative.
 */
export const DEFAULT_LANDING_PATTERNS: readonly LandingPattern[] = Object.freeze([
  {
    hostname: 'mail.google.com',
    pathPrefix: '/',
    urlNotContains: ['#inbox/', '#sent/', '#search/'],
  },
  { hostname: 'x.com', pathExact: ['/home'] },
  { hostname: 'www.linkedin.com', pathExact: ['/'] },
  { hostname: 'github.com', pathExact: ['/'] },
  { hostname: 'www.youtube.com', pathExact: ['/'] },
]);

/** Rules that merge or split tabs into custom cards. Empty by default. */
export const DEFAULT_CUSTOM_GROUPS: readonly CustomGroupRule[] = Object.freeze([]);

/** Returns a fresh, deeply-copied default settings object. */
export function createDefaultSettings(): TabOutSettings {
  return {
    version: SETTINGS_VERSION,
    pinnedSites: DEFAULT_PINNED_SITES.map((site) => ({ ...site })),
    landingPatterns: DEFAULT_LANDING_PATTERNS.map((pattern) => ({ ...pattern })),
    customGroups: DEFAULT_CUSTOM_GROUPS.map((rule) => ({ ...rule })),
  };
}
