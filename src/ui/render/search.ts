/**
 * ui/render/search.ts — the Search overlay's result list.
 *
 * Visually modelled on the History panel's rows (`ui/render/history.ts`):
 * same favicon size, same title/meta layout. The one addition is a
 * `data-selected` row so keyboard navigation (arrow keys + Enter, wired in
 * `newtab/controller.ts`) has something to highlight and scroll into view.
 */

import type { SearchResult } from '../../core/search';
import { hostnameOf, stripWww } from '../../core/url';
import { escapeHtml, faviconUrl } from '../html';
import { ICONS } from '../icons';

function badge(result: SearchResult): string {
  return result.kind === 'tab'
    ? '<span class="search-result-badge search-result-badge-tab">Open</span>'
    : '<span class="search-result-badge search-result-badge-history">History</span>';
}

/** One selectable row. `index` drives `data-index` for keyboard navigation. */
export function renderSearchResult(result: SearchResult, index: number, selected: boolean): string {
  const domain = stripWww(hostnameOf(result.url));
  const favicon = faviconUrl(domain, 16);

  return `
    <button class="search-result${selected ? ' selected' : ''}" data-action="open-search-result"
            data-index="${index}" data-result-id="${escapeHtml(result.id)}"
            title="${escapeHtml(result.title)}">
      ${favicon ? `<img class="search-result-favicon" src="${escapeHtml(favicon)}" alt="" loading="lazy">` : ''}
      <span class="search-result-text">
        <span class="search-result-title">${escapeHtml(result.title)}</span>
        <span class="search-result-domain">${escapeHtml(domain)}</span>
      </span>
      ${badge(result)}
      <span class="search-result-hint">${ICONS.reopen}</span>
    </button>`;
}

/** The empty state shown when nothing matches. */
function renderSearchEmpty(hasQuery: boolean): string {
  return hasQuery
    ? `<div class="search-empty">No matching tabs or history.</div>`
    : `<div class="search-empty">Nothing open yet.</div>`;
}

/** Renders the full result list, or the empty state. `selectedIndex` of -1 means nothing is selected. */
export function renderSearchResults(
  results: readonly SearchResult[],
  selectedIndex: number,
  hasQuery: boolean,
): string {
  if (results.length === 0) return renderSearchEmpty(hasQuery);
  return results.map((result, i) => renderSearchResult(result, i, i === selectedIndex)).join('');
}
