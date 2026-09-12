/**
 * core/search.ts — the Search overlay's matching and ranking logic.
 *
 * Combines currently-open tabs and closed-tab history into one ranked list,
 * so the overlay can be a single keyboard-driven list rather than two
 * separate panes. Pure: no `chrome.*`, no DOM, just arrays in and out.
 */

import type { ClosedTabEntry, TabInfo } from '../types';

/** One row in the Search overlay's results list. */
export interface SearchResult {
  kind: 'tab' | 'history';
  id: string;
  url: string;
  title: string;
  /** Present only for `kind: 'tab'` — needed to focus it. */
  tabId?: number;
  /** Present only for `kind: 'history'` — needed to remove it once reopened. */
  historyId?: string;
}

function tabToResult(tab: TabInfo): SearchResult {
  return { kind: 'tab', id: `tab-${tab.id}`, url: tab.url, title: tab.title || tab.url, tabId: tab.id };
}

function historyToResult(entry: ClosedTabEntry): SearchResult {
  return {
    kind: 'history',
    id: `history-${entry.id}`,
    url: entry.url,
    title: entry.title || entry.url,
    historyId: entry.id,
  };
}

/** Case-insensitive substring match against title or URL. */
function matches(title: string, url: string, query: string): boolean {
  const q = query.toLowerCase();
  return title.toLowerCase().includes(q) || url.toLowerCase().includes(q);
}

/**
 * Builds the ranked result list for a query: matching open tabs first (in
 * their given order), then matching history entries (already sorted
 * newest-first by the caller). An empty query returns open tabs followed by
 * history, unfiltered — so opening the overlay with nothing typed yet shows
 * something useful rather than a blank list.
 */
export function searchTabsAndHistory(
  tabs: readonly TabInfo[],
  history: readonly ClosedTabEntry[],
  query: string,
): SearchResult[] {
  const q = query.trim();
  const tabResults = tabs
    .filter((tab) => q.length === 0 || matches(tab.title, tab.url, q))
    .map(tabToResult);
  const historyResults = history
    .filter((entry) => q.length === 0 || matches(entry.title, entry.url, q))
    .map(historyToResult);
  return [...tabResults, ...historyResults];
}

/** Clamps a "selected index" into range as the result list changes, defaulting to the first row. */
export function clampSelection(index: number, resultCount: number): number {
  if (resultCount === 0) return -1;
  if (index < 0) return 0;
  if (index >= resultCount) return resultCount - 1;
  return index;
}

/** Moves the selection by `delta`, wrapping around both ends. */
export function moveSelection(index: number, delta: number, resultCount: number): number {
  if (resultCount === 0) return -1;
  const next = (index + delta) % resultCount;
  return next < 0 ? next + resultCount : next;
}
