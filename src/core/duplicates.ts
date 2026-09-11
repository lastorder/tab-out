/**
 * core/duplicates.ts — duplicate-tab detection.
 *
 * "Duplicate" means the exact same URL open more than once. Hostname matches
 * are not enough: two different GitHub issues are not duplicates.
 */

import type { TabInfo } from '../types';

/** Summary of duplicate URLs within one group. */
export interface DuplicateReport {
  /** URL → how many tabs have it open. */
  counts: Record<string, number>;
  /** URLs that appear more than once. */
  duplicateUrls: string[];
  /** How many tabs could be closed while keeping one copy of each URL. */
  extraCount: number;
  hasDuplicates: boolean;
}

/** Counts how many times each URL appears. */
export function countUrls(tabs: readonly TabInfo[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const tab of tabs) {
    counts[tab.url] = (counts[tab.url] ?? 0) + 1;
  }
  return counts;
}

/** Builds the full duplicate report for a set of tabs. */
export function analyzeDuplicates(tabs: readonly TabInfo[]): DuplicateReport {
  const counts = countUrls(tabs);
  const duplicateUrls = Object.keys(counts).filter((url) => (counts[url] ?? 0) > 1);
  const extraCount = duplicateUrls.reduce((sum, url) => sum + (counts[url] ?? 1) - 1, 0);
  return {
    counts,
    duplicateUrls,
    extraCount,
    hasDuplicates: duplicateUrls.length > 0,
  };
}

/**
 * Collapses duplicates for display: one entry per URL, first occurrence wins,
 * original order preserved.
 */
export function uniqueByUrl(tabs: readonly TabInfo[]): TabInfo[] {
  const seen = new Set<string>();
  const out: TabInfo[] = [];
  for (const tab of tabs) {
    if (seen.has(tab.url)) continue;
    seen.add(tab.url);
    out.push(tab);
  }
  return out;
}

/**
 * Picks which tab IDs to close when de-duplicating.
 *
 * `keepOne` keeps the active copy if there is one, otherwise the first.
 */
export function selectDuplicateTabIds(
  tabs: readonly TabInfo[],
  urls: readonly string[],
  keepOne = true,
): number[] {
  const targets = new Set(urls);
  const toClose: number[] = [];

  for (const url of targets) {
    const matching = tabs.filter((tab) => tab.url === url);
    if (matching.length === 0) continue;

    if (!keepOne) {
      toClose.push(...matching.map((tab) => tab.id));
      continue;
    }

    const keep = matching.find((tab) => tab.active) ?? matching[0]!;
    toClose.push(...matching.filter((tab) => tab.id !== keep.id).map((tab) => tab.id));
  }

  return toClose;
}
