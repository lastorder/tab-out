/**
 * ui/render/cards.ts — the dashboard's cards, the page chips inside them, and
 * the "Pinned" strip above the grid.
 *
 * Pure string builders: data in, HTML out, so they are testable without a DOM.
 * Chips live here rather than in their own module because they are an
 * implementation detail of a card — nothing else renders them.
 */

import type { PinnedStripItem } from '../../core/grouping';
import type { TabGroup, TabInfo } from '../../types';
import { analyzeDuplicates, uniqueByUrl } from '../../core/duplicates';
import { friendlyDomain } from '../../core/domain';
import { DISPOSABLE_GROUP_KEY, DISPOSABLE_GROUP_LABEL } from '../../core/grouping';
import { displayTitle, withLocalhostPort } from '../../core/title';
import { hostnameOf } from '../../core/url';
import { escapeHtml, faviconUrl, plural } from '../html';
import { ICONS } from '../icons';

/** How many chips a card shows before collapsing the rest behind "+N more". */
export const VISIBLE_CHIP_LIMIT = 8;

/** Builds the label shown on a chip. */
function chipLabel(tab: TabInfo, groupHostname: string): string {
  const label = displayTitle(tab.title, tab.url, groupHostname);
  return withLocalhostPort(label, tab.url);
}

/**
 * Renders one page chip: favicon, title, duplicate badge, and the hover
 * actions (save for later / close).
 *
 * `isPinned` marks a tab whose hostname is in the user's Pinned sites list —
 * see {@link renderPinnedStrip} for the separate quick-access strip above the
 * grid. Pinning never moves a tab to a different card; it only highlights and
 * (see {@link renderGroupCard}) sorts it first within its own card.
 */
function renderChip(
  tab: TabInfo,
  duplicateCount: number,
  groupHostname: string,
  isPinned: boolean,
): string {
  const label = chipLabel(tab, groupHostname);
  const hostname = hostnameOf(tab.url);
  const favicon = faviconUrl(hostname, 16);
  const isDupe = duplicateCount > 1;

  return `<div class="page-chip clickable${isDupe ? ' chip-has-dupes' : ''}${isPinned ? ' chip-pinned' : ''}"
      data-action="focus-tab" data-tab-url="${escapeHtml(tab.url)}" title="${escapeHtml(label)}">
      ${isPinned ? `<span class="chip-pin-badge" title="Pinned">${ICONS.pin}</span>` : ''}
      ${favicon ? `<img class="chip-favicon" src="${escapeHtml(favicon)}" alt="" loading="lazy">` : ''}
      <span class="chip-text">${escapeHtml(label)}</span>${
        isDupe ? ` <span class="chip-dupe-badge">(${duplicateCount}x)</span>` : ''
      }
      <div class="chip-actions">
        <button class="chip-action chip-save" data-action="save-tab"
          data-tab-url="${escapeHtml(tab.url)}" data-tab-title="${escapeHtml(label)}" title="Save for later">
          ${ICONS.bookmark}
        </button>
        <button class="chip-action chip-close" data-action="close-tab"
          data-tab-url="${escapeHtml(tab.url)}" title="Close this tab">
          ${ICONS.closeBold}
        </button>
      </div>
    </div>`;
}

/**
 * Renders the hidden chips plus the "+N more" button that reveals them.
 * The overflow container is display:none until the button is clicked.
 */
function renderOverflowChips(
  hiddenTabs: readonly TabInfo[],
  counts: Record<string, number>,
  groupHostname: string,
  pinnedHostnames: ReadonlySet<string>,
): string {
  if (hiddenTabs.length === 0) return '';
  const hidden = hiddenTabs
    .map((tab) =>
      renderChip(tab, counts[tab.url] ?? 1, groupHostname, pinnedHostnames.has(hostnameOf(tab.url))),
    )
    .join('');

  return `
    <div class="page-chips-overflow" style="display:none">${hidden}</div>
    <div class="page-chip page-chip-overflow clickable" data-action="expand-chips">
      <span class="chip-text">+${hiddenTabs.length} more</span>
    </div>`;
}

/** The display name for a group: explicit label, else a friendly hostname. */
export function groupTitle(group: TabGroup): string {
  if (group.key === DISPOSABLE_GROUP_KEY) return group.label ?? DISPOSABLE_GROUP_LABEL;
  return group.label ?? friendlyDomain(group.key);
}

/**
 * Renders one group card.
 *
 * `index` is the group's position in the render order and is written to
 * `data-group-index`. Click handlers look groups up by that index rather than
 * by a slugified name, so keys containing punctuation can never collide.
 *
 * `pinnedHostnames` (empty when pinning is off) marks and sorts-first any tab
 * whose hostname is pinned — pinning acts within a card, never across cards.
 */
