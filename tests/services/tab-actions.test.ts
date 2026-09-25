import { beforeEach, describe, expect, it } from 'vitest';
import { TabActions } from '@/services/tab-actions';
import { DISPOSABLE_GROUP_KEY } from '@/core/grouping';
import { createFakeBrowser } from '../helpers/fake-browser';
import { resetTabIds, tab } from '../helpers/factories';

beforeEach(() => resetTabIds());

const DASHBOARD = 'chrome-extension://abc/index.html';
const DASHBOARD_URLS = [DASHBOARD, 'chrome://newtab/'];

describe('TabActions.closeGroup', () => {
  it('closes a domain group by hostname, taking every tab on that host', async () => {
    const browser = createFakeBrowser([
      tab('https://github.com/a', { id: 1 }),
      tab('https://github.com/b', { id: 2 }),
      tab('https://example.com/', { id: 3 }),
    ]);

    const closed = await new TabActions(browser).closeGroup({
      key: 'github.com',
      kind: 'domain',
      tabs: [tab('https://github.com/a', { id: 1 })],
    });

    expect(closed).toBe(2);
    expect(browser.tabs.map((t) => t.id)).toEqual([3]);
  });

  it('closes Disposable by exact URL, sparing content tabs on the same host', async () => {
    const inbox = tab('https://mail.google.com/mail/u/0/#inbox', { id: 1 });
    const thread = tab('https://mail.google.com/mail/u/0/#inbox/abc', { id: 2 });
    const browser = createFakeBrowser([inbox, thread]);

    await new TabActions(browser).closeGroup({
      key: DISPOSABLE_GROUP_KEY,
      kind: 'disposable',
      tabs: [inbox],
    });

    expect(browser.tabs.map((t) => t.id)).toEqual([2]);
  });

  it('closes a Chrome-tab-group card by live groupId, not by the snapshot it was rendered with', async () => {
    const browser = createFakeBrowser([
      tab('https://a.com/', { id: 1, groupId: 9 }),
      tab('https://b.com/', { id: 2, groupId: 9 }),
      tab('https://c.com/', { id: 3, groupId: 10 }),
    ]);

    const closed = await new TabActions(browser).closeGroup({
      key: '__chrome-group-9__',
      kind: 'chrome-group',
      chromeGroupId: 9,
      label: 'Research',
      tabs: [tab('https://a.com/', { id: 1, groupId: 9 })],
    });

    expect(closed).toBe(2);
    expect(browser.tabs.map((t) => t.id)).toEqual([3]);
  });
});

describe('TabActions.runAutoGroup', () => {
  it('does nothing when autoGroupEnabled is off', async () => {
    const browser = createFakeBrowser([
      tab('https://example.com/a', { id: 1 }),
      tab('https://example.com/b', { id: 2 }),
    ]);

    const created = await new TabActions(browser).runAutoGroup({
      autoGroupEnabled: false,
      disposableEnabled: true,
      disposableRules: [],
    });

    expect(created).toBe(0);
    expect(browser.createdGroups).toEqual([]);
  });

  it('creates a Chrome tab group for a qualifying domain when enabled', async () => {
    const browser = createFakeBrowser([
      tab('https://example.com/a', { id: 1 }),
      tab('https://example.com/b', { id: 2 }),
    ]);

    const created = await new TabActions(browser).runAutoGroup({
      autoGroupEnabled: true,
      disposableEnabled: true,
      disposableRules: [],
    });

    expect(created).toBe(1);
    expect(browser.createdGroups).toEqual([{ tabIds: [1, 2], title: 'Example', groupId: 1 }]);
    expect(browser.tabs.every((t) => t.groupId === 1)).toBe(true);
  });

  it('adds a newly opened tab of an already grouped domain to that group instead of creating a second one', async () => {
    const browser = createFakeBrowser([
      tab('https://thoughtworks.com/a', { id: 1, groupId: 4 }),
      tab('https://thoughtworks.com/b', { id: 2, groupId: 4 }),
      tab('https://thoughtworks.com/c', { id: 3 }),
    ]);
    browser.groups.set(4, { id: 4, title: 'Thoughtworks', color: 'blue' });

    const applied = await new TabActions(browser).runAutoGroup({
      autoGroupEnabled: true,
      disposableEnabled: true,
      disposableRules: [],
    });

    expect(applied).toBe(1);
    expect(browser.createdGroups).toEqual([]);
    expect(browser.addedToGroups).toEqual([{ tabIds: [3], groupId: 4 }]);
    expect(browser.tabs.every((t) => t.groupId === 4)).toBe(true);
  });

  it('leaves tabs alone entirely when autoGroupEnabled is off, even ones a domain group could adopt', async () => {
    const browser = createFakeBrowser([
      tab('https://example.com/a', { id: 1, groupId: 4 }),
      tab('https://example.com/b', { id: 2 }),
    ]);
    browser.groups.set(4, { id: 4, title: 'Example', color: 'blue' });

    const applied = await new TabActions(browser).runAutoGroup({
      autoGroupEnabled: false,
      disposableEnabled: true,
      disposableRules: [],
    });

    expect(applied).toBe(0);
    expect(browser.addedToGroups).toEqual([]);
    expect(browser.createdGroups).toEqual([]);
  });

  it('never creates a second group for a domain it already grouped, across repeated sweeps', async () => {
    // The end-to-end shape of the reported bug: two Thoughtworks tabs get
    // grouped, then two more open. The second sweep must add them to the
    // existing group, not seed another "Thoughtworks" group beside it.
    const browser = createFakeBrowser([
      tab('https://thoughtworks.com/a', { id: 1 }),
      tab('https://thoughtworks.com/b', { id: 2 }),
    ]);
    const actions = new TabActions(browser);
    const settings = {
      autoGroupEnabled: true,
      disposableEnabled: true,
      disposableRules: [],
    };

    await actions.runAutoGroup(settings);
    expect(browser.createdGroups).toHaveLength(1);

    browser.tabs.push(tab('https://thoughtworks.com/c', { id: 3 }));
    browser.tabs.push(tab('https://thoughtworks.com/d', { id: 4 }));
    await actions.runAutoGroup(settings);

    expect(browser.createdGroups).toHaveLength(1);
    expect(browser.addedToGroups).toEqual([{ tabIds: [3, 4], groupId: 1 }]);
    expect(browser.tabs.every((t) => t.groupId === 1)).toBe(true);
  });
});

