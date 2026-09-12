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
export type GroupKind = 'domain' | 'disposable' | 'custom';

/** A rendered card's worth of tabs. */
export interface TabGroup {
  /** Hostname, custom-group key, or `DISPOSABLE_GROUP_KEY` (from `core/grouping.ts`). */
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
 * A declarative rule describing a "disposable" tab — one that's safe to
 * close because it costs nothing to get back: a site's own homepage
 * (`github.com/`), or a spent one-off page like a Zoom meeting's post-join
 * screen.
 *
 * Rules are fully serialisable — no functions — so they can live in
 * `chrome.storage` and be edited from the options page.
 *
 * Matching order: the hostname must match, then the first path constraint
 * present is applied, then `urlNotContains` can veto the match.
 */
export interface DisposableRule {
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
  /**
   * Whether pinned sites are promoted to the front of the dashboard at all.
   * Off doesn't delete the list — it just stops applying it, so a site with
   * open tabs groups by hostname like any other, and one with none shows no
   * placeholder.
   */
  pinnedEnabled: boolean;
  pinnedSites: PinnedSite[];
  /**
   * Whether disposable rules are applied at all. Off doesn't delete the
   * rules — it just stops applying them, so every tab groups by hostname.
   */
  disposableEnabled: boolean;
  disposableRules: DisposableRule[];
  customGroups: CustomGroupRule[];
  /** How many recently-closed tabs to remember before the oldest are dropped. */
  maxHistoryItems: number;
  /**
   * When true, the dashboard silently reorders your tabs to match its card
   * order whenever they drift out of sync. When false, it shows a banner
   * with a manual "Sort tabs" button instead.
   */
  autoSortTabs: boolean;
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
