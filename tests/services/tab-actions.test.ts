import { beforeEach, describe, expect, it } from 'vitest';
import { TabActions } from '@/services/tab-actions';
import { LANDING_GROUP_KEY } from '@/core/grouping';
import { createFakeBrowser } from '../helpers/fake-browser';
import { resetTabIds, tab } from '../helpers/factories';

beforeEach(() => resetTabIds());

describe('TabActions.closeByUrl', () => {
  it('closes the matching tab', async () => {
    const browser = createFakeBrowser([
      tab('https://a.com/', { id: 1 }),
      tab('https://b.com/', { id: 2 }),
    ]);
    const actions = new TabActions(browser);

    expect(await actions.closeByUrl('https://a.com/')).toBe(true);
    expect(browser.tabs.map((t) => t.id)).toEqual([2]);
  });

  it('reports false when the URL is not open', async () => {
    const browser = createFakeBrowser([tab('https://a.com/', { id: 1 })]);
    expect(await new TabActions(browser).closeByUrl('https://gone.com/')).toBe(false);
    expect(browser.closed).toEqual([]);
  });
});

describe('TabActions.closeGroup', () => {
  it('closes a domain group by hostname, taking every tab on that host', async () => {
    const browser = createFakeBrowser([
      tab('https://github.com/a', { id: 1 }),
      tab('https://github.com/b', { id: 2 }),
      tab('https://example.com/', { id: 3 }),
    ]);
    const actions = new TabActions(browser);

    const closed = await actions.closeGroup({
      key: 'github.com',
      kind: 'domain',
      tabs: [tab('https://github.com/a', { id: 1 })],
    });

    expect(closed).toBe(2);
    expect(browser.tabs.map((t) => t.id)).toEqual([3]);
  });

  it('closes the Homepages group by exact URL, sparing content tabs', async () => {
    const inbox = tab('https://mail.google.com/mail/u/0/#inbox', { id: 1 });
    const thread = tab('https://mail.google.com/mail/u/0/#inbox/abc', { id: 2 });
    const browser = createFakeBrowser([inbox, thread]);

    const closed = await new TabActions(browser).closeGroup({
      key: LANDING_GROUP_KEY,
      kind: 'landing',
      tabs: [inbox],
    });

    expect(closed).toBe(1);
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

describe('TabActions.closeAllRealTabs', () => {
  it('closes web pages but leaves browser-internal pages alone', async () => {
    const browser = createFakeBrowser([
      tab('https://a.com/', { id: 1 }),
      tab('chrome://newtab/', { id: 2 }),
      tab('chrome-extension://abc/index.html', { id: 3 }),
    ]);

    expect(await new TabActions(browser).closeAllRealTabs()).toBe(1);
    expect(browser.tabs.map((t) => t.id)).toEqual([2, 3]);
  });
});

describe('TabActions.closeDuplicates', () => {
  it('keeps one copy of each URL', async () => {
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
    const browser = createFakeBrowser(
      [tab('https://a.com/', { id: 5, windowId: 2 })],
      { currentWindowId: 1 },
    );

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

  it('opens the site next to its nearest open pinned neighbour', async () => {
    const browser = createFakeBrowser([
      tab('https://first.com/', { id: 1, windowId: 1, index: 2 }),
    ]);

    await new TabActions(browser).openPinnedSite(pinned[1]!, 1, pinned);

    expect(browser.created).toEqual([{ url: 'https://second.com', index: 3 }]);
  });

  it('opens at the front when no neighbour is open', async () => {
    const browser = createFakeBrowser([]);
    await new TabActions(browser).openPinnedSite(pinned[1]!, 1, pinned);
    expect(browser.created).toEqual([{ url: 'https://second.com', index: 0 }]);
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

describe('TabActions.closeOtherDashboards', () => {
  const DASHBOARD = 'chrome-extension://abc/index.html';

  it('leaves exactly one dashboard open', async () => {
    const browser = createFakeBrowser([
      tab(DASHBOARD, { id: 1 }),
      tab(DASHBOARD, { id: 2 }),
      tab('chrome://newtab/', { id: 3 }),
      tab('https://example.com/', { id: 4 }),
    ]);

    const closed = await new TabActions(browser).closeOtherDashboards(
      [DASHBOARD, 'chrome://newtab/'],
      2,
    );

    expect(closed).toBe(2);
    expect(browser.tabs.map((t) => t.id)).toEqual([2, 4]);
  });

  it('is a no-op when this is the only dashboard', async () => {
    const browser = createFakeBrowser([tab(DASHBOARD, { id: 1 })]);
    expect(await new TabActions(browser).closeOtherDashboards([DASHBOARD], 1)).toBe(0);
    expect(browser.closed).toEqual([]);
  });
});
