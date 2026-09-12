/**
 * newtab/controller.ts — all user interaction for the dashboard.
 *
 * One delegated listener on `document` handles every click: elements declare
 * what they do with `data-action`, and this file maps those names to service
 * calls. Adding a feature means adding a renderer that emits a `data-action`
 * and one case here.
 */

import type { Dashboard } from './dashboard';
import { analyzeDuplicates } from '../core/duplicates';
import { moveSelection } from '../core/search';
import { matchesShortcut } from '../core/shortcut';
import { groupTitle } from '../ui/render/cards';
import { renderArchiveList } from '../ui/render/saved';
import { describeTidyBreakdown } from './dashboard';
import { animateCardOut, burstFrom, fadeOut, playCloseSound } from '../ui/effects';
import { showToast } from '../ui/toast';
import { plural } from '../ui/html';

/** Every interactive `data-action` the dashboard understands. */
export type DashboardAction =
  | 'sort-tabs'
  | 'open-pinned-site'
  | 'open-settings'
  | 'expand-chips'
  | 'focus-tab'
  | 'close-tab'
  | 'save-tab'
  | 'open-saved'
  | 'complete-saved'
  | 'dismiss-saved'
  | 'close-group'
  | 'close-duplicates'
  | 'close-all-tabs'
  | 'tidy-tabs'
  | 'open-history'
  | 'close-history'
  | 'reopen-history'
  | 'remove-history'
  | 'clear-history'
  | 'close-search'
  | 'open-search-result';

/**
 * Coalesces browser tab events into one repaint, and lets the UI temporarily
 * mute itself.
 *
 * Without the mute, closing a tab from the dashboard would trigger
 * `chrome.tabs.onRemoved`, which would repaint mid-animation and make the
 * confetti vanish. `suppress()` gives the animation time to finish.
 *
 * Crucially, muting is a *delay*, not a *drop*: `suppress()` always queues a
 * catch-up repaint for when the window expires. The close handlers edit the
 * DOM directly for instant feedback, but only a real render can recompute
 * derived state — most visibly, a pinned site whose last tab just closed has
 * to come back as a click-to-open placeholder rather than vanish. Before the
 * catch-up existed, the muted event was swallowed and that state stayed
 * wrong until the user refreshed the page.
 */
export class RenderScheduler {
  readonly #render: () => Promise<void>;
  readonly #debounceMs: number;
  #timer: number | null = null;
  #catchUpTimer: number | null = null;
  #mutedUntil = 0;

  constructor(render: () => Promise<void>, debounceMs = 300) {
    this.#render = render;
    this.#debounceMs = debounceMs;
  }

