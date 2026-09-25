// @vitest-environment jsdom

/**
 * An integration test for the dashboard render loop.
 *
 * `Dashboard` is the seam where pure logic meets the DOM, so this exercises the
 * real services against fake browser/storage adapters and asserts on the HTML
 * that actually lands in the page. It catches wiring mistakes that typechecking
 * cannot — wrong element id, forgotten await, stale model.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { Dashboard } from '@/newtab/dashboard';
import { SettingsStore } from '@/config/store';
import { SavedTabsService } from '@/services/saved-tabs';
import { TabActions } from '@/services/tab-actions';
import { TabHistoryService } from '@/services/tab-history';
import { createMemoryStore } from '@/platform/storage';
import { SETTINGS_KEY } from '@/config/store';
import type { TabInfo, TabOutSettings } from '@/types';
import { createFakeBrowser } from '../helpers/fake-browser';
import { emptySettings, resetTabIds, tab } from '../helpers/factories';

/** The subset of index.html the Dashboard writes into. */
function mountDom(): void {
  // jsdom has no layout, so `scrollIntoView` is missing entirely; the Search
  // overlay calls it to keep the selected row visible.
  Element.prototype.scrollIntoView ??= () => {};

  document.body.innerHTML = `
    <h1 id="greeting"></h1>
    <div id="dateDisplay"></div>
    <div id="tabSortBanner" style="display:none"></div>
    <div id="openTabsSection" style="display:none">
      <div id="openTabsSectionCount"></div>
      <div id="openTabsMissions"></div>
    </div>
    <div id="deferredColumn" style="display:none">
      <div id="deferredCount"></div>
      <div id="deferredList"></div>
      <div id="deferredEmpty" style="display:none"></div>
      <div id="deferredArchive" style="display:none">
        <span id="archiveCount"></span>
        <div id="archiveList"></div>
      </div>
    </div>
    <span id="historyBadge" style="display:none"></span>
    <div id="historyOverlay" style="display:none">
      <div id="historyCount"></div>
      <input id="historySearch" type="text">
      <div id="historyList"></div>
    </div>
    <div id="searchOverlay" style="display:none">
      <input id="searchInput" type="text">
      <div id="searchResults"></div>
    </div>
    <div id="statTabs">—</div>`;
}

async function buildDashboard(tabsList: TabInfo[], settings?: Partial<TabOutSettings>) {
  const browser = createFakeBrowser(tabsList, { currentWindowId: 1 });
  const settingsBacking = createMemoryStore(
    settings ? { [SETTINGS_KEY]: emptySettings(settings) } : { [SETTINGS_KEY]: emptySettings() },
  );
  const savedBacking = createMemoryStore();
  const historyBacking = createMemoryStore();

  const savedTabs = new SavedTabsService(savedBacking);
  const historyService = new TabHistoryService(historyBacking);
  const dashboard = new Dashboard({
    browser,
    tabActions: new TabActions(browser),
    savedTabs,
    settingsStore: new SettingsStore(settingsBacking),
    historyService,
  });

  return { dashboard, browser, savedTabs, historyService };
}

const missions = (): string => document.getElementById('openTabsMissions')!.innerHTML;

beforeEach(() => {
  resetTabIds();
  mountDom();
});

