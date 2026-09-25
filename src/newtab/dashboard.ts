/**
 * newtab/dashboard.ts — the dashboard's render loop and state.
 *
 * Owns the DOM: it asks the services for data, hands that data to the pure
 * renderers in `ui/render`, and writes the result into the page. All click
 * handling lives in `newtab/controller.ts`.
 */

import type { DashboardModel } from '../core/grouping';
import type { TidySelection } from '../core/tidy';
import type { SettingsStore } from '../config/store';
import type { SavedTabsService } from '../services/saved-tabs';
import type { TabActions } from '../services/tab-actions';
import type { TabHistoryService } from '../services/tab-history';
import type { BrowserTabs } from '../platform/browser';
import type { TabGroup, TabOutSettings } from '../types';
import { buildDashboardModel } from '../core/grouping';
import { filterHistory } from '../core/history';
import { clampSelection, searchTabsAndHistory, type SearchResult } from '../core/search';
import { desiredTabOrder, planTabSort, type TabMove } from '../core/selection';
import { selectTidyTabIds } from '../core/tidy';
import { createDefaultSettings } from '../config/defaults';
import { getDateDisplay, getGreeting } from '../core/time';
import { escapeHtml, plural } from '../ui/html';
import { ICONS } from '../ui/icons';
import { renderEmptyState, renderGroups } from '../ui/render/cards';
import { renderHistoryList } from '../ui/render/history';
import { renderSearchResults } from '../ui/render/search';
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

/** No tab qualifies yet — the state before the first render completes. */
const EMPTY_TIDY_SELECTION: TidySelection = {
  tabIds: [],
  breakdown: { disposable: 0, saved: 0, duplicates: 0 },
};

/**
 * Renders the breakdown behind a "Tidy up" action, e.g.
 * "6 disposable tabs, 4 duplicates, 2 already saved" — used for both the
 * button's tooltip and the toast shown after closing, so the button is never
 * a mystery about what it's about to do.
 */
export function describeTidyBreakdown(breakdown: TidySelection['breakdown']): string {
  const parts: string[] = [];
  if (breakdown.disposable > 0) parts.push(plural(breakdown.disposable, 'disposable tab'));
  if (breakdown.duplicates > 0) parts.push(plural(breakdown.duplicates, 'duplicate'));
  if (breakdown.saved > 0) parts.push(`${plural(breakdown.saved, 'tab')} already saved`);
  return parts.join(', ');
}

/** The "Tidy up · N" button, or `''` when nothing currently qualifies. */
function tidyButtonHtml(tidy: TidySelection): string {
  if (tidy.tabIds.length === 0) return '';
  return `<button class="action-btn save-tabs tidy-btn" data-action="tidy-tabs"
        title="${escapeHtml(describeTidyBreakdown(tidy.breakdown))}">
      ${ICONS.sparkles}Tidy up &middot; ${tidy.tabIds.length}
    </button>`;
}

export class Dashboard {
  readonly deps: DashboardDeps;

  /** The most recent render model; click handlers read groups from here. */
  #model: DashboardModel | null = null;
  #settings: TabOutSettings = createDefaultSettings();
  /** Moves that would bring the tab bar's movable tabs into dashboard order. */
  #sortPlan: TabMove[] = [];
  /** What "Tidy up" would close, for the "tidy-tabs" action. */
  #tidySelection: TidySelection = EMPTY_TIDY_SELECTION;
  /** Current Search overlay results and selection, for the controller's keyboard handling. */
  #searchResults: SearchResult[] = [];
  #searchSelectedIndex = -1;

  constructor(deps: DashboardDeps) {
    this.deps = deps;
  }

  get settings(): TabOutSettings {
    return this.#settings;
  }

  get sortPlan(): readonly TabMove[] {
    return this.#sortPlan;
  }

  get tidySelection(): TidySelection {
    return this.#tidySelection;
  }

  /** Resolves the group behind a card's `data-group-index`. */
  groupAt(index: number): TabGroup | null {
    return this.#model?.orderedGroups[index] ?? null;
  }

