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
  /**
   * The id of the Chrome tab group this tab belongs to, or `-1` (or absent)
   * when it isn't in one. Mirrors `chrome.tabs.Tab.groupId` /
   * `chrome.tabGroups.TAB_GROUP_ID_NONE`. Optional so every existing
   * `TabInfo` fixture across the test suite doesn't need to grow this field
   * just to mean "ungrouped" — `core/grouping.ts` treats a missing value the
   * same as `-1`.
   */
  groupId?: number;
  /**
   * Whether Chrome has pinned this tab. Mirrors `chrome.tabs.Tab.pinned`.
   *
   * Tab Out never repositions a pinned tab and never puts one in a Chrome
   * tab group — pinned tabs live in a reserved region at the front of the
   * tab bar that cannot interleave with ordinary tabs, and Chrome un-pins a
   * tab the moment it joins a group. Optional for the same reason
   * {@link TabInfo.groupId} is: a missing value means "not pinned".
   */
  pinned?: boolean;
}

/** How a group of tabs came to exist. */
export type GroupKind = 'domain' | 'disposable' | 'chrome-group';

/** A rendered card's worth of tabs. */
export interface TabGroup {
  /**
   * Registrable domain (see `core/url.ts`'s `registrableDomainOf`),
   * `DISPOSABLE_GROUP_KEY` (from `core/grouping.ts`), or — for `kind ===
   * 'chrome-group'` — a synthetic key derived from the Chrome tab group id.
   */
  key: string;
  /** Human-facing name. Falls back to a friendly form of `key` when absent. */
  label?: string;
  kind: GroupKind;
  tabs: TabInfo[];
  /** Set only for `kind === 'chrome-group'`: the real Chrome tab group id, for closing/matching. */
  chromeGroupId?: number;
  /** Set only for `kind === 'chrome-group'`: Chrome's colour for this group, for the card's accent. */
  chromeGroupColor?: string;
}

/** The bit of info Chrome tracks about a tab group, beyond which tabs are in it. */
export interface ChromeGroupInfo {
  id: number;
  title: string;
  color: string;
}

/**
 * A site pinned for quick access.
 *
 * Pinning is tab-level, not group-level: a pinned site's matching open tab
 * (if any) is highlighted and sorted first *inside its own domain card*, and
 * also surfaced in a compact "Pinned" strip above the grid. It never
 * promotes, merges, or otherwise hijacks the whole card the way an earlier
 * version of this feature did.
 */
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
 * `pattern` is matched against the tab's whole URL, scheme included. `*`
 * matches any run of characters, including `/`, e.g. `https://github.com/*`
 * matches every page on GitHub, and `file:///Users/me/notes/*` matches every
 * local file under that folder. Everything else in the pattern is matched
 * literally. See `core/matching.ts`.
 */
export interface DisposableRule {
  pattern: string;
}

/** A single key combination: one non-modifier key plus whichever modifiers matter. */
export interface KeyCombo {
  /** `event.key`, lower-cased (e.g. `'f'`, `'k'`, `'/'`). */
  key: string;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
}

/**
 * The complete, user-editable configuration.
 *
 * Neither browser-global shortcut (opening the Search box, opening the
 * dashboard) has a field here any more. Both chords are declared in
 * `manifest.json` under `commands` and entirely owned by Chrome
 * (`chrome://extensions/shortcuts`) — a stored on/off flag only ever risked
 * showing a shortcut as "configured" on the options page while our own
 * `chrome.commands.onCommand` handler silently ignored it. They are simply
 * always on now; see `core/global-commands.ts`.
 */
export interface TabOutSettings {
  version: number;
  /**
   * Whether pinned sites are applied at all. Off doesn't delete the list —
   * it just stops highlighting/surfacing them, so every tab renders exactly
   * like any other, unpinned one.
   */
  pinnedEnabled: boolean;
  pinnedSites: PinnedSite[];
  /**
   * Whether disposable rules are applied at all. Off doesn't delete the
   * rules — it just stops applying them, so every tab groups by hostname.
   */
  disposableEnabled: boolean;
  disposableRules: DisposableRule[];
  /** How many recently-closed tabs to remember before the oldest are dropped. */
  maxHistoryItems: number;
  /**
   * When true, the dashboard silently reorders your tabs to match its card
   * order whenever they drift out of sync. When false, it shows a banner
   * with a manual "Sort tabs" button instead.
   */
  autoSortTabs: boolean;
  /**
   * When true, opening 2 or more tabs that would share one domain card
   * (see `core/grouping.ts`) automatically creates a real Chrome tab group
   * for them, named after that domain. Off by default — grouping the user's
   * tab bar is a bigger, more visible change than anything else Tab Out does
   * automatically, so it opts in rather than out.
   */
  autoGroupEnabled: boolean;
  /**
   * The keyboard shortcut that opens/closes the Search overlay. Only active
   * on the Tab Out page itself — it's registered with a plain `keydown`
   * listener there, not a `chrome.commands` global shortcut, so it never
   * fires while the user is typing in some other site's tab.
   */
  searchShortcut: KeyCombo;
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
