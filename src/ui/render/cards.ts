/**
 * ui/render/cards.ts — the dashboard's cards and the page chips inside them.
 *
 * Pure string builders: data in, HTML out, so they are testable without a DOM.
 * Chips live here rather than in their own module because they are an
 * implementation detail of a card — nothing else renders them.
 */

import type { DashboardEntry } from '../../core/grouping';
import type { PinnedSite, TabGroup, TabInfo } from '../../types';
import { analyzeDuplicates, uniqueByUrl } from '../../core/duplicates';
import { friendlyDomain } from '../../core/domain';
import { LANDING_GROUP_KEY, LANDING_GROUP_LABEL } from '../../core/grouping';
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
 */
function renderChip(tab: TabInfo, duplicateCount: number, groupHostname: string): string {
  const label = chipLabel(tab, groupHostname);
  const hostname = hostnameOf(tab.url);
  const favicon = faviconUrl(hostname, 16);
  const isDupe = duplicateCount > 1;

  return `<div class="page-chip clickable${isDupe ? ' chip-has-dupes' : ''}"
      data-action="focus-tab" data-tab-url="${escapeHtml(tab.url)}" title="${escapeHtml(label)}">
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

/** The display name for a group: explicit label, else a friendly hostname. */
export function groupTitle(group: TabGroup): string {
  if (group.key === LANDING_GROUP_KEY) return group.label ?? LANDING_GROUP_LABEL;
  return group.label ?? friendlyDomain(group.key);
}

/**
 * Renders one group card.
 *
 * `index` is the group's position in the render order and is written to
 * `data-group-index`. Click handlers look groups up by that index rather than
 * by a slugified name, so keys containing punctuation can never collide.
 */
export function renderGroupCard(group: TabGroup, index: number): string {
  const tabs = group.tabs;
  const tabCount = tabs.length;
  const { counts, hasDuplicates, extraCount } = analyzeDuplicates(tabs);

  // Hostname context lets chip labels drop a redundant site-name suffix.
  const groupHostname = group.kind === 'domain' ? group.key : '';

  const unique = uniqueByUrl(tabs);
  const visible = unique.slice(0, VISIBLE_CHIP_LIMIT);
  const hidden = unique.slice(VISIBLE_CHIP_LIMIT);

  const chips =
    visible.map((tab) => renderChip(tab, counts[tab.url] ?? 1, groupHostname)).join('') +
    renderOverflowChips(hidden, counts, groupHostname);

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
 * Renders a greyed-out card for a pinned site with no open tabs.
 * Clicking it opens the site.
 */
export function renderPinnedPlaceholder(site: PinnedSite, pinnedIndex: number): string {
  const hostname = hostnameOf(site.url);
  const label = site.label || friendlyDomain(hostname) || site.url;
  const favicon = faviconUrl(hostname, 32);

  return `
    <div class="mission-card domain-card pinned-placeholder"
         data-action="open-pinned-site"
         data-pinned-url="${escapeHtml(site.url)}"
         data-pinned-index="${pinnedIndex}">
      <div class="status-bar"></div>
      <div class="mission-content">
        <div class="mission-top">
          ${favicon ? `<img class="pinned-favicon" src="${escapeHtml(favicon)}" alt="" loading="lazy">` : ''}
          <span class="mission-name">${escapeHtml(label)}</span>
        </div>
        <div class="pinned-hint">Click to open</div>
      </div>
    </div>`;
}

/** Renders every card in the dashboard model, in order. */
export function renderEntries(entries: readonly DashboardEntry[]): string {
  let groupIndex = 0;
  return entries
    .map((entry) =>
      entry.type === 'group'
        ? renderGroupCard(entry.group, groupIndex++)
        : renderPinnedPlaceholder(entry.site, entry.pinnedIndex),
    )
    .join('');
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
