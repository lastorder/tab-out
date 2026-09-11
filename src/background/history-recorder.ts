/**
 * background/history-recorder.ts — orchestrates recording closed tabs.
 *
 * Kept separate from `background/main.ts` so the actual decisions (what to
 * snapshot, when to record, when to purge) can be unit tested against real
 * service instances backed by in-memory storage, instead of a mocked
 * `chrome.tabs` event stream.
 */

import { isInternalUrl } from '../core/url';
import type { TabHistoryService } from '../services/tab-history';
import type { TabSnapshotCache } from '../services/tab-snapshot-cache';

/** The subset of a Chrome tab this module needs. */
export interface TrackedTab {
  id: number;
  url: string;
  title: string;
}

export interface HistoryRecorderDeps {
  historyService: TabHistoryService;
  snapshotCache: TabSnapshotCache;
}

/**
 * Called whenever a tab is created, navigates, or finishes loading.
 *
 * Two things happen:
 * 1. The snapshot cache is refreshed, so that if this tab closes later, its
 *    current URL/title are available (`chrome.tabs.onRemoved` provides
 *    neither).
 * 2. If this tab's URL matches something in history, that entry is purged —
 *    a page that is open again is no longer a "closed tab".
 */
export async function trackTabActivity(tab: TrackedTab, deps: HistoryRecorderDeps): Promise<void> {
  await deps.snapshotCache.record(tab.id, { url: tab.url, title: tab.title });
  if (tab.url && !isInternalUrl(tab.url)) {
    await deps.historyService.removeByUrl(tab.url);
  }
}

/**
 * Called when a tab is closed. Looks up what it was showing right before it
 * closed and, unless that was a browser-internal page, records it to history.
 */
export async function recordTabRemoved(
  tabId: number,
  deps: HistoryRecorderDeps & { getMaxHistoryItems: () => Promise<number> },
): Promise<void> {
  const snapshot = await deps.snapshotCache.consume(tabId);
  if (!snapshot || isInternalUrl(snapshot.url)) return;
  const maxItems = await deps.getMaxHistoryItems();
  await deps.historyService.record(snapshot, maxItems);
}
