/**
 * background/badge.ts — toolbar badge logic.
 *
 * Pure: it maps a tab list to the text and colour the badge should show, so
 * the thresholds can be unit tested without a browser.
 */

import type { TabInfo } from '../types';
import { isInternalUrl } from '../core/url';

/** What the toolbar badge should display. */
export interface BadgeState {
  text: string;
  /** Omitted when there is nothing to show. */
  color?: string;
}

/** Colour thresholds, in ascending order of alarm. */
export const BADGE_THRESHOLDS = [
  { max: 10, color: '#3d7a4a' }, // green  — focused, manageable
  { max: 20, color: '#b8892e' }, // amber  — getting busy
  { max: Infinity, color: '#b35a5a' }, // red — time to cull
] as const;

/** Counts real web pages, ignoring browser-internal and extension pages. */
export function countRealTabs(tabs: readonly { url?: string }[]): number {
  return tabs.filter((tab) => !isInternalUrl(tab.url)).length;
}

/** Maps a tab count to badge text and colour. Zero renders an empty badge. */
export function badgeStateForCount(count: number): BadgeState {
  if (count <= 0) return { text: '' };
  const threshold = BADGE_THRESHOLDS.find((t) => count <= t.max) ?? BADGE_THRESHOLDS[2];
  return { text: String(count), color: threshold.color };
}

/** Convenience: tabs → badge state. */
export function badgeStateForTabs(tabs: readonly Pick<TabInfo, 'url'>[]): BadgeState {
  return badgeStateForCount(countRealTabs(tabs));
}
