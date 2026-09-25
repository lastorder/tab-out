/**
 * background/main.ts — the Manifest V3 service worker.
 *
 * Three jobs:
 * 1. Keep the toolbar badge showing how many real web tabs are open,
 *    colour-coded as a quick at-a-glance health signal. Decision logic lives
 *    in `background/badge.ts`.
 * 2. Record every closed tab into the History list, so the dashboard can
 *    offer to reopen it later. Decision logic lives in
 *    `background/history-recorder.ts`.
 * 3. Keep the dashboard pinned to the rightmost tab of its window, so any
 *    newly opened page lands to its left. Decision logic lives in
 *    `core/position.ts`, behind `TabActions.moveDashboardToEnd`.
 * 4. When enabled, keep the real Chrome tab groups in step with the domain
 *    cards: a new tab whose domain already has a group joins it, and a
 *    domain that has accumulated 2+ ungrouped tabs gets a group of its own.
 *    Decision logic lives in `core/auto-group.ts`, behind
 *    `TabActions.runAutoGroup`.
 *
 * This file is only wiring: it constructs the concrete adapters and forwards
 * `chrome.tabs` events to the testable functions above.
 */

import { badgeStateForTabs } from './badge';
import { recordTabRemoved, trackTabActivity } from './history-recorder';
import { dashboardUrls } from '../core/dashboard';
import { planGlobalCommand } from '../core/global-commands';
import { createChromeBrowserTabs } from '../platform/browser';
import { createChromeStore } from '../platform/storage';
import { SettingsStore } from '../config/store';
import { TabActions } from '../services/tab-actions';
import { TabHistoryService } from '../services/tab-history';
import { TabSnapshotCache } from '../services/tab-snapshot-cache';

const settingsStore = new SettingsStore(createChromeStore('sync'));
const historyService = new TabHistoryService(createChromeStore('local'));
const snapshotCache = new TabSnapshotCache(createChromeStore('session'));
const tabActions = new TabActions(createChromeBrowserTabs());

/* ----------------------------------------------------------------
   Badge
   ---------------------------------------------------------------- */

/** Recomputes and applies the badge. Failures clear it rather than go stale. */
async function updateBadge(): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({});
    const state = badgeStateForTabs(tabs.map((tab) => ({ url: tab.url ?? '' })));

    await chrome.action.setBadgeText({ text: state.text });
    if (state.color) {
      await chrome.action.setBadgeBackgroundColor({ color: state.color });
    }
  } catch {
    void chrome.action.setBadgeText({ text: '' });
  }
}

const refreshBadge = (): void => {
  void updateBadge();
};

/* ----------------------------------------------------------------
   Closed-tab history
   ---------------------------------------------------------------- */

/**
 * Seeds the snapshot cache from every currently open tab.
 *
 * `chrome.tabs.onCreated` only fires for genuinely new tabs, so tabs that
 * already existed before this worker last woke up — right after a browser
 * restart, or right after the extension is installed or reloaded — would
 * otherwise have no snapshot and could not be recorded when they close.
 */
async function seedSnapshots(): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id === undefined) continue;
      await trackTabActivity(
        { id: tab.id, url: tab.url ?? '', title: tab.title ?? '' },
        { historyService, snapshotCache },
      );
    }
  } catch {
    // Best-effort — a missed seed just means one tab's close won't be recorded.
  }
}

chrome.tabs.onCreated.addListener((tab) => {
  if (tab.id === undefined) return;
  void trackTabActivity(
    { id: tab.id, url: tab.url ?? '', title: tab.title ?? '' },
    { historyService, snapshotCache },
  );
});

chrome.tabs.onUpdated.addListener((tabId, _changeInfo, tab) => {
  void trackTabActivity(
    { id: tabId, url: tab.url ?? '', title: tab.title ?? '' },
    { historyService, snapshotCache },
  );
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void recordTabRemoved(tabId, {
    historyService,
    snapshotCache,
    getSettings: () => settingsStore.load(),
  });
});

/* ----------------------------------------------------------------
   Dashboard position

   "Any newly opened page should land to the left of Tab Out" — enforced by
   keeping the dashboard tab at the highest index in its window every time a
   tab is created anywhere in the browser. Cheap to run unconditionally:
   `moveDashboardToEnd` is a no-op unless there is a dashboard tab and it has
   actually been pushed out of last place.
   ---------------------------------------------------------------- */

const keepDashboardAtEnd = (): void => {
  void tabActions.moveDashboardToEnd(dashboardUrls(chrome.runtime.id));
};

chrome.tabs.onCreated.addListener(keepDashboardAtEnd);

/* ----------------------------------------------------------------
   Auto-grouping

   When `autoGroupEnabled` is on, every ungrouped tab whose domain already has
   a Chrome tab group joins it, and any domain that has accumulated 2+ tabs
   with no group yet gets one — see `core/auto-group.ts#planTabGrouping`.
   Debounced, since opening several tabs of the same site in quick succession
   (a handful of search results, say) would otherwise fire this once per tab.
   ---------------------------------------------------------------- */

let autoGroupTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * `autoGroupTimer` is a live variable, which looks like it violates "service
 * workers must not hold state" — but nothing here needs to survive the
 * worker being killed: losing a pending timer just means one qualifying
 * batch of tabs waits for the *next* tab event to get swept instead of this
 * one, not that it's silently skipped forever. The 1s delay is short enough
 * that `chrome.alarms` (whose granularity is coarse, historically ~30s)
 * would make the debounce feel laggy for no correctness benefit; plain
 * `setTimeout` for a sub-second debounce is the same tradeoff
 * `newtab/controller.ts`'s `RenderScheduler` already makes.
 */
