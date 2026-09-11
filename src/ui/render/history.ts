/**
 * ui/render/history.ts — the History panel's list of closed tabs.
 *
 * Visually modelled on the "Saved for later" rows (`ui/render/saved.ts`) so
 * the panel reads as part of the same product rather than a bolted-on
 * feature: same favicon size, same title/meta layout, same hover actions.
 */

import type { ClosedTabEntry } from '../../types';
import { timeAgo } from '../../core/time';
import { hostnameOf, stripWww } from '../../core/url';
import { attr, escapeHtml, faviconUrl } from '../html';
import { ICONS } from '../icons';

/**
 * One row: the whole row is a button that reopens the tab (large click
 * target, matches how a "closed tab" naturally wants one primary action),
 * plus a small secondary button to remove it without reopening.
 */
export function renderHistoryItem(entry: ClosedTabEntry, now: Date = new Date()): string {
  const domain = stripWww(hostnameOf(entry.url));
  const favicon = faviconUrl(domain, 16);
  const title = entry.title || entry.url;

  return `
    <div class="history-item" data-history-id="${attr(entry.id)}">
      <button class="history-item-open" data-action="reopen-history"
              data-history-id="${attr(entry.id)}" data-history-url="${attr(entry.url)}"
              title="Reopen ${attr(title)}">
        ${favicon ? `<img class="history-favicon" src="${attr(favicon)}" alt="" loading="lazy">` : ''}
        <span class="history-item-text">
          <span class="history-item-title">${escapeHtml(title)}</span>
          <span class="history-item-meta">
            <span class="history-item-domain">${escapeHtml(domain)}</span>
            <span class="history-item-dot">&middot;</span>
            <span class="history-item-time">${escapeHtml(timeAgo(entry.closedAt, now))}</span>
          </span>
        </span>
        <span class="history-item-reopen-hint">${ICONS.reopen}</span>
      </button>
      <button class="history-item-remove" data-action="remove-history"
              data-history-id="${attr(entry.id)}" title="Remove from history">
        ${ICONS.close}
      </button>
    </div>`;
}

/** The empty state shown when there is nothing to reopen (or no search match). */
export function renderHistoryEmpty(hasQuery: boolean): string {
  return hasQuery
    ? `<div class="history-empty">No matching closed tabs.</div>`
    : `<div class="history-empty">No closed tabs yet. Close one and it'll show up here.</div>`;
}

/** Renders the full list, or the appropriate empty state. */
export function renderHistoryList(
  entries: readonly ClosedTabEntry[],
  hasQuery: boolean,
  now: Date = new Date(),
): string {
  if (entries.length === 0) return renderHistoryEmpty(hasQuery);
  return entries.map((entry) => renderHistoryItem(entry, now)).join('');
}