describe('Dashboard.render', () => {
  it('paints the greeting and date', async () => {
    const { dashboard } = await buildDashboard([]);
    await dashboard.render();

    expect(document.getElementById('greeting')!.textContent).toMatch(/Good (morning|afternoon|evening)/);
    expect(document.getElementById('dateDisplay')!.textContent).not.toBe('');
  });

  it('renders a card per domain and counts open tabs', async () => {
    const { dashboard } = await buildDashboard([
      tab('https://github.com/a', { index: 0 }),
      tab('https://github.com/b', { index: 1 }),
      tab('https://example.com/', { index: 2 }),
    ]);
    await dashboard.render();

    expect(missions()).toContain('GitHub');
    expect(missions()).toContain('Example');
    expect(document.getElementById('openTabsSectionCount')!.innerHTML).toContain('2 domains');
    expect(document.getElementById('statTabs')!.textContent).toBe('3');
  });

  it('excludes browser-internal pages from the cards but not the total', async () => {
    const { dashboard } = await buildDashboard([
      tab('https://example.com/', { index: 0 }),
      tab('chrome://newtab/', { index: 1 }),
    ]);
    await dashboard.render();

    expect(missions()).not.toContain('chrome://newtab');
    expect(document.getElementById('statTabs')!.textContent).toBe('2');
  });

  it('hides the open-tabs section when nothing is open', async () => {
    const { dashboard } = await buildDashboard([]);
    await dashboard.render();

    expect(document.getElementById('openTabsSection')!.style.display).toBe('none');
  });

  it('resolves data-group-index back to the right group', async () => {
    const { dashboard } = await buildDashboard([
      tab('https://github.com/a', { index: 0 }),
      tab('https://github.com/b', { index: 1 }),
      tab('https://example.com/', { index: 2 }),
    ]);
    await dashboard.render();

    const cards = document.querySelectorAll<HTMLElement>('[data-group-index]');
    const first = dashboard.groupAt(Number(cards[0]!.dataset['groupIndex']));

    // "Example" sorts before "GitHub" alphabetically.
    expect(first!.key).toBe('example.com');
    expect(first!.tabs).toHaveLength(1);
  });

  it('renders a placeholder-only card for a pinned site with no open tabs', async () => {
    const { dashboard } = await buildDashboard([], {
      pinnedSites: [{ url: 'https://mail.google.com/', label: 'Gmail' }],
    });
    await dashboard.render();

    expect(missions()).toContain('data-action="open-pinned-site"');
    expect(missions()).toContain('Gmail');
    expect(missions()).toContain('pinned-only-card');
  });

  it('shows the sort banner only when the tab bar is out of order, if auto-sort is off', async () => {
    const banner = () => document.getElementById('tabSortBanner')!.style.display;

    // example.com sorts first alphabetically ("Example" < "GitHub"), but sits
    // last in the tab bar here.
    const { dashboard } = await buildDashboard(
      [
        tab('https://github.com/a', { index: 0, windowId: 1 }),
        tab('https://github.com/b', { index: 1, windowId: 1 }),
        tab('https://example.com/', { index: 2, windowId: 1 }),
      ],
      { autoSortTabs: false },
    );
    await dashboard.render();
    expect(banner()).toBe('flex');
    expect(dashboard.desiredOrder.length).toBe(3);

    // Now in matching order.
    const ordered = await buildDashboard(
      [
        tab('https://example.com/', { index: 0, windowId: 1 }),
        tab('https://github.com/a', { index: 1, windowId: 1 }),
        tab('https://github.com/b', { index: 2, windowId: 1 }),
      ],
      { autoSortTabs: false },
    );
    await ordered.dashboard.render();
    expect(banner()).toBe('none');
  });

  it('sorts tabs automatically by default, keeping the banner hidden', async () => {
    const { dashboard, browser } = await buildDashboard([
      tab('https://github.com/a', { id: 1, index: 0, windowId: 1 }),
      tab('https://github.com/b', { id: 2, index: 1, windowId: 1 }),
      tab('https://example.com/', { id: 3, index: 2, windowId: 1 }),
    ]);
    await dashboard.render();

    expect(document.getElementById('tabSortBanner')!.style.display).toBe('none');
    // example.com sorts ahead of github.com alphabetically.
    expect(browser.moved).toEqual([
      { tabId: 3, index: 0 },
      { tabId: 1, index: 1 },
      { tabId: 2, index: 2 },
    ]);
  });

  it('does not move anything when auto-sort is on but the order already matches', async () => {
    const { dashboard, browser } = await buildDashboard([
      tab('https://example.com/', { id: 1, index: 0, windowId: 1 }),
      tab('https://github.com/a', { id: 2, index: 1, windowId: 1 }),
      tab('https://github.com/b', { id: 3, index: 2, windowId: 1 }),
    ]);
    await dashboard.render();

    expect(document.getElementById('tabSortBanner')!.style.display).toBe('none');
    expect(browser.moved).toEqual([]);
  });

  it('never moves a tab that is already in a real Chrome tab group, and never flags it as out of order', async () => {
    const { dashboard, browser } = await buildDashboard(
      [
        // A real Chrome group sitting in whatever order the user left it —
        // "b" before "a" alphabetically-speaking, deliberately out of sync
        // with what card-order sorting would otherwise want.
        tab('https://b.com/', { id: 1, index: 0, windowId: 1, groupId: 9 }),
        tab('https://a.com/', { id: 2, index: 1, windowId: 1, groupId: 9 }),
        tab('https://example.com/', { id: 3, index: 2, windowId: 1 }),
      ],
      { autoSortTabs: false },
    );
    browser.groups.set(9, { id: 9, title: 'My Group', color: 'blue' });
    await dashboard.render();

    // The lone ungrouped tab is already "in order" on its own, so no banner
    // and nothing gets moved — the grouped tabs are excluded from the
    // comparison entirely, not flagged as a mismatch to fix.
    expect(document.getElementById('tabSortBanner')!.style.display).toBe('none');
    expect(browser.moved).toEqual([]);
  });

  it('picks up settings changes on the next render', async () => {
    const { dashboard } = await buildDashboard([tab('https://acme.net/x')]);
    await dashboard.render();
    expect(missions()).toContain('Acme');

    await dashboard.deps.settingsStore.save(
      emptySettings({
        disposableRules: [{ pattern: 'https://acme.net/x' }],
      }),
    );
    await dashboard.render();
    // The tab is now claimed by the disposable rule, so it moves into the
    // shared Disposable card instead of its own "Acme" domain card.
    expect(missions()).toContain('Disposable');
  });
});

