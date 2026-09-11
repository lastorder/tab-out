/**
 * core/history.ts — pure logic for the closed-tab history list.
 *
 * The invariant the whole feature rests on: **a URL never appears twice**,
 * either within history itself, or across history and the open tabs. These
 * functions are what enforce that, and they do it without touching storage or
 * the DOM so the rules can be tested with plain arrays.
 */

import type { ClosedTabEntry } from '../types';

/** Sorts entries newest-closed-first. ISO-8601 strings sort correctly as text. */
export function sortHistoryByRecency(
  entries: readonly ClosedTabEntry[],
): ClosedTabEntry[] {
  return [...entries].sort((a, b) => b.closedAt.localeCompare(a.closedAt));
}

/**
 * Inserts a newly-closed tab, replacing any earlier entry for the same URL
 * (closing the same page twice should update its timestamp, not duplicate
 * it), then trims to `maxItems` — the oldest entries are what get dropped.
 */
export function upsertHistoryEntry(
  history: readonly ClosedTabEntry[],
  entry: ClosedTabEntry,
  maxItems: number,
): ClosedTabEntry[] {
  const withoutDupe = history.filter((h) => h.url !== entry.url);
  const merged = sortHistoryByRecency([entry, ...withoutDupe]);
  return merged.slice(0, Math.max(0, maxItems));
}

/** Removes every entry for a URL. Used when that page is closed again... */
export function removeHistoryByUrl(
  history: readonly ClosedTabEntry[],
  url: string,
): ClosedTabEntry[] {
  return history.filter((h) => h.url !== url);
}

/** ...and used when the user removes one row from the panel by hand. */
export function removeHistoryById(
  history: readonly ClosedTabEntry[],
  id: string,
): ClosedTabEntry[] {
  return history.filter((h) => h.id !== id);
}

/**
 * Filters out any history entry whose URL is currently open.
 *
 * This is what keeps "closed tabs" and "open tabs" from ever showing the same
 * URL twice: the moment a page you closed is opened again, it should stop
 * appearing in history — whether or not the background worker has already
 * caught up and deleted the stored entry.
 */
export function dedupeAgainstOpenUrls(
  history: readonly ClosedTabEntry[],
  openUrls: ReadonlySet<string>,
): ClosedTabEntry[] {
  if (openUrls.size === 0) return [...history];
  return history.filter((h) => !openUrls.has(h.url));
}

/** Sorts, then trims to `maxItems`. Used when the configured limit shrinks. */
export function clampHistory(
  history: readonly ClosedTabEntry[],
  maxItems: number,
): ClosedTabEntry[] {
  return sortHistoryByRecency(history).slice(0, Math.max(0, maxItems));
}

/** Case-insensitive search across title and URL, for the History panel's search box. */
export function filterHistory(
  history: readonly ClosedTabEntry[],
  query: string,
): ClosedTabEntry[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [...history];
  return history.filter(
    (h) => (h.title || '').toLowerCase().includes(q) || h.url.toLowerCase().includes(q),
  );
}
