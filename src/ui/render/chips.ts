/**
 * ui/render/chips.ts — the little page pills inside each card.
 *
 * Pure string builders: they take data and return HTML, so they can be tested
 * without a DOM and reused by any card renderer.
 */

import type { TabInfo } from '../../types';
import { displayTitle, withLocalhostPort } from '../../core/title';
import { hostnameOf } from '../../core/url';
import { attr, escapeHtml, faviconUrl } from '../html';
import { ICONS } from '../icons';

/** How many chips a card shows before collapsing the rest behind "+N more". */
export const VISIBLE_CHIP_LIMIT = 8;

/** Builds the label shown on a chip. */
export function chipLabel(tab: TabInfo, groupHostname: string): string {
  const label = displayTitle(tab.title, tab.url, groupHostname);
  return withLocalhostPort(label, tab.url);
}

/**
 * Renders one page chip: favicon, title, duplicate badge, and the hover
 * actions (save for later / close).
 */
export function renderChip(tab: TabInfo, duplicateCount: number, groupHostname: string): string {
  const label = chipLabel(tab, groupHostname);
  const hostname = hostnameOf(tab.url);
  const favicon = faviconUrl(hostname, 16);
  const isDupe = duplicateCount > 1;

  return `<div class="page-chip clickable${isDupe ? ' chip-has-dupes' : ''}"
      data-action="focus-tab" data-tab-url="${attr(tab.url)}" title="${attr(label)}">
      ${favicon ? `<img class="chip-favicon" src="${attr(favicon)}" alt="" loading="lazy">` : ''}
      <span class="chip-text">${escapeHtml(label)}</span>${
        isDupe ? ` <span class="chip-dupe-badge">(${duplicateCount}x)</span>` : ''
      }
      <div class="chip-actions">
        <button class="chip-action chip-save" data-action="save-tab"
          data-tab-url="${attr(tab.url)}" data-tab-title="${attr(label)}" title="Save for later">
          ${ICONS.bookmark}
        </button>
        <button class="chip-action chip-close" data-action="close-tab"
          data-tab-url="${attr(tab.url)}" title="Close this tab">
          ${ICONS.closeBold}
        </button>
      </div>
    </div>`;
}

/**
 * Renders the hidden chips plus the "+N more" button that reveals them.
 * The overflow container is display:none until the button is clicked.
 */
export function renderOverflowChips(
  hiddenTabs: readonly TabInfo[],
  counts: Record<string, number>,
  groupHostname: string,
): string {
  if (hiddenTabs.length === 0) return '';
  const hidden = hiddenTabs
    .map((tab) => renderChip(tab, counts[tab.url] ?? 1, groupHostname))
    .join('');

  return `
    <div class="page-chips-overflow" style="display:none">${hidden}</div>
    <div class="page-chip page-chip-overflow clickable" data-action="expand-chips">
      <span class="chip-text">+${hiddenTabs.length} more</span>
    </div>`;
}