describe('Dashboard saved-tabs sidebar', () => {
  it('stays hidden when nothing is saved', async () => {
    const { dashboard } = await buildDashboard([]);
    await dashboard.render();
    expect(document.getElementById('deferredColumn')!.style.display).toBe('none');
  });

  it('appears once a tab is saved', async () => {
    const { dashboard, savedTabs } = await buildDashboard([]);
    await savedTabs.save({ url: 'https://example.com/', title: 'Read later' });
    await dashboard.render();

    expect(document.getElementById('deferredColumn')!.style.display).toBe('block');
    expect(document.getElementById('deferredList')!.innerHTML).toContain('Read later');
    expect(document.getElementById('deferredCount')!.textContent).toBe('1 item');
  });

  it('moves a completed item into the archive', async () => {
    const { dashboard, savedTabs } = await buildDashboard([]);
    const entry = await savedTabs.save({ url: 'https://example.com/', title: 'Done' });
    await savedTabs.complete(entry.id);
    await dashboard.render();

    expect(document.getElementById('deferredArchive')!.style.display).toBe('block');
    expect(document.getElementById('archiveCount')!.textContent).toBe('(1)');
    expect(document.getElementById('archiveList')!.innerHTML).toContain('Done');
    expect(document.getElementById('deferredEmpty')!.style.display).toBe('block');
  });
});

describe('Dashboard.checkEmptyState', () => {
  it('swaps in the inbox-zero state once every card is gone', async () => {
    const { dashboard } = await buildDashboard([tab('https://example.com/')]);
    await dashboard.render();
    expect(missions()).toContain('Example');

    document.querySelectorAll('.mission-card').forEach((el) => el.remove());
    dashboard.checkEmptyState();

    expect(missions()).toContain('Inbox zero, but for tabs.');
    expect(document.getElementById('openTabsSectionCount')!.textContent).toBe('0 domains');
  });

  it('leaves the grid alone while cards remain', async () => {
    const { dashboard } = await buildDashboard([tab('https://example.com/')]);
    await dashboard.render();

    dashboard.checkEmptyState();
    expect(missions()).not.toContain('Inbox zero');
  });
});

