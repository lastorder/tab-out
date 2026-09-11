/**
 * background/main.ts — the Manifest V3 service worker.
 *
 * Two jobs:
 * 1. Keep the toolbar badge showing how many real web tabs are open,
 *    colour-coded as a quick at-a-glance health signal. Decision logic lives
 *    in `background/badge.ts`.
 * 2. Record every closed tab into the History list, so the dashboard can
 *    offer to reopen it later. Decision logic lives in
 *    `background/history-recorder.ts`.
 *
 * This file is only wiring: it constructs the concrete adapters and forwards
 * `chrome.tabs` events to the testable functions above.
 */

import { badgeStateForTabs } from './badge';
import { recordTabRemoved, trackTabActivity } from './history-recorder';
import { createChromeStore } from '../platform/storage';
import { SettingsStore } from '../config/store';
import { TabHistoryService } from '../services/tab-history';
import { TabSnapshotCache } from '../services/tab-snapshot-cache';

const settingsStore = new SettingsStore(createChromeStore('sync'));
const historyService = new TabHistoryService(createChromeStore('local'));
const snapshotCache = new TabSnapshotCache(createChromeStore('session'));

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
   Lifecycle
   ---------------------------------------------------------------- */

chrome.runtime.onInstalled.addListener(() => {
  refreshBadge();
  void seedSnapshots();
});
chrome.runtime.onStartup.addListener(() => {
  refreshBadge();
  void seedSnapshots();
});
chrome.tabs.onCreated.addListener(refreshBadge);
chrome.tabs.onRemoved.addListener(refreshBadge);
chrome.tabs.onUpdated.addListener(refreshBadge);

// Run once when the worker first spins up (including after being killed and
// restarted for an event — this is not only an install-time thing).
refreshBadge();
void seedSnapshots();
