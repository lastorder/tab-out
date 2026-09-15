/**
 * popup/main.ts — the browser-global search box.
 *
 * Opened by the global search command (`core/global-commands.ts`) or by a
 * click on the toolbar icon, this is the extension's action popup rather than
 * a page inside the current tab. That is what lets it appear while some other
 * site has focus without Tab Out needing permission to read that site.
 *
 * It reuses the dashboard's Search pipeline unchanged: `core/search.ts`
 * decides the results, `ui/render/search.ts` produces the rows, and every
 * mutation goes through `TabActions`. Only the surrounding wiring is new —
 * there is no dashboard render loop here, so this file owns the (much
 * smaller) render/select loop itself.
 *
 * Composition root: this is the one place allowed to construct the concrete
 * adapters.
 */

import { clampSelection, moveSelection, searchTabsAndHistory, type SearchResult } from '../core/search';
import { isInternalUrl } from '../core/url';
import { createChromeBrowserTabs } from '../platform/browser';
import { createChromeStore } from '../platform/storage';
import { TabActions } from '../services/tab-actions';
import { TabHistoryService } from '../services/tab-history';
import { renderSearchResults } from '../ui/render/search';

const tabActions = new TabActions(createChromeBrowserTabs());
const historyService = new TabHistoryService(createChromeStore('local'));

const input = document.getElementById('searchInput') as HTMLInputElement | null;
const list = document.getElementById('searchResults');
const footer = document.getElementById('popupFooter');

let results: SearchResult[] = [];
let selectedIndex = -1;

/** Renders the current `results`/`selectedIndex` into the list. */
function paint(query: string): void {
  if (!list) return;
  selectedIndex = clampSelection(selectedIndex, results.length);
  list.innerHTML = renderSearchResults(results, selectedIndex, query.trim().length > 0);
  list.querySelector('.search-result.selected')?.scrollIntoView({ block: 'nearest' });
}

/**
 * Recomputes the result list for `query`.
 *
 * Open tabs are filtered through `isInternalUrl` so the popup never offers to
 * jump to a Tab Out page, another extension, or `about:blank` — the same
 * pages the dashboard deliberately leaves out of its cards. Closed-tab
 * history is filtered against what's open, exactly as the dashboard does, so
 * a "closed" entry that is open again can't appear twice.
 */
async function refresh(query: string): Promise<void> {
  const tabs = (await tabActions.queryAllTabs()).filter((tab) => !isInternalUrl(tab.url));
  const openUrls = new Set(tabs.map((tab) => tab.url));
  const history = await historyService.list(openUrls);

  results = searchTabsAndHistory(tabs, history, query);
  selectedIndex = results.length > 0 ? 0 : -1;
  paint(query);
}

/**
 * Opens the highlighted row and closes the popup.
 *
 * Reopening a history entry consumes it — the dashboard's History panel has
 * the same rule, so the two stay consistent.
 */
async function openSelected(): Promise<void> {
  const result = results[selectedIndex];
  if (!result) return;

  const outcome = await tabActions.openOrFocusTab(result.url);
  if (result.kind === 'history' && result.historyId && outcome !== 'failed') {
    await historyService.removeById(result.historyId);
  }
  window.close();
}

/** Re-renders for the current input value. */
async function refreshFromInput(): Promise<void> {
  await refresh(input?.value ?? '');
}

input?.addEventListener('input', () => {
  void refreshFromInput();
});

input?.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    selectedIndex = moveSelection(selectedIndex, event.key === 'ArrowDown' ? 1 : -1, results.length);
    paint(input.value);
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    void openSelected();
    return;
  }

  // Escape closes the popup. Chrome also closes it on focus loss; handling
  // the key explicitly keeps the behaviour identical on every platform.
  if (event.key === 'Escape') {
    event.preventDefault();
    window.close();
  }
});

// One delegated listener for the whole list, mirroring the dashboard's
// `data-action` convention rather than attaching a handler per row.
list?.addEventListener('click', (event) => {
  const row = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-action="open-search-result"]');
  if (!row) return;
  const index = Number(row.dataset['index'] ?? -1);
  if (index < 0 || index >= results.length) return;
  selectedIndex = index;
  void openSelected();
});

if (footer) {
  footer.innerHTML = '<span><kbd>&uarr;</kbd> <kbd>&darr;</kbd> to move</span><span><kbd>Enter</kbd> to open</span>';
}

// Opening the popup should leave the cursor in the box, ready to type.
input?.focus();
void refreshFromInput();