describe('Dashboard History panel', () => {
  it('shows the badge count and lists recorded closures', async () => {
    const { dashboard, historyService } = await buildDashboard([]);
    await historyService.record({ url: 'https://a.com/', title: 'A' }, 100);
    await historyService.record({ url: 'https://b.com/', title: 'B' }, 100);
    await dashboard.render();

    const badge = document.getElementById('historyBadge')!;
    expect(badge.textContent).toBe('2');
    expect(badge.style.display).toBe('inline-flex');
    expect(document.getElementById('historyCount')!.textContent).toBe('2 closed tabs');
    expect(document.getElementById('historyList')!.innerHTML).toContain('A');
    expect(document.getElementById('historyList')!.innerHTML).toContain('B');
  });

  it('hides the badge and shows the empty state when nothing is closed', async () => {
    const { dashboard } = await buildDashboard([]);
    await dashboard.render();

    const badge = document.getElementById('historyBadge')!;
    expect(badge.textContent).toBe('');
    expect(badge.style.display).toBe('none');
    expect(document.getElementById('historyList')!.innerHTML).toContain('No closed tabs yet');
  });

  it('never shows an entry whose URL is currently open', async () => {
    const { dashboard, historyService } = await buildDashboard([tab('https://a.com/')]);
    await historyService.record({ url: 'https://a.com/', title: 'A' }, 100);
    await historyService.record({ url: 'https://b.com/', title: 'B' }, 100);
    await dashboard.render();

    const badge = document.getElementById('historyBadge')!;
    expect(badge.textContent).toBe('1');
    expect(document.getElementById('historyList')!.innerHTML).not.toContain('>A<');
  });

  it('filters the list by the given query', async () => {
    const { dashboard, historyService } = await buildDashboard([]);
    await historyService.record({ url: 'https://typescript.org/', title: 'TypeScript' }, 100);
    await historyService.record({ url: 'https://rust-lang.org/', title: 'Rust' }, 100);
    await dashboard.render();

    await dashboard.renderHistoryPanel('rust');

    const html = document.getElementById('historyList')!.innerHTML;
    expect(html).toContain('Rust');
    expect(html).not.toContain('TypeScript');
  });

  it('keeps a search that was already typed when re-rendering without an explicit query', async () => {
    const { dashboard, historyService } = await buildDashboard([]);
    await historyService.record({ url: 'https://typescript.org/', title: 'TypeScript' }, 100);
    await historyService.record({ url: 'https://rust-lang.org/', title: 'Rust' }, 100);
    await dashboard.render();

    (document.getElementById('historySearch') as HTMLInputElement).value = 'rust';
    expect(dashboard.currentHistoryQuery()).toBe('rust');

    await dashboard.renderHistoryPanel(dashboard.currentHistoryQuery());
    const html = document.getElementById('historyList')!.innerHTML;
    expect(html).toContain('Rust');
    expect(html).not.toContain('TypeScript');
  });

  it('shows a tab closed since the last full render, without needing one', async () => {
    // The bug this guards: the panel used to filter against the *last
    // render's* tab list, so a tab closed after that render still counted as
    // "open" and its fresh history entry was filtered straight back out —
    // the entry only appeared after a manual page refresh.
    const { dashboard, browser, historyService } = await buildDashboard([
      tab('https://example.com/', { id: 1 }),
    ]);
    await dashboard.render();

    // The panel correctly hides it while it is genuinely open.
    await historyService.record({ url: 'https://example.com/', title: 'Example' }, 100);
    await dashboard.renderHistoryPanel();
    expect(document.getElementById('historyList')!.innerHTML).not.toContain('Example');

    // Now it closes — but no full render happens (repaints are suppressed
    // during the close animation).
    await browser.close([1]);
    await dashboard.renderHistoryPanel();

    expect(document.getElementById('historyList')!.innerHTML).toContain('Example');
    expect(document.getElementById('historyBadge')!.textContent).toBe('1');
  });
});

describe('Dashboard Search overlay', () => {
  it('narrows a space-separated query across open tabs and history', async () => {
    const { dashboard, historyService } = await buildDashboard([
      tab('https://docs.example.com/guide', { title: 'Tab Out Guide' }),
      tab('https://blog.example.com/post', { title: 'Tab Out Launch' }),
    ]);
    await historyService.record({ url: 'https://docs.example.com/old', title: 'Tab Out Docs' }, 100);

    await dashboard.renderSearchPanel('tab docs', 0);

    const html = document.getElementById('searchResults')!.innerHTML;
    expect(html).toContain('Tab Out Guide');
    expect(html).toContain('Tab Out Docs');
    expect(html).not.toContain('Tab Out Launch');
  });
});