  schedule(): void {
    if (Date.now() < this.#mutedUntil) return;
    if (this.#timer !== null) window.clearTimeout(this.#timer);
    this.#timer = window.setTimeout(() => {
      this.#timer = null;
      void this.#render();
    }, this.#debounceMs);
  }

  /**
   * Call before closing tabs programmatically. Repaints are paused for `ms`,
   * then one catch-up repaint reconciles whatever changed meanwhile.
   */
  suppress(ms = 800): void {
    this.#mutedUntil = Date.now() + ms;
    if (this.#timer !== null) {
      window.clearTimeout(this.#timer);
      this.#timer = null;
    }

    // Overlapping suppressions collapse into a single catch-up.
    if (this.#catchUpTimer !== null) window.clearTimeout(this.#catchUpTimer);
    this.#catchUpTimer = window.setTimeout(() => {
      this.#catchUpTimer = null;
      void this.#render();
    }, ms + 50);
  }
}

/** Fades a banner out and hides it. */
function dismissBanner(id: string): void {
  const banner = document.getElementById(id);
  if (!banner) return;
  banner.style.transition = 'opacity 0.4s';
  banner.style.opacity = '0';
  window.setTimeout(() => {
    banner.style.display = 'none';
    banner.style.opacity = '1';
  }, 400);
}

/**
 * Toasts the outcome of `TabActions.openOrFocusTab`.
 *
 * `announceSuccess` is off for the common "just clicked a saved link" case —
 * that should feel like a plain link, not narrate itself — but on for
 * History's explicit "reopen", which is a restore action worth confirming.
 */
function toastOpenResult(
  result: 'focused' | 'created' | 'failed',
  url: string,
  announceSuccess: boolean,
): void {
  if (result === 'focused') {
    showToast('Already open — switched to it');
  } else if (result === 'created') {
    if (announceSuccess) showToast('Tab reopened');
  } else if (url.startsWith('file://')) {
    showToast('Couldn\u2019t open — enable "Allow access to file URLs" for Tab Out');
  } else {
    showToast('Couldn\u2019t open that tab');
  }
}

/** Wires every dashboard interaction. Returns a teardown function. */
export function attachController(
  dashboard: Dashboard,
  scheduler: RenderScheduler,
): () => void {
  const { tabActions, savedTabs, historyService } = dashboard.deps;

  const openHistoryPanel = (): void => {
    const overlay = document.getElementById('historyOverlay');
    if (overlay) overlay.style.display = 'flex';
  };

  const closeHistoryPanel = (): void => {
    const overlay = document.getElementById('historyOverlay');
    if (overlay) overlay.style.display = 'none';
  };

  const openSearchPanel = (): void => {
    const overlay = document.getElementById('searchOverlay');
    if (overlay) overlay.style.display = 'flex';
    const input = document.getElementById('searchInput') as HTMLInputElement | null;
    if (input) {
      input.value = '';
      input.focus();
    }
    void dashboard.renderSearchPanel('', 0);
  };

  const closeSearchPanel = (): void => {
    const overlay = document.getElementById('searchOverlay');
    if (overlay) overlay.style.display = 'none';
  };

  const isSearchPanelOpen = (): boolean =>
    (document.getElementById('searchOverlay') as HTMLElement | null)?.style.display === 'flex';

  /** Opens or focuses the tab/history result at `index`, then closes the overlay. */
  const openSearchResult = async (index: number): Promise<void> => {
    const result = dashboard.searchResults[index];
    if (!result) return;

    const outcome = await tabActions.openOrFocusTab(result.url);
    if (result.kind === 'history' && result.historyId && outcome !== 'failed') {
      await historyService.removeById(result.historyId);
    }
    closeSearchPanel();
    toastOpenResult(outcome, result.url, result.kind === 'history');
  };

  const onClick = async (event: MouseEvent): Promise<void> => {
    const target = event.target as HTMLElement | null;
    const actionEl = target?.closest<HTMLElement>('[data-action]');
    if (!actionEl) return;

    const action = actionEl.dataset['action'] as DashboardAction | undefined;
    if (!action) return;

    const card = actionEl.closest<HTMLElement>('.mission-card');
    const groupIndex = Number(actionEl.dataset['groupIndex'] ?? -1);

    switch (action) {
      case 'open-settings': {
        chrome.runtime.openOptionsPage();
        return;
      }

      case 'sort-tabs': {
        await tabActions.sortTabs(dashboard.desiredOrder);
        dismissBanner('tabSortBanner');
        showToast('Tabs sorted to match dashboard');
        return;
      }

      case 'open-pinned-site': {
        const url = actionEl.dataset['pinnedUrl'];
        if (!url) return;
        const pinnedIndex = Number(actionEl.dataset['pinnedIndex'] ?? 0) || 0;
        await tabActions.openPinnedSite(
          { url },
          pinnedIndex,
          dashboard.settings.pinnedSites,
        );
        return;
      }

      case 'expand-chips': {
        const overflow = actionEl.parentElement?.querySelector<HTMLElement>('.page-chips-overflow');
        if (overflow) overflow.style.display = 'contents';
        actionEl.remove();
        return;
      }

      case 'focus-tab': {
        const url = actionEl.dataset['tabUrl'];
        if (url) await tabActions.focus(url);
        return;
      }

      case 'close-tab': {
        event.stopPropagation();
        const url = actionEl.dataset['tabUrl'];
        if (!url) return;

        scheduler.suppress();
        await tabActions.closeByUrl(url);
        playCloseSound();

        const chip = actionEl.closest<HTMLElement>('.page-chip');
        if (chip) {
          burstFrom(chip);
          await fadeOut(chip);
          dashboard.pruneEmptyCards();
        }

        showToast('Tab closed');
        return;
      }

      case 'save-tab': {
        event.stopPropagation();
        const url = actionEl.dataset['tabUrl'];
        if (!url) return;
        const title = actionEl.dataset['tabTitle'] || url;

        try {
          await savedTabs.save({ url, title });
        } catch (err) {
          console.error('[tab-out] Failed to save tab:', err);
          showToast('Failed to save tab');
          return;
        }

        scheduler.suppress();
        await tabActions.closeByUrl(url);

        const chip = actionEl.closest<HTMLElement>('.page-chip');
        if (chip) await fadeOut(chip);

        showToast('Saved for later');
        await dashboard.renderSavedColumn();
        return;
      }

      case 'open-saved': {
        const url = actionEl.dataset['savedUrl'];
        if (!url) return;

        const result = await tabActions.openOrFocusTab(url);
        toastOpenResult(result, url, false);
        return;
      }

      case 'complete-saved': {
        const id = actionEl.dataset['deferredId'];
        if (!id) return;
        await savedTabs.complete(id);

        const item = actionEl.closest<HTMLElement>('.deferred-item');
        if (!item) return;
        // Strike it through briefly so the check-off is visible, then remove.
        item.classList.add('checked');
        window.setTimeout(() => {
          item.classList.add('removing');
          window.setTimeout(() => {
            item.remove();
            void dashboard.renderSavedColumn();
            // Completing removes the URL from the active saved list, which
            // can change whether an open tab still counts as "safe to tidy".
            void dashboard.refreshTidyButton();
          }, 300);
        }, 800);
        return;
      }

      case 'dismiss-saved': {
        const id = actionEl.dataset['deferredId'];
        if (!id) return;
        await savedTabs.dismiss(id);

        const item = actionEl.closest<HTMLElement>('.deferred-item');
        if (!item) return;
        item.classList.add('removing');
        window.setTimeout(() => {
          item.remove();
          void dashboard.renderSavedColumn();
          // Dismissing also drops the URL from the active saved list.
          void dashboard.refreshTidyButton();
        }, 300);
        return;
      }

      case 'close-group': {
        const group = dashboard.groupAt(groupIndex);
        if (!group) return;

        scheduler.suppress();
        const closed = await tabActions.closeGroup(group);
        playCloseSound();
        if (card) animateCardOut(card, () => dashboard.checkEmptyState());

        showToast(`Closed ${plural(closed, 'tab')} from ${groupTitle(group)}`);
        return;
      }

      case 'close-duplicates': {
        const group = dashboard.groupAt(groupIndex);
        if (!group) return;

        const { duplicateUrls } = analyzeDuplicates(group.tabs);
        if (duplicateUrls.length === 0) return;

        scheduler.suppress();
        await tabActions.closeDuplicates(duplicateUrls, true);
        playCloseSound();

        void fadeOut(actionEl);
        if (card) {
          card.querySelectorAll<HTMLElement>('.chip-dupe-badge, .badge-amber').forEach((el) => {
            void fadeOut(el);
          });
          card.classList.remove('has-amber-bar');
          card.classList.add('has-neutral-bar');
        }

        showToast('Closed duplicates, kept one copy each');
        return;
      }

      case 'close-all-tabs': {
        scheduler.suppress(1200);
        await tabActions.closeAllRealTabs();
        playCloseSound();

        document
          .querySelectorAll<HTMLElement>('#openTabsMissions .mission-card')
          .forEach((el) => animateCardOut(el, () => dashboard.checkEmptyState()));

        showToast('All tabs closed. Fresh start.');
        return;
      }

      case 'tidy-tabs': {
        const { tabIds, breakdown } = dashboard.tidySelection;
        if (tabIds.length === 0) return;

        // Unlike "Close all", Tidy usually leaves tabs open — most cards
        // survive, just smaller. Rather than guess which chips vanished
        // (several tabs can share one on-screen chip: duplicates collapse to
        // one), animate nothing here and let the catch-up render that
        // `suppress()` already schedules repaint the grid correctly once
        // the tabs have actually closed.
        scheduler.suppress(1200);
        await tabActions.closeTabs(tabIds);
        playCloseSound();
        burstFrom(actionEl);

        showToast(`Closed ${plural(tabIds.length, 'tab')} — ${describeTidyBreakdown(breakdown)}`);
        return;
      }

      case 'open-history': {
        openHistoryPanel();
        await dashboard.renderHistoryPanel(dashboard.currentHistoryQuery());
        return;
      }

      case 'close-history': {
        closeHistoryPanel();
        return;
      }

      case 'reopen-history': {
        const url = actionEl.dataset['historyUrl'];
        const id = actionEl.dataset['historyId'];
        if (!url) return;

        const result = await tabActions.openOrFocusTab(url);
        if (id && result !== 'failed') await historyService.removeById(id);
        await dashboard.renderHistoryPanel(dashboard.currentHistoryQuery());

        toastOpenResult(result, url, true);
        return;
      }

      case 'remove-history': {
        const id = actionEl.dataset['historyId'];
        if (!id) return;

        const row = actionEl.closest<HTMLElement>('.history-item');
        await historyService.removeById(id);
        if (row) await fadeOut(row);
        await dashboard.renderHistoryPanel(dashboard.currentHistoryQuery());
        return;
      }

      case 'clear-history': {
        if (!window.confirm('Clear all closed-tab history? This cannot be undone.')) return;
        await historyService.clear();
        await dashboard.renderHistoryPanel(dashboard.currentHistoryQuery());
        showToast('History cleared');
        return;
      }

      case 'close-search': {
        closeSearchPanel();
        return;
      }

      case 'open-search-result': {
        const index = Number(actionEl.dataset['index'] ?? -1);
        if (index < 0) return;
        await openSearchResult(index);
        return;
      }
    }
  };

  const onArchiveToggle = (event: MouseEvent): void => {
    const toggle = (event.target as HTMLElement | null)?.closest('#archiveToggle');
    if (!toggle) return;
    toggle.classList.toggle('open');
    const body = document.getElementById('archiveBody');
    if (body) body.style.display = body.style.display === 'none' ? 'block' : 'none';
  };

  const onArchiveSearch = async (event: Event): Promise<void> => {
    const input = event.target as HTMLInputElement | null;
    if (!input || input.id !== 'archiveSearch') return;
    const list = document.getElementById('archiveList');
    if (!list) return;

    try {
      const results = await savedTabs.searchArchive(input.value);
      list.innerHTML = renderArchiveList(results);
    } catch (err) {
      console.warn('[tab-out] Archive search failed:', err);
    }
  };

  const onHistorySearch = async (event: Event): Promise<void> => {
    const input = event.target as HTMLInputElement | null;
    if (!input || input.id !== 'historySearch') return;
    await dashboard.renderHistoryPanel(input.value);
  };

  const onSearchInput = async (event: Event): Promise<void> => {
    const input = event.target as HTMLInputElement | null;
    if (!input || input.id !== 'searchInput') return;
    await dashboard.renderSearchPanel(input.value, 0);
  };

  /** Clicking the dark backdrop (not the modal card itself) closes the panel. */
  const onHistoryBackdropClick = (event: MouseEvent): void => {
    if (event.target === document.getElementById('historyOverlay')) closeHistoryPanel();
  };

  const onSearchBackdropClick = (event: MouseEvent): void => {
    if (event.target === document.getElementById('searchOverlay')) closeSearchPanel();
  };

  /**
   * Global keyboard handling: the configurable shortcut toggles the Search
   * overlay from anywhere on the page (not just while an input is focused —
   * that's the whole point of a shortcut), Escape closes whichever overlay
   * is open, and — while the Search overlay is open — the arrow keys move
   * its selection and Enter opens/focuses the highlighted result.
   */
  const onKeydown = (event: KeyboardEvent): void => {
    if (matchesShortcut(event, dashboard.settings.searchShortcut)) {
      event.preventDefault();
      if (isSearchPanelOpen()) {
        closeSearchPanel();
      } else {
        openSearchPanel();
      }
      return;
    }

    if (event.key === 'Escape') {
      if (isSearchPanelOpen()) closeSearchPanel();
      else closeHistoryPanel();
      return;
    }

    if (!isSearchPanelOpen()) return;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const next = moveSelection(dashboard.searchSelectedIndex, delta, dashboard.searchResults.length);
      void dashboard.renderSearchPanel(
        (document.getElementById('searchInput') as HTMLInputElement | null)?.value ?? '',
        next,
      );
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      void openSearchResult(dashboard.searchSelectedIndex);
    }
  };

  const clickHandler = (event: MouseEvent): void => {
    void onClick(event);
    onHistoryBackdropClick(event);
    onSearchBackdropClick(event);
  };
  const inputHandler = (event: Event): void => {
    void onArchiveSearch(event);
    void onHistorySearch(event);
    void onSearchInput(event);
  };

  document.addEventListener('click', clickHandler);
  document.addEventListener('click', onArchiveToggle);
  document.addEventListener('input', inputHandler);
  document.addEventListener('keydown', onKeydown);

  return () => {
    document.removeEventListener('click', clickHandler);
    document.removeEventListener('click', onArchiveToggle);
    document.removeEventListener('input', inputHandler);
    document.removeEventListener('keydown', onKeydown);
  };
}
