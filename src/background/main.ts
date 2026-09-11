/**
 * background/main.ts — the Manifest V3 service worker.
 *
 * One job: keep the toolbar badge showing how many real web tabs are open,
 * colour-coded as a quick at-a-glance health signal. The decision logic lives
 * in `background/badge.ts`; this file is only wiring.
 */

import { badgeStateForTabs } from './badge';

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

const refresh = (): void => {
  void updateBadge();
};

chrome.runtime.onInstalled.addListener(refresh);
chrome.runtime.onStartup.addListener(refresh);
chrome.tabs.onCreated.addListener(refresh);
chrome.tabs.onRemoved.addListener(refresh);
chrome.tabs.onUpdated.addListener(refresh);

// Run once when the worker first spins up.
refresh();
