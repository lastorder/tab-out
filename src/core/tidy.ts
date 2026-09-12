/**
 * core/tidy.ts — deciding which open tabs are safe to close in one click.
 *
 * "Tidy up" closes three kinds of tab that all share one property: nothing is
 * lost by closing them, because getting them back costs nothing.
 *
 *   - disposable — matches an enabled disposable rule (see `matching.ts`)
 *   - saved      — the URL is already on the "Saved for later" checklist, so
 *                  this open tab is redundant with something durable
 *   - duplicate  — an extra copy of a URL open more than once; one copy of
 *                  each is kept, only the extras count
 *
 * Every qualifying tab is attributed to exactly one reason, in that priority
 * order, so the breakdown counts always sum to the total closed — a tab that
 * is both disposable *and* a duplicate of another disposable tab is still
 * one tab, not two.
 */

import type { DisposableRule, TabInfo } from '../types';
import { analyzeDuplicates, selectDuplicateTabIds } from './duplicates';
import { isDisposable } from './matching';

export interface TidyBreakdown {
  disposable: number;
  saved: number;
  duplicates: number;
}

export interface TidySelection {
  tabIds: number[];
  breakdown: TidyBreakdown;
}

export interface TidyOptions {
  disposableEnabled: boolean;
  disposableRules: readonly DisposableRule[];
  /** URLs currently on the active "Saved for later" checklist. */
  savedUrls: ReadonlySet<string>;
}

/**
 * Selects which open tabs "Tidy up" would close, and why.
 *
 * `realTabs` should already exclude browser-internal pages (as
 * `DashboardModel.realTabs` does) — Tidy never touches the dashboard itself.
 */
export function selectTidyTabIds(
  realTabs: readonly TabInfo[],
  options: TidyOptions,
): TidySelection {
  const { disposableEnabled, disposableRules, savedUrls } = options;
  const breakdown: TidyBreakdown = { disposable: 0, saved: 0, duplicates: 0 };

  // Every copy of a disposable or already-saved URL closes — there is no
  // "keep one" for these, unlike a plain duplicate.
  const wholesaleIds = new Set<number>();
  for (const tab of realTabs) {
    if (disposableEnabled && isDisposable(tab.url, disposableRules)) {
      wholesaleIds.add(tab.id);
      breakdown.disposable++;
    } else if (savedUrls.has(tab.url)) {
      wholesaleIds.add(tab.id);
      breakdown.saved++;
    }
  }

  // Duplicates are evaluated only among what's left, so a disposable or
  // saved tab is never also counted as a duplicate — each tab has exactly
  // one reason. One copy of each remaining duplicated URL is kept.
  const remaining = realTabs.filter((tab) => !wholesaleIds.has(tab.id));
  const { duplicateUrls } = analyzeDuplicates(remaining);
  const duplicateIds = selectDuplicateTabIds(remaining, duplicateUrls, true);
  breakdown.duplicates = duplicateIds.length;

  return { tabIds: [...wholesaleIds, ...duplicateIds], breakdown };
}
