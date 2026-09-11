/**
 * ui/render/saved.ts — the "Saved for later" sidebar.
 *
 * Rows open via `data-action="open-saved"` rather than a plain `<a href>`,
 * because Chrome blocks top-level navigation to `file://` from an extension
 * page — a saved local file could never be reopened by clicking a link.
 * Going through `chrome.tabs.create` (see `TabActions.openOrFocusTab`)
 * sidesteps that restriction.
 */

import type { SavedTab } from '../../types';
import { timeAgo } from '../../core/time';
import { hostnameOf, stripWww } from '../../core/url';
import { escapeHtml, faviconUrl } from '../html';
import { ICONS } from '../icons';

/** One active checklist row: checkbox, title, metadata, dismiss button. */
export function renderSavedItem(item: SavedTab, now: Date = new Date()): string {
  const domain = stripWww(hostnameOf(item.url));
  const favicon = faviconUrl(domain, 16);
  const title = item.title || item.url;

  return `
    <div class="deferred-item" data-deferred-id="${escapeHtml(item.id)}">
      <input type="checkbox" class="deferred-checkbox"
             data-action="complete-saved" data-deferred-id="${escapeHtml(item.id)}">
      <div class="deferred-info">
        <button type="button" class="deferred-title" data-action="open-saved"
                data-saved-url="${escapeHtml(item.url)}" title="${escapeHtml(title)}">
          ${favicon ? `<img class="deferred-favicon" src="${escapeHtml(favicon)}" alt="" loading="lazy">` : ''}${escapeHtml(title)}
        </button>
        <div class="deferred-meta">
          <span>${escapeHtml(domain)}</span>
          <span>${escapeHtml(timeAgo(item.savedAt, now))}</span>
        </div>
      </div>
      <button class="deferred-dismiss" data-action="dismiss-saved"
              data-deferred-id="${escapeHtml(item.id)}" title="Dismiss">
        ${ICONS.close}
      </button>
    </div>`;
}

/** One archived row: just a title and when it was checked off. */
export function renderArchiveItem(item: SavedTab, now: Date = new Date()): string {
  const when = timeAgo(item.completedAt ?? item.savedAt, now);
  const title = item.title || item.url;
  return `
    <div class="archive-item">
      <button type="button" class="archive-item-title" data-action="open-saved"
              data-saved-url="${escapeHtml(item.url)}" title="${escapeHtml(title)}">${escapeHtml(title)}</button>
      <span class="archive-item-date">${escapeHtml(when)}</span>
    </div>`;
}

/** Renders a list of archived items, or a "no results" note. */
export function renderArchiveList(items: readonly SavedTab[], now: Date = new Date()): string {
  if (items.length === 0) {
    return '<div class="archive-empty">No results</div>';
  }
  return items.map((item) => renderArchiveItem(item, now)).join('');
}
