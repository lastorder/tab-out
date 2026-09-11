import { beforeEach, describe, expect, it } from 'vitest';
import { TabActions } from '@/services/tab-actions';
import { LANDING_GROUP_KEY } from '@/core/grouping';
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

  it('closes Homepages by exact URL, sparing content tabs on the same host', async () => {
    const inbox = tab('https://mail.google.com/mail/u/0/#inbox', { id: 1 });
    const thread = tab('https://mail.google.com/mail/u/0/#inbox/abc', { id: 2 });
    const browser = createFakeBrowser([inbox, thread]);

    await new TabActions(browser).closeGroup({
      key: LANDING_GROUP_KEY,
      kind: 'landing',
      tabs: [inbox],
    });

    expect(browser.tabs.map((t) => t.id)).toEqual([2]);
  });

  it('closes a custom group by exact URL, since its key is not a hostname', async () => {
    const inGroup = tab('https://acme.net/jira/1', { id: 1 });
    const outside = tab('https://acme.net/wiki', { id: 2 });
    const browser = createFakeBrowser([inGroup, outside]);

    await new TabActions(browser).closeGroup({
      key: 'work',
      label: 'Work',
      kind: 'custom',
      tabs: [inGroup],
    });

    expect(browser.tabs.map((t) => t.id)).toEqual([2]);
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
  it('moves each tab to its target position in order', async () => {
    const browser = createFakeBrowser([]);
    await new TabActions(browser).sortTabs([7, 3, 9]);
    expect(browser.moved).toEqual([
      { tabId: 7, index: 0 },
      { tabId: 3, index: 1 },
      { tabId: 9, index: 2 },
    ]);
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
