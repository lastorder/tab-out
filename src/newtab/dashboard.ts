/**
 * newtab/dashboard.ts — the dashboard's render loop and state.
 *
 * Owns the DOM: it asks the services for data, hands that data to the pure
 * renderers in `ui/render`, and writes the result into the page. All click
 * handling lives in `newtab/controller.ts`.
 */

import type { DashboardModel } from '../core/grouping';
import type { SettingsStore } from '../config/store';
import type { SavedTabsService } from '../services/saved-tabs';
import type { TabActions } from '../services/tab-actions';
import type { TabHistoryService } from '../services/tab-history';
import type { BrowserTabs } from '../platform/browser';
import type { TabGroup, TabOutSettings } from '../types';
import { buildDashboardModel } from '../core/grouping';
import { filterHistory } from '../core/history';
import { desiredTabOrder, needsSorting } from '../core/selection';
import { createDefaultSettings } from '../config/defaults';
import { getDateDisplay, getGreeting } from '../core/time';
import { escapeHtml, plural } from '../ui/html';
import { ICONS } from '../ui/icons';
import { renderEmptyState, renderEntries } from '../ui/render/cards';
import { renderHistoryList } from '../ui/render/history';
import { renderArchiveList, renderSavedItem } from '../ui/render/saved';

export interface DashboardDeps {
  browser: BrowserTabs;
  tabActions: TabActions;
  savedTabs: SavedTabsService;
  settingsStore: SettingsStore;
  historyService: TabHistoryService;
}

/** Looks up an element by id, typed. */
function byId<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

export class Dashboard {
  readonly deps: DashboardDeps;

  /** The most recent render model; click handlers read groups from here. */
  #model: DashboardModel | null = null;
  #settings: TabOutSettings = createDefaultSettings();
  /** Tab ids in dashboard order, for the "Sort tabs" action. */
  #desiredOrder: number[] = [];

  constructor(deps: DashboardDeps) {
    this.deps = deps;
  }

  get settings(): TabOutSettings {
    return this.#settings;
  }

  get desiredOrder(): readonly number[] {
    return this.#desiredOrder;
  }

  /** Resolves the group behind a card's `data-group-index`. */
  groupAt(index: number): TabGroup | null {
    return this.#model?.orderedGroups[index] ?? null;
  }

  /** Full repaint: header, cards, stats, sort banner, and the saved sidebar. */
  async render(): Promise<void> {
    this.#renderHeader();

    const [settings, tabs] = await Promise.all([
      this.deps.settingsStore.load(),
      this.deps.browser.queryAll(),
    ]);
    this.#settings = settings;

    const model = buildDashboardModel(tabs, settings);
    this.#model = model;

    this.#renderCards(model);
    this.#renderStats(tabs.length);
    await this.#renderSortBanner(model);
    await this.renderSavedColumn();
    await this.renderHistoryPanel(this.currentHistoryQuery());
  }