describe('TabActions closing', () => {
  it('closes one tab by URL, reporting whether it existed', async () => {
    const browser = createFakeBrowser([tab('https://a.com/', { id: 1 })]);
    const actions = new TabActions(browser);

    expect(await actions.closeByUrl('https://a.com/')).toBe(true);
    expect(await actions.closeByUrl('https://gone.com/')).toBe(false);
    expect(browser.tabs).toEqual([]);
  });

  it('closes web pages but leaves browser-internal pages alone', async () => {
    const browser = createFakeBrowser([
      tab('https://a.com/', { id: 1 }),
      tab('chrome://newtab/', { id: 2 }),
      tab('chrome-extension://abc/index.html', { id: 3 }),
    ]);

    expect(await new TabActions(browser).closeAllRealTabs()).toBe(1);
    expect(browser.tabs.map((t) => t.id)).toEqual([2, 3]);
  });

  it('de-duplicates down to one copy', async () => {
    const browser = createFakeBrowser([
      tab('https://a.com/', { id: 1 }),
      tab('https://a.com/', { id: 2 }),
      tab('https://a.com/', { id: 3 }),
    ]);

    expect(await new TabActions(browser).closeDuplicates(['https://a.com/'])).toBe(2);
    expect(browser.tabs).toHaveLength(1);
  });
});

describe('TabActions.focus', () => {
  it('activates the matching tab and focuses its window', async () => {
    const browser = createFakeBrowser([tab('https://a.com/', { id: 5, windowId: 2 })], {
      currentWindowId: 1,
    });

    expect(await new TabActions(browser).focus('https://a.com/')).toBe(true);
    expect(browser.activated).toEqual({ tabId: 5, windowId: 2 });
  });

  it('does nothing when there is no match', async () => {
    const browser = createFakeBrowser([tab('https://a.com/', { id: 1 })]);
    expect(await new TabActions(browser).focus('https://b.com/')).toBe(false);
    expect(browser.activated).toBeNull();
  });
});

describe('TabActions.openPinnedSite', () => {
  const pinned = [{ url: 'https://first.com' }, { url: 'https://second.com' }];

  it('focuses an already-open copy instead of opening a second one', async () => {
    const browser = createFakeBrowser([
      tab('https://second.com/page', { id: 9, windowId: 1, index: 3 }),
    ]);

    await new TabActions(browser).openPinnedSite(pinned[1]!, 1, pinned);

    expect(browser.activated).toEqual({ tabId: 9, windowId: 1 });
    expect(browser.created).toEqual([]);
  });

  it('opens next to its nearest open pinned neighbour, else at the front', async () => {
    const withNeighbour = createFakeBrowser([
      tab('https://first.com/', { id: 1, windowId: 1, index: 2 }),
    ]);
    await new TabActions(withNeighbour).openPinnedSite(pinned[1]!, 1, pinned);
    expect(withNeighbour.created).toEqual([{ url: 'https://second.com', index: 3 }]);

    const empty = createFakeBrowser([]);
    await new TabActions(empty).openPinnedSite(pinned[1]!, 1, pinned);
    expect(empty.created).toEqual([{ url: 'https://second.com', index: 0 }]);
  });
});