describe('Dashboard pinned sites', () => {
  it('keeps the pinned site in its own domain card while open, then shows a placeholder in the same card once it closes', async () => {
    const pinned = { pinnedSites: [{ url: 'https://example.com/', label: 'Example' }] };

    const { dashboard, browser } = await buildDashboard(
      [tab('https://example.com/', { id: 1 })],
      pinned,
    );
    await dashboard.render();

    // Open: renders as a normal tab in its own domain card, no placeholder.
    expect(missions()).toContain('data-group-index="0"');
    expect(missions()).not.toContain('data-action="open-pinned-site"');

    // Closed: the same card comes back with a click-to-open placeholder
    // instead of disappearing entirely.
    await browser.close([1]);
    await dashboard.render();

    expect(missions()).toContain('data-action="open-pinned-site"');
    expect(missions()).toContain('Example');
    expect(missions()).toContain('pinned-only-card');
  });
});

const sectionCount = (): string => document.getElementById('openTabsSectionCount')!.innerHTML;

describe('Dashboard Tidy button', () => {
  it('stays hidden when nothing qualifies as safe to close', async () => {
    const { dashboard } = await buildDashboard([tab('https://example.com/')]);
    await dashboard.render();
    expect(sectionCount()).not.toContain('data-action="tidy-tabs"');
  });

  it('appears for a disposable tab, describing why in its tooltip', async () => {
    const { dashboard } = await buildDashboard(
      [tab('https://github.com/')],
      { disposableEnabled: true, disposableRules: [{ pattern: 'https://github.com/' }] },
    );
    await dashboard.render();

    expect(sectionCount()).toContain('data-action="tidy-tabs"');
    expect(sectionCount()).toContain('Tidy up');
    expect(sectionCount()).toContain('1 disposable tab');
  });

  it('matches "Close all"\u2019s compact sizing and carries an icon, so the two buttons look like a pair', async () => {
    const { dashboard } = await buildDashboard([
      tab('https://a.com/'),
      tab('https://a.com/'),
    ]);
    await dashboard.render();

    const html = sectionCount();
    // Both buttons must be covered by the same compact-size CSS selector —
    // see `.action-btn.close-all-btn, .action-btn.tidy-btn` in
    // styles/dashboard.css. Asserting the class list here is what would have
    // caught the tidy button rendering at the larger default `.action-btn`
    // size next to a visually smaller "Close all".
    expect(html).toMatch(/class="action-btn close-tabs close-all-btn"/);
    expect(html).toMatch(/class="action-btn save-tabs tidy-btn"/);
    // "Close all" has a leading icon; Tidy up must too, for visual parity.
    expect(html).toContain('<svg');
    const tidyButton = html.slice(html.indexOf('tidy-btn'));
    expect(tidyButton).toContain('<svg');
  });

  it('appears for a duplicate tab', async () => {
    const { dashboard } = await buildDashboard([
      tab('https://a.com/'),
      tab('https://a.com/'),
    ]);
    await dashboard.render();

    expect(sectionCount()).toContain('data-action="tidy-tabs"');
    expect(sectionCount()).toContain('1 duplicate');
  });

  it('appears for a tab whose URL is already saved for later', async () => {
    const { dashboard, savedTabs } = await buildDashboard([tab('https://example.com/article')]);
    await savedTabs.save({ url: 'https://example.com/article', title: 'Article' });
    await dashboard.render();

    expect(sectionCount()).toContain('data-action="tidy-tabs"');
    expect(sectionCount()).toContain('already saved');
  });

  it('disappears again once disposableEnabled is turned off', async () => {
    const { dashboard } = await buildDashboard(
      [tab('https://github.com/')],
      { disposableEnabled: false, disposableRules: [{ pattern: 'https://github.com/' }] },
    );
    await dashboard.render();
    expect(sectionCount()).not.toContain('data-action="tidy-tabs"');
  });

  it('refreshTidyButton recomputes without a full render, e.g. after un-saving a tab', async () => {
    const { dashboard, savedTabs } = await buildDashboard([tab('https://example.com/article')]);
    const saved = await savedTabs.save({ url: 'https://example.com/article', title: 'Article' });
    await dashboard.render();
    expect(sectionCount()).toContain('data-action="tidy-tabs"');

    await savedTabs.dismiss(saved.id);
    await dashboard.refreshTidyButton();
    expect(sectionCount()).not.toContain('data-action="tidy-tabs"');
  });
});