  #renderHeader(): void {
    const now = new Date();
    const greeting = byId('greeting');
    const date = byId('dateDisplay');
    if (greeting) greeting.textContent = getGreeting(now);
    if (date) date.textContent = getDateDisplay(now);
  }

  #renderCards(model: DashboardModel): void {
    const section = byId('openTabsSection');
    const missions = byId('openTabsMissions');
    const count = byId('openTabsSectionCount');
    if (!section || !missions || !count) return;

    if (model.entries.length === 0) {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'block';

    const domainText =
      model.groupCount > 0
        ? `${escapeHtml(plural(model.groupCount, 'domain'))} &nbsp;&middot;&nbsp; `
        : '';
    const closeAll =
      model.realTabs.length > 0
        ? `<button class="action-btn close-tabs close-all-btn" data-action="close-all-tabs">
            ${ICONS.close}Close all ${escapeHtml(plural(model.realTabs.length, 'tab'))}
          </button>`
        : '';

    count.innerHTML = domainText + closeAll;
    missions.innerHTML = renderEntries(model.entries);
  }

  #renderStats(totalTabs: number): void {
    const stat = byId('statTabs');
    if (stat) stat.textContent = String(totalTabs);
  }

  /**
   * Keeps the tab bar in sync with the dashboard's order.
   *
   * When auto-sort is on (the default), a mismatch is corrected silently and
   * the banner stays hidden. When it's off, the banner appears instead and
   * the user sorts manually via the "Sort tabs" button.
   */
  async #renderSortBanner(model: DashboardModel): Promise<void> {
    const banner = byId('tabSortBanner');

    try {
      const windowId = await this.deps.browser.currentWindowId();
      const desired = desiredTabOrder(model.orderedGroups, windowId);
      const actual = model.realTabs
        .filter((tab) => tab.windowId === windowId)
        .sort((a, b) => a.index - b.index)
        .map((tab) => tab.id);

      this.#desiredOrder = desired;
      const mismatched = needsSorting(actual, desired);

      if (mismatched && this.#settings.autoSortTabs) {
        await this.deps.tabActions.sortTabs(desired);
        if (banner) banner.style.display = 'none';
        return;
      }

      if (banner) banner.style.display = mismatched ? 'flex' : 'none';
    } catch {
      this.#desiredOrder = [];
      if (banner) banner.style.display = 'none';
    }
  }

  /** Repaints the "Saved for later" sidebar, hiding it when empty. */
  async renderSavedColumn(): Promise<void> {
    const column = byId('deferredColumn');
    if (!column) return;

    const list = byId('deferredList');
    const empty = byId('deferredEmpty');
    const countEl = byId('deferredCount');
    const archive = byId('deferredArchive');
    const archiveCount = byId('archiveCount');
    const archiveList = byId('archiveList');

    try {
      const { active, archived } = await this.deps.savedTabs.list();

      if (active.length === 0 && archived.length === 0) {
        column.style.display = 'none';
        return;
      }
      column.style.display = 'block';

      const now = new Date();

      if (list && empty && countEl) {
        if (active.length > 0) {
          countEl.textContent = plural(active.length, 'item');
          list.innerHTML = active.map((item) => renderSavedItem(item, now)).join('');
          list.style.display = 'block';
          empty.style.display = 'none';
        } else {
          list.style.display = 'none';
          countEl.textContent = '';
          empty.style.display = 'block';
        }
      }

      if (archive && archiveCount && archiveList) {
        if (archived.length > 0) {
          archiveCount.textContent = `(${archived.length})`;
          archiveList.innerHTML = renderArchiveList(archived, now);
          archive.style.display = 'block';
        } else {
          archive.style.display = 'none';
        }
      }
    } catch (err) {
      console.warn('[tab-out] Could not load saved tabs:', err);
      column.style.display = 'none';
    }
  }

  /**
   * Repaints the History panel: the reopen-count badge on the header button
   * always updates (so it stays accurate even while the panel is closed),
   * and the list itself is refreshed too — writing into a hidden panel is
   * harmless, and it means the list is never stale the instant it opens.
   *
   * `query` filters the list, for the panel's search box.
   *
   * The open-tab list is queried live rather than read off `#model`. This is
   * load-bearing: the panel is repainted reactively when the background
   * worker records a closure, which is precisely when the last render's
   * model is out of date — it still lists the tab that just closed. Using it
   * would filter the new entry straight back out as "still open", and the
   * entry would only surface after a manual refresh.
   */
  async renderHistoryPanel(query = ''): Promise<void> {
    const badge = byId('historyBadge');
    const countLabel = byId('historyCount');
    const list = byId('historyList');

    let openUrls = new Set<string>();
    try {
      openUrls = new Set((await this.deps.browser.queryAll()).map((tab) => tab.url));
    } catch {
      // Fall back to filtering nothing: showing a stale entry the user can
      // click is better than hiding a real one.
    }

    const entries = await this.deps.historyService.list(openUrls);
    const visible = filterHistory(entries, query);

    if (badge) {
      badge.textContent = entries.length > 0 ? String(entries.length) : '';
      badge.style.display = entries.length > 0 ? 'inline-flex' : 'none';
    }
    if (countLabel) countLabel.textContent = plural(entries.length, 'closed tab');
    if (list) list.innerHTML = renderHistoryList(visible, query.trim().length >= 2);
  }

  /**
   * Reads whatever the user has already typed into the history search box,
   * so a reactive re-render (see `renderHistoryPanel` callers) doesn't clear
   * an in-progress search.
   */
  currentHistoryQuery(): string {
    return byId<HTMLInputElement>('historySearch')?.value ?? '';
  }

  /**
   * Called after cards animate away: when nothing is left, swap in the
   * "Inbox zero" state instead of an empty void.
   */
  checkEmptyState(): void {
    const missions = byId('openTabsMissions');
    if (!missions) return;
    if (missions.querySelectorAll('.mission-card:not(.closing)').length > 0) return;

    missions.innerHTML = renderEmptyState();
    const count = byId('openTabsSectionCount');
    if (count) count.textContent = '0 domains';
  }

  /** Removes any card whose chips are all gone. */
  pruneEmptyCards(): void {
    document.querySelectorAll<HTMLElement>('.mission-card').forEach((card) => {
      if (card.classList.contains('pinned-placeholder')) return;
      if (card.querySelectorAll('.page-chip[data-action="focus-tab"]').length > 0) return;
      card.classList.add('closing');
      window.setTimeout(() => {
        card.remove();
        this.checkEmptyState();
      }, 300);
    });
  }
}
