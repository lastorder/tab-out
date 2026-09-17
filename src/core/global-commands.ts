/**
 * core/global-commands.ts — what the browser-global dashboard shortcut should do.
 *
 * The chord itself lives in `manifest.json` under `commands`, since only
 * `chrome.commands` can register a shortcut that fires while some other
 * site's tab has focus. Chrome also owns *rebinding* it (via
 * `chrome://extensions/shortcuts`), so unlike `core/shortcut.ts` there is no
 * user-editable combo here — just the name of the command and the decision
 * of what it should do.
 *
 * That decision is pure and lives here so it can be tested without a browser:
 * `background/main.ts` supplies the tab list, then performs the effect
 * itself. There is no settings-driven on/off switch any more (see below) —
 * `planGlobalCommand` always acts on a recognised command.
 *
 * Note there used to be a second command, `global-search`, which called
 * `chrome.action.openPopup()` — functionally a duplicate of Chrome's own
 * `_execute_action` command (manifest.json), which does the same thing as
 * clicking the toolbar icon: opens the Search popup, and — being an ordinary
 * popup — closes it again if it's already open. `_execute_action` doesn't
 * dispatch `onCommand` events, so it needs no entry here at all; it was
 * removed to stop offering two shortcuts for one feature.
 *
 * There also used to be a `globalDashboardShortcutEnabled` setting gating
 * this command behind an options-page checkbox. It was removed: the chord
 * itself is entirely owned by Chrome (`chrome://extensions/shortcuts`), so
 * the checkbox only ever controlled whether *our* handler reacted to a key
 * Chrome had already bound and displayed as active — a footgun where the
 * options page could show a shortcut as configured while it silently did
 * nothing. The command is simply always on now, same as `_execute_action`;
 * the options page explains the recommended chord in plain text instead of
 * offering a toggle that doesn't control the actual keybinding.
 */

import type { TabInfo } from '../types';
import { findDashboardTab } from './dashboard';

/** The `chrome.commands` name, matching `manifest.json`. Jumps to (or opens) the Tab Out page itself. */
export const GLOBAL_DASHBOARD_COMMAND = 'global-dashboard';

/** What an armed global command should make the browser do. */
export type GlobalCommandAction =
  /** Focus the already-open dashboard tab. */
  | { kind: 'focus-dashboard'; tabId: number; windowId: number }
  /** Open the dashboard page — used when Tab Out isn't the new-tab override. */
  | { kind: 'open-dashboard'; url: string };

/** Everything the decision needs about the outside world. */
export interface GlobalCommandContext {
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
 * `null` covers two cases the caller treats identically: an unknown command
 * name, and — for the dashboard command — nothing that needs doing because
 * the active tab is already the dashboard.
 */
export function planGlobalCommand(
  command: string,
  context: GlobalCommandContext,
): GlobalCommandAction | null {
  switch (command) {
    case GLOBAL_DASHBOARD_COMMAND:
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
