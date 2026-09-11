/**
 * background/badge.ts — toolbar badge logic.
 *
 * Pure: maps a tab list to the text and colour the badge should show, so the
 * thresholds are testable without a browser.
 */

import { isInternalUrl } from '../core/url';

/** What the toolbar badge should display. */
export interface BadgeState {
  text: string;
  /** Omitted when there is nothing to show. */
  color?: string;
}

/** Colour thresholds, in ascending order of alarm. */
const THRESHOLDS = [
  { max: 10, color: '#3d7a4a' }, // green  — focused, manageable
  { max: 20, color: '#b8892e' }, // amber  — getting busy
  { max: Infinity, color: '#b35a5a' }, // red — time to cull
] as const;

/**
 * Counts real web pages — ignoring browser-internal and extension pages —
 * and maps that to badge text and colour. Zero renders an empty badge, which
 * reads better than a "0".
 */
export function badgeStateForTabs(tabs: readonly { url?: string }[]): BadgeState {
  const count = tabs.filter((tab) => !isInternalUrl(tab.url)).length;
  if (count === 0) return { text: '' };

  const threshold = THRESHOLDS.find((t) => count <= t.max) ?? THRESHOLDS[2];
  return { text: String(count), color: threshold.color };
}