describe('TabActions.openOrFocusTab', () => {
  it('creates a new tab when the URL is not open', async () => {
    const browser = createFakeBrowser([]);
    expect(await new TabActions(browser).openOrFocusTab('https://a.com/')).toBe('created');
    expect(browser.created).toEqual([{ url: 'https://a.com/' }]);
  });

  it('focuses an already-open tab instead of creating a duplicate', async () => {
    const browser = createFakeBrowser([tab('https://a.com/', { id: 9, windowId: 2 })]);
    expect(await new TabActions(browser).openOrFocusTab('https://a.com/')).toBe('focused');
    expect(browser.activated).toEqual({ tabId: 9, windowId: 2 });
    expect(browser.created).toEqual([]);
  });

  it('reports failure instead of throwing, e.g. a file:// URL without file access granted', async () => {
    const browser = createFakeBrowser([]);
    browser.create = () => Promise.reject(new Error('file access not allowed'));
    expect(await new TabActions(browser).openOrFocusTab('file:///tmp/a.txt')).toBe('failed');
  });
});

describe('TabActions.sortTabs', () => {
  it('performs exactly the moves it is handed, in order, and reports how many', async () => {
    const browser = createFakeBrowser([]);
    const moved = await new TabActions(browser).sortTabs([
      { tabId: 7, index: 4 },
      { tabId: 3, index: 0 },
    ]);
    expect(moved).toBe(2);
    expect(browser.moved).toEqual([
      { tabId: 7, index: 4 },
      { tabId: 3, index: 0 },
    ]);
  });
});

describe('TabActions.closeTabs', () => {
  it('closes exactly the given ids — the effect side of "Tidy up", whose selection logic is pure', async () => {
    const browser = createFakeBrowser([
      tab('https://a.com/', { id: 1 }),
      tab('https://b.com/', { id: 2 }),
      tab('https://c.com/', { id: 3 }),
    ]);
    await new TabActions(browser).closeTabs([1, 3]);
    expect(browser.tabs.map((t) => t.id)).toEqual([2]);
  });
});

describe('TabActions dashboard rules', () => {
  it('keeps only this dashboard, never touching ordinary pages', async () => {
    const browser = createFakeBrowser(
      [
        tab(DASHBOARD, { id: 1 }),
        tab(DASHBOARD, { id: 2 }),
        tab('chrome://newtab/', { id: 3 }),
        tab('https://example.com/', { id: 4 }),
      ],
      { currentTabId: 2 },
    );

    expect(await new TabActions(browser).keepOnlyThisDashboard(DASHBOARD_URLS)).toBe(2);
    expect(browser.tabs.map((t) => t.id)).toEqual([2, 4]);
  });

  it('closes nothing when the current tab id is unknown, or it is the only one', async () => {
    const unknown = createFakeBrowser([tab(DASHBOARD, { id: 1 }), tab(DASHBOARD, { id: 2 })], {
      currentTabId: -1,
    });
    expect(await new TabActions(unknown).keepOnlyThisDashboard(DASHBOARD_URLS)).toBe(0);
    expect(unknown.closed).toEqual([]);

    const only = createFakeBrowser([tab(DASHBOARD, { id: 1 })], { currentTabId: 1 });
    expect(await new TabActions(only).keepOnlyThisDashboard(DASHBOARD_URLS)).toBe(0);
  });

  it('swallows browser errors so the dashboard still renders', async () => {
    const browser = createFakeBrowser([], { currentTabId: 1 });
    browser.currentTabId = () => Promise.reject(new Error('no tab'));
    expect(await new TabActions(browser).keepOnlyThisDashboard(DASHBOARD_URLS)).toBe(0);
  });

  it('moves the dashboard to the end only when it is not already last', async () => {
    const needsMove = createFakeBrowser([
      tab(DASHBOARD, { id: 1, windowId: 1, index: 0 }),
      tab('https://a.com/', { id: 2, windowId: 1, index: 1 }),
    ]);
    expect(await new TabActions(needsMove).moveDashboardToEnd(DASHBOARD_URLS)).toBe(true);
    expect(needsMove.moved).toEqual([{ tabId: 1, index: -1 }]);

    const alreadyLast = createFakeBrowser([
      tab('https://a.com/', { id: 1, windowId: 1, index: 0 }),
      tab(DASHBOARD, { id: 2, windowId: 1, index: 1 }),
    ]);
    expect(await new TabActions(alreadyLast).moveDashboardToEnd(DASHBOARD_URLS)).toBe(false);
    expect(alreadyLast.moved).toEqual([]);
  });
});
