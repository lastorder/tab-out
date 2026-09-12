/**
 * ui/render/cards.ts — the dashboard's cards and the page chips inside them.
 *
 * Pure string builders: data in, HTML out, so they are testable without a DOM.
 * Chips live here rather than in their own module because they are an
 * implementation detail of a card — nothing else renders them.
 */

import type { PinnedMatch, PinnedPlaceholder } from '../../core/grouping';
import type { TabGroup, TabInfo } from '../../types';
import { analyzeDuplicates, uniqueByUrl } from '../../core/duplicates';
import { friendlyDomain } from '../../core/domain';
import { groupDisplayTitle, matchPinnedSite } from '../../core/grouping';
import { displayTitle, withLocalhostPort } from '../../core/title';
import { hostnameOf } from '../../core/url';
import { escapeHtml, faviconUrl, plural } from '../html';
import { ICONS } from '../icons';

/** How many chips a card shows before collapsing the rest behind "+N more". */
export const VISIBLE_CHIP_LIMIT = 8;

/** One renderable chip: a real open tab, or a pinned-but-not-open placeholder. */
type ChipItem = { kind: 'tab'; tab: TabInfo } | { kind: 'placeholder'; placeholder: PinnedPlaceholder };

/** Builds the label shown on a chip, absent any pinned-label override. */
function chipLabel(tab: TabInfo, groupHostname: string): string {
  const label = displayTitle(tab.title, tab.url, groupHostname);
  return withLocalhostPort(label, tab.url);
}

/**
 * Renders one page chip: favicon, title, duplicate badge, and the hover
 * actions (save for later / close).
 *
 * `pinnedLabel`, when given, overrides the tab's own title — this is what
 * keeps a pinned site's configured label (e.g. "Google Calendar") showing
 * even after the tab navigates to a different path on the same hostname.
 */