export function renderGroupCard(
  group: TabGroup,
  index: number,
  pinnedHostnames: ReadonlySet<string> = new Set(),
): string {
  const tabCount = group.tabs.length;
  const { counts, hasDuplicates, extraCount } = analyzeDuplicates(group.tabs);

  // Hostname context lets chip labels drop a redundant site-name suffix.
  const groupHostname = group.kind === 'domain' ? group.key : '';

  const unique = uniqueByUrl(group.tabs);
  const sorted = pinnedHostnames.size
    ? [...unique].sort((a, b) => {
        const aPinned = pinnedHostnames.has(hostnameOf(a.url));
        const bPinned = pinnedHostnames.has(hostnameOf(b.url));
        return aPinned === bPinned ? 0 : aPinned ? -1 : 1;
      })
    : unique;
  const visible = sorted.slice(0, VISIBLE_CHIP_LIMIT);
  const hidden = sorted.slice(VISIBLE_CHIP_LIMIT);

  const chips =
    visible
      .map((tab) =>
        renderChip(tab, counts[tab.url] ?? 1, groupHostname, pinnedHostnames.has(hostnameOf(tab.url))),
      )
      .join('') + renderOverflowChips(hidden, counts, groupHostname, pinnedHostnames);

  const dupeBadge = hasDuplicates
    ? `<span class="open-tabs-badge badge-amber">${escapeHtml(
        plural(extraCount, 'duplicate'),
      )}</span>`
    : '';

  const dedupeButton = hasDuplicates
    ? `<button class="action-btn" data-action="close-duplicates" data-group-index="${index}">
        Close ${escapeHtml(plural(extraCount, 'duplicate'))}
      </button>`
    : '';

  return `
    <div class="mission-card domain-card ${hasDuplicates ? 'has-amber-bar' : 'has-neutral-bar'}"
         data-group-index="${index}">
      <div class="status-bar"></div>
      <div class="mission-content">
        <div class="mission-top">
          <span class="mission-name">${escapeHtml(groupTitle(group))}</span>
          <span class="open-tabs-badge">${ICONS.tabs}${escapeHtml(plural(tabCount, 'tab'))} open</span>
          ${dupeBadge}
        </div>
        <div class="mission-pages">${chips}</div>
        <div class="actions">
          <button class="action-btn close-tabs" data-action="close-group" data-group-index="${index}">
            ${ICONS.close}Close all ${escapeHtml(plural(tabCount, 'tab'))}
          </button>
          ${dedupeButton}
        </div>
      </div>
      <div class="mission-meta">
        <div class="mission-page-count">${tabCount}</div>
        <div class="mission-page-label">tabs</div>
      </div>
    </div>`;
}

/**
 * Renders one chip in the "Pinned" strip above the grid: an open pinned tab
 * (click focuses it, same as any other chip) or a click-to-open placeholder
 * when nothing matching is currently open. Either way this is a single small
 * chip, never a full card — a pinned site never gets its own group.
 */
function renderPinnedStripItem(item: PinnedStripItem): string {
  const hostname = hostnameOf(item.site.url);
  const label = item.site.label || friendlyDomain(hostname) || item.site.url;
  const favicon = faviconUrl(hostname, 18);
  const isOpen = item.tab !== null;

  const actionAttrs = isOpen
    ? `data-action="focus-tab" data-tab-url="${escapeHtml(item.tab!.url)}"`
    : `data-action="open-pinned-site" data-pinned-url="${escapeHtml(item.site.url)}" data-pinned-index="${item.pinnedIndex}"`;

  return `
    <div class="pinned-chip${isOpen ? '' : ' pinned-chip-closed'} clickable" ${actionAttrs} title="${escapeHtml(label)}">
      ${ICONS.pin}
      ${favicon ? `<img class="pinned-chip-favicon" src="${escapeHtml(favicon)}" alt="" loading="lazy">` : ''}
      <span class="pinned-chip-text">${escapeHtml(label)}</span>
    </div>`;
}

/** Renders the whole "Pinned" strip's chips, or `''` when nothing is pinned. */
export function renderPinnedStrip(items: readonly PinnedStripItem[]): string {
  return items.map(renderPinnedStripItem).join('');
}

/** Renders every group card in the dashboard model, in order. */
export function renderGroups(
  groups: readonly TabGroup[],
  pinnedHostnames: ReadonlySet<string> = new Set(),
): string {
  return groups.map((group, index) => renderGroupCard(group, index, pinnedHostnames)).join('');
}

/** The "Inbox zero" state shown when every card is gone. */
export function renderEmptyState(): string {
  return `
    <div class="missions-empty-state">
      <div class="empty-checkmark">${ICONS.check}</div>
      <div class="empty-title">Inbox zero, but for tabs.</div>
      <div class="empty-subtitle">You're free.</div>
    </div>`;
}
