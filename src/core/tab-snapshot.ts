/**
 * core/tab-snapshot.ts — pure operations on the tab-id → last-known-info cache.
 *
 * `chrome.tabs.onRemoved` tells you a tab id was closed, but not what URL or
 * title it had — by the time the event fires, that information is gone from
 * Chrome. So the background worker keeps a running snapshot of every open
 * tab's `{ url, title }`, keyed by tab id, and consults it at close time.
 *
 * Keys are stored as strings because that is what they become the moment this
 * map is round-tripped through JSON-backed storage; keeping the type honest
 * avoids a false sense of numeric keys that storage will not actually honour.
 */

export interface TabSnapshot {
  url: string;
  title: string;
}

export type TabSnapshotMap = Record<string, TabSnapshot>;

/** Records or overwrites the snapshot for one tab. */
export function updateSnapshot(
  map: TabSnapshotMap,
  tabId: number,
  snapshot: TabSnapshot,
): TabSnapshotMap {
  return { ...map, [String(tabId)]: snapshot };
}

/**
 * Removes and returns the snapshot for one tab, if any.
 *
 * Called once per tab close — after this, the tab id may be reused by Chrome
 * for an unrelated future tab, so the entry must not linger.
 */
export function removeSnapshot(
  map: TabSnapshotMap,
  tabId: number,
): { snapshots: TabSnapshotMap; removed?: TabSnapshot } {
  const key = String(tabId);
  if (!(key in map)) return { snapshots: map };
  const rest = { ...map };
  const removed = rest[key];
  delete rest[key];
  return { snapshots: rest, removed };
}