  /** Full repaint: header, cards, stats, sort banner, and the saved sidebar. */
  async render(): Promise<void> {
    this.#renderHeader();

    const [settings, tabs, chromeGroups] = await Promise.all([
      this.deps.settingsStore.load(),
      this.deps.browser.queryAll(),
      this.deps.browser.queryGroups(),
    ]);
    this.#settings = settings;

    const model = buildDashboardModel(
      tabs,
      settings,
      new Map(chromeGroups.map((group) => [group.id, group])),
    );
    this.#model = model;

    this.#tidySelection = selectTidyTabIds(model.realTabs, {
      disposableEnabled: settings.disposableEnabled,
      disposableRules: settings.disposableRules,
      savedUrls: await this.#activeSavedUrls(),
    });

    this.#renderCards(model, this.#tidySelection);
    this.#renderStats(tabs.length);
    await this.#renderSortBanner(model);
    await this.renderSavedColumn();
    await this.renderHistoryPanel(this.currentHistoryQuery());
  }

  /**
   * URLs on the active "Saved for later" checklist — a tab showing one of
   * these is redundant with something durable, so "Tidy up" can close it.
   * Swallows errors the same way `renderSavedColumn` does: a saved-tabs
   * hiccup should never stop the rest of the dashboard from rendering.
   */
  async #activeSavedUrls(): Promise<Set<string>> {
    try {
      const { active } = await this.deps.savedTabs.list();
      return new Set(active.map((item) => item.url));
    } catch {
      return new Set();
    }
  }

  #renderHeader(): void {
    const now = new Date();
    const greeting = byId('greeting');
    const date = byId('dateDisplay');
    if (greeting) greeting.textContent = getGreeting(now);
    if (date) date.textContent = getDateDisplay(now);
  }

  #renderCards(model: DashboardModel, tidy: TidySelection): void {
    const section = byId('openTabsSection');
    const missions = byId('openTabsMissions');
    const count = byId('openTabsSectionCount');

    if (!section || !missions || !count) return;

    if (model.orderedGroups.length === 0) {
      section.style.display = 'none';
      missions.innerHTML = '';
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

    count.innerHTML = domainText + closeAll + tidyButtonHtml(tidy);
    missions.innerHTML = renderGroups(model.orderedGroups, model.placeholders, model.pinnedMatches);
  }

  /**
   * Recomputes and repaints just the "Tidy up" button, without touching the
   * rest of the cards.
   *
   * Checking off or dismissing a saved item changes what counts as "safe to
   * close" but is a storage write, not a tab event — nothing else would
   * notice and refresh the button otherwise.
   */
  async refreshTidyButton(): Promise<void> {
    if (!this.#model) return;

    this.#tidySelection = selectTidyTabIds(this.#model.realTabs, {
      disposableEnabled: this.#settings.disposableEnabled,
      disposableRules: this.#settings.disposableRules,
      savedUrls: await this.#activeSavedUrls(),
    });

    const count = byId('openTabsSectionCount');
    count?.querySelector('.tidy-btn')?.remove();
    count?.insertAdjacentHTML('beforeend', tidyButtonHtml(this.#tidySelection));
  }

  #renderStats(totalTabs: number): void {
    const stat = byId('statTabs');
    if (stat) stat.textContent = String(totalTabs);
  }

  /**
   * Keeps the tab bar in sync with the dashboard's order.
   *
   * The plan comes from `core/selection.ts#planTabSort`, which only ever
   * permutes *movable* tabs (not pinned, not grouped) inside the contiguous
   * runs they already occupy — so a Chrome tab group's position is never
   * disturbed, whatever the dashboard's card order says. A non-empty plan is
   * itself the "out of order" signal: there is no separate mismatch test,
   * because the only order reachable is the one the plan just computed.
   *
   * When auto-sort is on (the default) the plan is applied silently and the
   * banner stays hidden. When it's off, the banner appears instead and the
   * user applies the same plan with the "Sort tabs" button.
   */
  async #renderSortBanner(model: DashboardModel): Promise<void> {
    const banner = byId('tabSortBanner');

    try {
      const windowId = await this.deps.browser.currentWindowId();
      const windowTabs = model.realTabs.filter((tab) => tab.windowId === windowId);
      const desired = desiredTabOrder(model.orderedGroups, windowId);
      const plan = planTabSort(windowTabs, windowId, desired);

      this.#sortPlan = plan;

      if (plan.length > 0 && this.#settings.autoSortTabs) {
        await this.deps.tabActions.sortTabs(plan);
        if (banner) banner.style.display = 'none';
        return;
      }

      if (banner) banner.style.display = plan.length > 0 ? 'flex' : 'none';
    } catch {
      this.#sortPlan = [];
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

  /** The Search overlay's current result list, for the controller's Enter/arrow handling. */
  get searchResults(): readonly SearchResult[] {
    return this.#searchResults;
  }

  get searchSelectedIndex(): number {
    return this.#searchSelectedIndex;
  }

  /**
   * Repaints the Search overlay: open tabs + closed history, ranked by
   * `searchTabsAndHistory`, with `selectedIndex` clamped back into range as
   * the result count changes (e.g. typing narrows the list out from under
   * whatever row was highlighted).
   *
   * Queried live rather than from `#model`, for the same reason
   * `renderHistoryPanel` is: the moments the overlay is most useful (right
   * after opening or closing a tab) are exactly when a stale snapshot would
   * be wrong.
   */
  async renderSearchPanel(query: string, selectedIndex: number): Promise<void> {
    const list = byId('searchResults');
    if (!list) return;

    const [tabs, history] = await Promise.all([
      this.deps.browser.queryAll(),
      this.deps.historyService.list(),
    ]);

    const results = searchTabsAndHistory(tabs, history, query);
    this.#searchResults = results;
    this.#searchSelectedIndex = clampSelection(selectedIndex, results.length);

    list.innerHTML = renderSearchResults(results, this.#searchSelectedIndex, query.trim().length > 0);

    const selected = list.querySelector('.search-result.selected');
    selected?.scrollIntoView({ block: 'nearest' });
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

  /** Removes any card whose chips are all gone (placeholders don't count as "gone" content — they never had a tab to close). */
  pruneEmptyCards(): void {
    document.querySelectorAll<HTMLElement>('.mission-card').forEach((card) => {
      if (card.querySelectorAll('.page-chip[data-action="focus-tab"]').length > 0) return;
      if (card.querySelectorAll('.page-chip-placeholder').length > 0) return;
      card.classList.add('closing');
      window.setTimeout(() => {
        card.remove();
        this.checkEmptyState();
      }, 300);
    });
  }
}
