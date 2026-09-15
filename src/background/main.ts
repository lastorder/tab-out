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
    getMaxHistoryItems: async () => (await settingsStore.load()).maxHistoryItems,
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
   Global keyboard shortcuts

   The two chords are declared in `manifest.json` under `commands` — the only
   way to register a shortcut that fires while some other site's tab has
   focus. Both features are **off** until the user arms them in the options
   page, so this listener usually decides to do nothing; see
   `core/global-commands.ts` for the decision itself.
   ---------------------------------------------------------------- */

/**
 * Runs the shortcut the user pressed, if its feature is armed.
 *
 * Never throws: a command that fails to act must not take the worker down
 * with it, and the dashboard shortcut in particular is racing a tab list that
 * can change between the query and the activation.
 */
async function runGlobalCommand(command: string): Promise<void> {
  try {
    const [settings, tabs] = await Promise.all([
      settingsStore.load(),
      tabActions.queryAllTabs(),
    ]);

    const action = planGlobalCommand(command, {
      settings,
      tabs,
      dashboardUrls: dashboardUrls(chrome.runtime.id),
      // `chrome.runtime.getURL` rather than hand-building the
      // `chrome-extension://` URL — the popup and dashboard both need the
      // id, and only Chrome knows it for certain.
      dashboardPageUrl: chrome.runtime.getURL('index.html'),
    });

    if (!action) return;

    if (action.kind === 'open-search-popup') {
      // Chrome 127+ allows this from a command handler without a user
      // gesture. On an older Chrome the promise rejects and we deliberately
      // do nothing rather than hijack the current tab — see the options page
      // note about the toolbar button as the fallback path.
      await chrome.action.openPopup();
      return;
    }

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
});
chrome.runtime.onStartup.addListener(() => {
  refreshBadge();
  void seedSnapshots();
  keepDashboardAtEnd();
});
chrome.tabs.onCreated.addListener(refreshBadge);
chrome.tabs.onRemoved.addListener(refreshBadge);
chrome.tabs.onUpdated.addListener(refreshBadge);

// Run once when the worker first spins up (including after being killed and
// restarted for an event — this is not only an install-time thing).
refreshBadge();
void seedSnapshots();
keepDashboardAtEnd();
