/**
 * core/history.ts — ordering and trimming rules for the closed-tab list.
 *
 * The invariant the feature rests on: **a URL never appears twice**, either
 * within history or across history and the open tabs. `upsertHistoryEntry` is
 * what enforces the first half; the service filters against open tabs for the
 * second. Pure, so the rules are testable with plain arrays.
 */

import type { ClosedTabEntry, TabOutSettings } from '../types';
import { isDisposable } from './matching';
import { matchesQueryTerms, tokenizeQuery } from './query';

/**
 * Decides whether a closed tab belongs in the History list.
 *
 * Disposable tabs are the ones the user has already declared safe to lose — a
 * site's homepage, a spent post-join screen — and Tab Out's "Tidy up" closes
 * them by the handful. Recording those would fill History with rows that were
 * never worth reopening, and would offer them right back the moment after they
 * were tidied away. So they are skipped, but only while disposable rules are
 * actually enabled: with the feature switched off nothing on the dashboard is
 * disposable, and a closed tab is an ordinary closed tab again.
 *
 * Browser-internal pages are a separate concern, handled by the caller.
 */
export function shouldRecordClosedTab(url: string, settings: TabOutSettings): boolean {
  return !(settings.disposableEnabled && isDisposable(url, settings.disposableRules));
}

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
 *
 * Space-separated terms narrow the list, exactly as they do in the Search
 * overlay — see `core/query.ts`.
 */
export function filterHistory(
  history: readonly ClosedTabEntry[],
  query: string,
): ClosedTabEntry[] {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [...history];
  const terms = tokenizeQuery(trimmed);
  return history.filter((h) => matchesQueryTerms(terms, [h.title || '', h.url]));
}
