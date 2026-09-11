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
import { groupTitle } from '../ui/render/cards';
import { renderArchiveList } from '../ui/render/saved';
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
  | 'complete-saved'
  | 'dismiss-saved'
  | 'close-group'
  | 'close-duplicates'
  | 'close-all-tabs'
  | 'open-history'
  | 'close-history'
  | 'reopen-history'
  | 'remove-history'
  | 'clear-history';

/**
 * Coalesces browser tab events into one repaint, and lets the UI temporarily
 * mute itself.
 *
 * Without the mute, closing a tab from the dashboard would trigger
 * `chrome.tabs.onRemoved`, which would repaint mid-animation and make the
 * confetti vanish. `suppress()` gives the animation time to finish.
 */
export class RenderScheduler {
  readonly #render: () => Promise<void>;
  readonly #debounceMs: number;
  #timer: number | null = null;
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

  /** Call before closing tabs programmatically. */
  suppress(ms = 800): void {
    this.#mutedUntil = Date.now() + ms;
    if (this.#timer !== null) {
      window.clearTimeout(this.#timer);
      this.#timer = null;
    }
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

/** Wires every dashboard interaction. Returns a teardown function. */
export function attachController(
  dashboard: Dashboard,
  scheduler: RenderScheduler,
): () => void {
  const { tabActions, savedTabs, historyService } = dashboard.deps;

  /** Reads the History search box, so re-renders after an action keep the filter. */
  const historyQuery = (): string => dashboard.currentHistoryQuery();

  const openHistoryPanel = (): void => {
    const overlay = document.getElementById('historyOverlay');
    if (overlay) overlay.style.display = 'flex';
  };

  const closeHistoryPanel = (): void => {
    const overlay = document.getElementById('historyOverlay');
    if (overlay) overlay.style.display = 'none';
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

      case 'open-history': {
        openHistoryPanel();
        await dashboard.renderHistoryPanel(historyQuery());
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

        const created = await tabActions.reopenFromHistory(url);
        if (id) await historyService.removeById(id);
        await dashboard.renderHistoryPanel(historyQuery());

        showToast(created ? 'Tab reopened' : 'Already open — switched to it');
        return;
      }

      case 'remove-history': {
        const id = actionEl.dataset['historyId'];
        if (!id) return;

        const row = actionEl.closest<HTMLElement>('.history-item');
        await historyService.removeById(id);
        if (row) await fadeOut(row);
        await dashboard.renderHistoryPanel(historyQuery());
        return;
      }

      case 'clear-history': {
        if (!window.confirm('Clear all closed-tab history? This cannot be undone.')) return;
        await historyService.clear();
        await dashboard.renderHistoryPanel(historyQuery());
        showToast('History cleared');
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

  /** Clicking the dark backdrop (not the modal card itself) closes the panel. */
  const onHistoryBackdropClick = (event: MouseEvent): void => {
    if (event.target === document.getElementById('historyOverlay')) closeHistoryPanel();
  };

  /** Escape closes the History panel, matching standard modal behaviour. */
  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') closeHistoryPanel();
  };

  const clickHandler = (event: MouseEvent): void => {
    void onClick(event);
    onHistoryBackdropClick(event);
  };
  const inputHandler = (event: Event): void => {
    void onArchiveSearch(event);
    void onHistorySearch(event);
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
