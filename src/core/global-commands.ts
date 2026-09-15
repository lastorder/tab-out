/**
 * core/global-commands.ts — what each browser-global shortcut should do.
 *
 * The two chords themselves live in `manifest.json` under `commands`, since
 * only `chrome.commands` can register a shortcut that fires while some other
 * site's tab has focus. Chrome also owns *rebinding* them (via
 * `chrome://extensions/shortcuts`), so unlike `core/shortcut.ts` there is no
 * user-editable combo here — just the name of each command and the decision
 * of what it should do.
 *
 * That decision is pure and lives here so it can be tested without a browser:
 * `background/main.ts` supplies the settings and tab list, then performs the
 * effect itself. "Off by default" is enforced here — a disabled command
 * resolves to `null`, which the caller treats as "do nothing at all".
 */

import type { TabOutSettings, TabInfo } from '../types';
import { findDashboardTab } from './dashboard';

/**
 * The `chrome.commands` names, matching `manifest.json`.
 *
 * `global-search` opens the Search popup over whatever page is focused;
 * `global-dashboard` jumps to (or opens) the Tab Out page itself.
 */
export const GLOBAL_SEARCH_COMMAND = 'global-search';
export const GLOBAL_DASHBOARD_COMMAND = 'global-dashboard';

/** What an armed global command should make the browser do. */
export type GlobalCommandAction =
  /** Open the extension popup containing the Search box. */
  | { kind: 'open-search-popup' }
  /** Focus the already-open dashboard tab. */
  | { kind: 'focus-dashboard'; tabId: number; windowId: number }
  /** Open the dashboard page — used when Tab Out isn't the new-tab override. */
  | { kind: 'open-dashboard'; url: string };

/** Everything the decision needs about the outside world. */
export interface GlobalCommandContext {
  settings: Pick<TabOutSettings, 'globalSearchShortcutEnabled' | 'globalDashboardShortcutEnabled'>;
  /** Every open tab, used to find an existing dashboard. */
  tabs: readonly TabInfo[];
  /** Every URL that counts as the dashboard — see `dashboardUrls()`. */
  dashboardUrls: readonly string[];
  /**
   * The URL to open when no dashboard is already up.
   *
   * Passed in rather than derived here because only the caller knows the
   * extension's own id (`chrome.runtime.getURL('index.html')`); this module
   * stays free of `chrome.*`.
   */
  dashboardPageUrl: string;
}

/**
 * Decides what `command` should do, or `null` when it does nothing.
 *
 * `null` covers three cases the caller treats identically: an unknown command
 * name, a known command whose feature is switched off, and — for the
 * dashboard command — nothing that needs doing because the active tab is
 * already the dashboard.
 */
export function planGlobalCommand(
  command: string,
  context: GlobalCommandContext,
): GlobalCommandAction | null {
  switch (command) {
    case GLOBAL_SEARCH_COMMAND:
      return context.settings.globalSearchShortcutEnabled ? { kind: 'open-search-popup' } : null;

    case GLOBAL_DASHBOARD_COMMAND:
      if (!context.settings.globalDashboardShortcutEnabled) return null;
      return planDashboardJump(context);

    default:
      return null;
  }
}

/**
 * Focus the open dashboard if there is one, otherwise open it.
 *
 * The "already active" check matters: if Tab Out *is* the user's new tab page,
 * the active tab is often the dashboard already, and "open the dashboard"
 * would otherwise pointlessly spawn a second one.
 */
function planDashboardJump(context: GlobalCommandContext): GlobalCommandAction | null {
  const existing = findDashboardTab(context.tabs, context.dashboardUrls);
  if (existing) {
    if (existing.active) return null;
    return { kind: 'focus-dashboard', tabId: existing.id, windowId: existing.windowId };
  }
  return { kind: 'open-dashboard', url: context.dashboardPageUrl };
}
