/**
 * Shared domain types for Tab Out.
 *
 * Everything the extension passes between modules is described here so the
 * pure logic in `src/core` never has to reach for `chrome.*` types.
 */

/** A browser tab, normalised down to just the fields Tab Out cares about. */
export interface TabInfo {
  id: number;
  url: string;
  title: string;
  windowId: number;
  active: boolean;
  index: number;
}

/** How a group of tabs came to exist. */
export type GroupKind = 'domain' | 'landing' | 'custom';

/** A rendered card's worth of tabs. */
export interface TabGroup {
  /** Hostname, custom-group key, or {@link LANDING_GROUP_KEY}. */
  key: string;
  /** Human-facing name. Falls back to a friendly form of `key` when absent. */
  label?: string;
  kind: GroupKind;
  tabs: TabInfo[];
}

/** A site pinned to the front of the dashboard. */
export interface PinnedSite {
  url: string;
  label?: string;
}

/**
 * A declarative rule describing a "homepage" (landing page).
 *
 * Rules are fully serialisable — no functions — so they can live in
 * `chrome.storage` and be edited from the options page.
 *
 * Matching order: the hostname must match, then the first path constraint
 * present is applied, then `urlNotContains` can veto the match.
 */
export interface LandingPattern {
  /** Exact hostname match, e.g. `mail.google.com`. */
  hostname?: string;
  /** Suffix hostname match, e.g. `.atlassian.net`. */
  hostnameEndsWith?: string;
  /** Match when the pathname is exactly one of these. */
  pathExact?: string[];
  /** Match when the pathname starts with this. Use `/` to match any path. */
  pathPrefix?: string;
  /** Veto the match when the full URL contains any of these substrings. */
  urlNotContains?: string[];
}

/** A rule that merges or splits tabs into a named group. */
export interface CustomGroupRule {
  /** Stable identifier used as the group key. */
  groupKey: string;
  /** Display name for the card. */
  groupLabel: string;
  hostname?: string;
  hostnameEndsWith?: string;
  pathPrefix?: string;
}

/** The complete, user-editable configuration. */
export interface TabOutSettings {
  version: number;
  pinnedSites: PinnedSite[];
  landingPatterns: LandingPattern[];
  customGroups: CustomGroupRule[];
  /** How many recently-closed tabs to remember before the oldest are dropped. */
  maxHistoryItems: number;
}

/** An item on the "Saved for later" checklist. */
export interface SavedTab {
  id: string;
  url: string;
  title: string;
  /** ISO-8601 timestamp. */
  savedAt: string;
  completed: boolean;
  dismissed: boolean;
  /** ISO-8601 timestamp, set when `completed` flips to true. */
  completedAt?: string;
}

/** Saved tabs split into the two lists the sidebar renders. */
export interface SavedTabBuckets {
  active: SavedTab[];
  archived: SavedTab[];
}

/**
 * A tab that was closed and can be reopened from the History panel.
 *
 * Recorded for every real tab closure, regardless of how it was closed
 * (Tab Out's own buttons, Chrome's own tab X, closing a whole window, …).
 * Deduplicated by URL: closing the same page twice updates one entry's
 * timestamp rather than creating a second one.
 */
export interface ClosedTabEntry {
  id: string;
  url: string;
  title: string;
  /** ISO-8601 timestamp of the most recent closure. */
  closedAt: string;
}
