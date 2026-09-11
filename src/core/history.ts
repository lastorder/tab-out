/**
 * core/history.ts — ordering and trimming rules for the closed-tab list.
 *
 * The invariant the feature rests on: **a URL never appears twice**, either
 * within history or across history and the open tabs. `upsertHistoryEntry` is
 * what enforces the first half; the service filters against open tabs for the
 * second. Pure, so the rules are testable with plain arrays.
 */

import type { ClosedTabEntry } from '../types';

/** Sorts entries newest-closed-first. ISO-8601 strings sort correctly as text. */
export function sortHistoryByRecency(entries: readonly ClosedTabEntry[]): ClosedTabEntry[] {
  return [...entries].sort((a, b) => b.closedAt.localeCompare(a.closedAt));
}

/**
 * Inserts a newly-closed tab, replacing any earlier entry for the same URL
 * (closing the same page twice updates its timestamp rather than duplicating
 * it), then drops the oldest entries beyond `maxItems`.
 */
export function upsertHistoryEntry(
  history: readonly ClosedTabEntry[],
  entry: ClosedTabEntry,
  maxItems: number,
): ClosedTabEntry[] {
  const withoutDupe = history.filter((h) => h.url !== entry.url);
  return clampHistory([entry, ...withoutDupe], maxItems);
}

/** Sorts, then trims to `maxItems`. Also used when the configured limit shrinks. */
export function clampHistory(
  history: readonly ClosedTabEntry[],
  maxItems: number,
): ClosedTabEntry[] {
  return sortHistoryByRecency(history).slice(0, Math.max(0, maxItems));
}

/**
 * Case-insensitive search across title and URL, for the History panel's
 * search box. Queries shorter than two characters match everything, so the
 * list doesn't flicker while typing.
 */
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