function renderChip(
  tab: TabInfo,
  duplicateCount: number,
  groupHostname: string,
  pinnedLabel?: string,
): string {
  const label = pinnedLabel || chipLabel(tab, groupHostname);
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
 * Renders one pinned-but-not-open placeholder chip inside its card: a
 * grayed-out, click-to-open chip — not a card of its own, and not
 * closable/saveable like a real tab's chip.
 */
function renderPlaceholderChip(item: PinnedPlaceholder): string {
  const hostname = hostnameOf(item.site.url);
  const label = item.site.label || friendlyDomain(hostname) || item.site.url;
  const favicon = faviconUrl(hostname, 16);

  return `<div class="page-chip page-chip-placeholder clickable"
      data-action="open-pinned-site" data-pinned-url="${escapeHtml(item.site.url)}"
      data-pinned-index="${item.pinnedIndex}" title="${escapeHtml(label)} — click to open">
      ${favicon ? `<img class="chip-favicon" src="${escapeHtml(favicon)}" alt="" loading="lazy">` : ''}
      <span class="chip-text">${escapeHtml(label)}</span>
      <span class="chip-placeholder-hint">Click to open</span>
    </div>`;
}

/** A chip item's pinned priority (its configured position), or `undefined` when it isn't pinned. */
function itemPinnedIndex(item: ChipItem, pinnedMatches: readonly PinnedMatch[]): number | undefined {
  if (item.kind === 'placeholder') return item.placeholder.pinnedIndex;
  return matchPinnedSite(item.tab.url, pinnedMatches)?.pinnedIndex;
}

/** The text a chip item sorts (and, for a pinned tab, displays) by. */
function itemLabel(
  item: ChipItem,
  groupHostname: string,
  pinnedMatches: readonly PinnedMatch[],
): string {
  if (item.kind === 'placeholder') {
    const hostname = hostnameOf(item.placeholder.site.url);
    return item.placeholder.site.label || friendlyDomain(hostname) || item.placeholder.site.url;
  }
  const pinnedLabel = matchPinnedSite(item.tab.url, pinnedMatches)?.label;
  return pinnedLabel || chipLabel(item.tab, groupHostname);
}

/**
 * Orders a card's chips: pinned items first (real tab or placeholder alike),
 * in the order their sites are configured, then everything else
 * alphabetically by displayed label.
 */
function sortChipItems(
  items: readonly ChipItem[],
  groupHostname: string,
  pinnedMatches: readonly PinnedMatch[],
): ChipItem[] {
  return [...items].sort((a, b) => {
    const aIdx = itemPinnedIndex(a, pinnedMatches);
    const bIdx = itemPinnedIndex(b, pinnedMatches);
    const aPinned = aIdx !== undefined;
    const bPinned = bIdx !== undefined;
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    if (aPinned && bPinned && aIdx !== bIdx) return (aIdx as number) - (bIdx as number);

    return itemLabel(a, groupHostname, pinnedMatches).localeCompare(
      itemLabel(b, groupHostname, pinnedMatches),
    );
  });
}

/** Renders one chip item, dispatching on its kind. */
function renderChipItem(
  item: ChipItem,
  counts: Record<string, number>,
  groupHostname: string,
  pinnedMatches: readonly PinnedMatch[],
): string {
  if (item.kind === 'placeholder') return renderPlaceholderChip(item.placeholder);
  const pinnedLabel = matchPinnedSite(item.tab.url, pinnedMatches)?.label;
  return renderChip(item.tab, counts[item.tab.url] ?? 1, groupHostname, pinnedLabel);
}

/**
 * Renders the hidden chips plus the "+N more" button that reveals them.
 * The overflow container is display:none until the button is clicked.
 */
function renderOverflowItems(
  hiddenItems: readonly ChipItem[],
  counts: Record<string, number>,
  groupHostname: string,
  pinnedMatches: readonly PinnedMatch[],
): string {
  if (hiddenItems.length === 0) return '';
  const hidden = hiddenItems
    .map((item) => renderChipItem(item, counts, groupHostname, pinnedMatches))
    .join('');

  return `
    <div class="page-chips-overflow" style="display:none">${hidden}</div>
    <div class="page-chip page-chip-overflow clickable" data-action="expand-chips">
      <span class="chip-text">+${hiddenItems.length} more</span>
    </div>`;
}

/** The display name for a group: explicit label, else a friendly hostname. */
export function groupTitle(group: TabGroup): string {
  return groupDisplayTitle(group);
}

/**
 * Renders one group card.
 *
 * `index` is the group's position in the render order and is written to
 * `data-group-index`. Click handlers look groups up by that index rather than
 * by a slugified name, so keys containing punctuation can never collide.
 *
 * `placeholders` (empty unless a pinned site with no open tab belongs under
 * this card) renders as extra grayed, click-to-open chips — pinning surfaces
 * inside its own card, it never gets one of its own. A card can have
 * placeholders with zero real tabs at all (`tabCount` is 0), in which case
 * the tab-count badge and "Close all" button are omitted.
 *
 * `pinnedMatches` (empty when pinning is off) sorts pinned chips — real or
 * placeholder — first, in configured order, ahead of every other chip, which
 * instead sorts alphabetically by its displayed label. A real tab counts as
 * pinned only when a pinned site claims its hostname *and* path prefix, so
 * one deep pin on a big site never relabels every other tab on that host.
 */
export function renderGroupCard(
  group: TabGroup,
  index: number,
  placeholders: readonly PinnedPlaceholder[] = [],
  pinnedMatches: readonly PinnedMatch[] = [],
): string {
  const tabCount = group.tabs.length;
  const { counts, hasDuplicates, extraCount } = analyzeDuplicates(group.tabs);

  // Hostname context lets chip labels drop a redundant site-name suffix.
  const groupHostname = group.kind === 'domain' ? group.key : '';

  const items: ChipItem[] = [
    ...uniqueByUrl(group.tabs).map((tab): ChipItem => ({ kind: 'tab', tab })),
    ...placeholders.map((placeholder): ChipItem => ({ kind: 'placeholder', placeholder })),
  ];
  const sorted = sortChipItems(items, groupHostname, pinnedMatches);
  const visible = sorted.slice(0, VISIBLE_CHIP_LIMIT);
  const hidden = sorted.slice(VISIBLE_CHIP_LIMIT);

  const chips =
    visible.map((item) => renderChipItem(item, counts, groupHostname, pinnedMatches)).join('') +
    renderOverflowItems(hidden, counts, groupHostname, pinnedMatches);

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

  const tabsBadge =
    tabCount > 0
      ? `<span class="open-tabs-badge">${ICONS.tabs}${escapeHtml(plural(tabCount, 'tab'))} open</span>`
      : '';

  const closeAllButton =
    tabCount > 0
      ? `<button class="action-btn close-tabs" data-action="close-group" data-group-index="${index}">
            ${ICONS.close}Close all ${escapeHtml(plural(tabCount, 'tab'))}
          </button>`
      : '';

  return `
    <div class="mission-card domain-card ${hasDuplicates ? 'has-amber-bar' : 'has-neutral-bar'}${
    tabCount === 0 ? ' pinned-only-card' : ''
  }"
         data-group-index="${index}">
      <div class="status-bar"></div>
      <div class="mission-content">
        <div class="mission-top">
          <span class="mission-name">${escapeHtml(groupTitle(group))}</span>
          ${tabsBadge}
          ${dupeBadge}
        </div>
        <div class="mission-pages">${chips}</div>
        <div class="actions">
          ${closeAllButton}
          ${dedupeButton}
        </div>
      </div>
      <div class="mission-meta">
        <div class="mission-page-count">${tabCount}</div>
        <div class="mission-page-label">tabs</div>
      </div>
    </div>`;
}

/** Renders every group card in the dashboard model, in order. */
export function renderGroups(
  groups: readonly TabGroup[],
  placeholders: ReadonlyMap<string, PinnedPlaceholder[]> = new Map(),
  pinnedMatches: readonly PinnedMatch[] = [],
): string {
  return groups
    .map((group, index) =>
      renderGroupCard(group, index, placeholders.get(group.key) ?? [], pinnedMatches),
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
