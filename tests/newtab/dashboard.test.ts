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

    // GitHub has more tabs, so it sorts first.
    expect(first!.key).toBe('github.com');
    expect(first!.tabs).toHaveLength(2);
  });

  it('renders pinned placeholders for sites with no open tabs', async () => {
    const { dashboard } = await buildDashboard([], {
      pinnedSites: [{ url: 'https://mail.google.com/', label: 'Gmail' }],
    });
    await dashboard.render();

    expect(missions()).toContain('data-action="open-pinned-site"');
    expect(missions()).toContain('Gmail');
  });

  it('shows the sort banner only when the tab bar is out of order', async () => {
    const banner = () => document.getElementById('tabSortBanner')!.style.display;

    // github.com sorts first in the dashboard, but sits last in the tab bar.
    const { dashboard } = await buildDashboard([
      tab('https://example.com/', { index: 0, windowId: 1 }),
      tab('https://github.com/a', { index: 1, windowId: 1 }),
      tab('https://github.com/b', { index: 2, windowId: 1 }),
    ]);
    await dashboard.render();
    expect(banner()).toBe('flex');
    expect(dashboard.desiredOrder.length).toBe(3);

    // Now in matching order.
    const ordered = await buildDashboard([
      tab('https://github.com/a', { index: 0, windowId: 1 }),
      tab('https://github.com/b', { index: 1, windowId: 1 }),
      tab('https://example.com/', { index: 2, windowId: 1 }),
    ]);
    await ordered.dashboard.render();
    expect(banner()).toBe('none');
  });

  it('picks up settings changes on the next render', async () => {
    const { dashboard } = await buildDashboard([tab('https://acme.net/x')]);
    await dashboard.render();
    expect(missions()).toContain('Acme');

    await dashboard.deps.settingsStore.save(
      emptySettings({
        customGroups: [{ groupKey: 'work', groupLabel: 'Work Stuff', hostname: 'acme.net' }],
      }),
    );
    await dashboard.render();
    expect(missions()).toContain('Work Stuff');
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
});