const scheduleAutoGroup = (): void => {
  if (autoGroupTimer !== undefined) clearTimeout(autoGroupTimer);
  autoGroupTimer = setTimeout(() => {
    autoGroupTimer = undefined;
    void runAutoGroupSweep();
  }, 1000);
};

/**
 * Serialises sweeps so two of them can never overlap.
 *
 * The debounce above only collapses events that arrive *before* a timer
 * fires. Once one fires, the sweep it starts is asynchronous — and if a
 * second burst of tab events (restoring a session, say) schedules another
 * timer that fires while the first sweep is still awaiting storage or
 * `chrome.tabs.group()`, both sweeps query the same tab list before either
 * has grouped anything and each creates its own group for the same domain.
 * That is exactly how one site ended up with two groups.
 *
 * A sweep that is asked to run while another is in flight is not dropped:
 * `autoGroupQueued` makes the running sweep repeat once it finishes, so the
 * tabs that arrived mid-sweep still get grouped.
 */
let autoGroupInFlight = false;
let autoGroupQueued = false;

async function runAutoGroupSweep(): Promise<void> {
  if (autoGroupInFlight) {
    autoGroupQueued = true;
    return;
  }

  autoGroupInFlight = true;
  try {
    do {
      autoGroupQueued = false;
      const settings = await settingsStore.load();
      await tabActions.runAutoGroup(settings);
      // Terminates: grouping only ever removes tabs from the ungrouped set
      // the plan is built from, so a repeat pass finds nothing left to do
      // unless a genuine tab event arrived meanwhile.
    } while (autoGroupQueued);
  } catch {
    // Best-effort — a missed sweep just leaves those tabs ungrouped for now;
    // the next qualifying tab event tries again.
  } finally {
    autoGroupInFlight = false;
    autoGroupQueued = false;
  }
}

chrome.tabs.onCreated.addListener(scheduleAutoGroup);
chrome.tabs.onUpdated.addListener((_tabId, change) => {
  if (change.url || change.status === 'complete') scheduleAutoGroup();
});

/* ----------------------------------------------------------------
   Global keyboard shortcuts

   Only one custom command remains: `global-dashboard`, declared in
   `manifest.json` under `commands` — the only way to register a shortcut
   that fires while some other site's tab has focus. It is always on — there
   used to be a `globalDashboardShortcutEnabled` setting gating it, removed
   because the chord is entirely Chrome's to bind/rebind
   (`chrome://extensions/shortcuts`) regardless of our own on/off flag, so
   the checkbox only ever risked showing a shortcut as "configured" while our
   handler silently ignored it. See `core/global-commands.ts` for the
   decision itself.

   Opening the Search box has no listener here at all: `manifest.json`
   declares it as `_execute_action`, Chrome's reserved name for "do exactly
   what clicking the toolbar icon does" (open the popup, and close it again
   on a second press, same as the icon). That command never reaches
   `chrome.commands.onCommand`, so there is nothing to gate or wire up.
   ---------------------------------------------------------------- */

/**
 * Runs the shortcut the user pressed.
 *
 * Never throws: a command that fails to act must not take the worker down
 * with it, and the dashboard shortcut in particular is racing a tab list that
 * can change between the query and the activation.
 */
async function runGlobalCommand(command: string): Promise<void> {
  try {
    const tabs = await tabActions.queryAllTabs();

    const action = planGlobalCommand(command, {
      tabs,
      dashboardUrls: dashboardUrls(chrome.runtime.id),
      // `chrome.runtime.getURL` rather than hand-building the
      // `chrome-extension://` URL — the popup and dashboard both need the
      // id, and only Chrome knows it for certain.
      dashboardPageUrl: chrome.runtime.getURL('index.html'),
    });

    if (!action) return;

    if (action.kind === 'focus-dashboard') {
      await chrome.tabs.update(action.tabId, { active: true });
      await chrome.windows.update(action.windowId, { focused: true });
      return;
    }

    await chrome.tabs.create({ url: action.url, active: true });
  } catch {
    // Intentionally silent: "do nothing" is the documented behaviour when a
    // global shortcut can't act on the current page.
  }
}

chrome.commands.onCommand.addListener((command) => {
  void runGlobalCommand(command);
});

/* ----------------------------------------------------------------
   Lifecycle
   ---------------------------------------------------------------- */

chrome.runtime.onInstalled.addListener(() => {
  refreshBadge();
  void seedSnapshots();
  keepDashboardAtEnd();
  scheduleAutoGroup();
});
chrome.runtime.onStartup.addListener(() => {
  refreshBadge();
  void seedSnapshots();
  keepDashboardAtEnd();
  scheduleAutoGroup();
});
chrome.tabs.onCreated.addListener(refreshBadge);
chrome.tabs.onRemoved.addListener(refreshBadge);
chrome.tabs.onUpdated.addListener(refreshBadge);

// Run once when the worker first spins up (including after being killed and
// restarted for an event — this is not only an install-time thing).
refreshBadge();
void seedSnapshots();
keepDashboardAtEnd();
scheduleAutoGroup();
