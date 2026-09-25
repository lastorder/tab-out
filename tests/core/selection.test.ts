import { beforeEach, describe, expect, it } from 'vitest';
import {
  desiredTabOrder,
  findFocusTarget,
  planTabSort,
  selectStaleDashboardTabIds,
  selectTabIdsByExactUrl,
  selectTabIdsByGroupId,
  selectTabIdsByHostname,
} from '@/core/selection';
import { resetTabIds, tab } from '../helpers/factories';

beforeEach(() => resetTabIds());

describe('selectTabIdsByGroupId', () => {
  it('selects every tab currently in the given Chrome tab group', () => {
    const list = [
      tab('https://a.com/', { id: 1, groupId: 5 }),
      tab('https://b.com/', { id: 2, groupId: 5 }),
      tab('https://c.com/', { id: 3, groupId: 6 }),
      tab('https://d.com/', { id: 4 }),
    ];
    expect(selectTabIdsByGroupId(list, 5)).toEqual([1, 2]);
  });

  it('treats a missing groupId the same as -1 (ungrouped)', () => {
    const list = [tab('https://a.com/', { id: 1 })];
    expect(selectTabIdsByGroupId(list, -1)).toEqual([1]);
  });
});

/**
 * These decide which tabs get closed, so they carry the most risk in the
 * codebase. The hostname-vs-exact distinction in particular is what stops
 * "close the Disposable card" from also closing the email you're reading.
 */
describe('selectTabIdsByHostname', () => {
  it('takes every tab on a matching host, but not its subdomains', () => {
    const list = [
      tab('https://github.com/a', { id: 1 }),
      tab('https://github.com/b', { id: 2 }),
      tab('https://gist.github.com/c', { id: 3 }),
      tab('https://example.com/', { id: 4 }),
    ];
    expect(selectTabIdsByHostname(list, ['https://github.com/a'])).toEqual([1, 2]);
  });

  it('falls back to exact matching for file URLs, which have no host', () => {
    const list = [tab('file:///tmp/a.md', { id: 1 }), tab('file:///tmp/b.md', { id: 2 })];
    expect(selectTabIdsByHostname(list, ['file:///tmp/a.md'])).toEqual([1]);
  });

  it('ignores unparseable targets rather than matching broadly', () => {
    expect(selectTabIdsByHostname([tab('https://a.com/', { id: 1 })], ['garbage'])).toEqual([]);
  });
});

describe('selectTabIdsByExactUrl', () => {
  it('spares other pages on the same host', () => {
    const list = [
      tab('https://mail.google.com/mail/u/0/#inbox', { id: 1 }),
      tab('https://mail.google.com/mail/u/0/#inbox/abc', { id: 2 }),
    ];
    expect(selectTabIdsByExactUrl(list, ['https://mail.google.com/mail/u/0/#inbox'])).toEqual([1]);
  });
});

describe('findFocusTarget', () => {
  it('prefers an exact URL, then any tab on the same host', () => {
    const list = [tab('https://a.com/x', { id: 1 }), tab('https://a.com/y', { id: 2 })];
    expect(findFocusTarget(list, 'https://a.com/y', 1)?.id).toBe(2);
    expect(findFocusTarget(list, 'https://a.com/missing', 1)?.id).toBe(1);
  });

  it('prefers a different window, so the jump is visibly something', () => {
    const list = [
      tab('https://a.com/x', { id: 1, windowId: 1 }),
      tab('https://a.com/x', { id: 2, windowId: 2 }),
    ];
    expect(findFocusTarget(list, 'https://a.com/x', 1)?.id).toBe(2);
  });

  it('returns null when nothing matches', () => {
    expect(findFocusTarget([tab('https://a.com/')], 'https://b.com/', 1)).toBeNull();
  });
});

describe('selectStaleDashboardTabIds', () => {
  const DASHBOARD = 'chrome-extension://abc/index.html';

  it('closes every other dashboard, keeps this one, and never touches real pages', () => {
    const list = [
      tab(DASHBOARD, { id: 1 }),
      tab(DASHBOARD, { id: 2 }),
      tab('chrome://newtab/', { id: 3 }),
      tab('https://example.com/', { id: 4 }),
    ];
    expect(selectStaleDashboardTabIds(list, [DASHBOARD, 'chrome://newtab/'], 2)).toEqual([1, 3]);
  });

  it('closes nothing when this is the only dashboard', () => {
    const list = [tab(DASHBOARD, { id: 1 }), tab('https://example.com/', { id: 2 })];
    expect(selectStaleDashboardTabIds(list, [DASHBOARD], 1)).toEqual([]);
  });
});

describe('tab ordering', () => {
  it('flattens groups into tab-bar order, scoped to one window', () => {
    const groups = [
      {
        kind: 'domain' as const,
        tabs: [
          tab('https://a.com/2', { id: 2, index: 5, windowId: 1 }),
          tab('https://a.com/1', { id: 1, index: 2, windowId: 1 }),
          tab('https://a.com/3', { id: 3, index: 0, windowId: 2 }),
        ],
      },
      { kind: 'domain' as const, tabs: [tab('https://b.com/', { id: 4, index: 1, windowId: 1 })] },
    ];
    expect(desiredTabOrder(groups, 1)).toEqual([1, 2, 4]);
  });

  it('excludes a Chrome-tab-group card entirely, leaving that group exactly where it already is', () => {
    const groups = [
      { kind: 'domain' as const, tabs: [tab('https://a.com/', { id: 1, index: 0, windowId: 1 })] },
      {
        kind: 'chrome-group' as const,
        tabs: [
          tab('https://b.com/', { id: 2, index: 1, windowId: 1 }),
          tab('https://c.com/', { id: 3, index: 2, windowId: 1 }),
        ],
      },
      { kind: 'domain' as const, tabs: [tab('https://d.com/', { id: 4, index: 3, windowId: 1 })] },
    ];
    expect(desiredTabOrder(groups, 1)).toEqual([1, 4]);
  });

  it('excludes pinned tabs, which Chrome keeps in a region no sort may disturb', () => {
    const groups = [
      {
        kind: 'domain' as const,
        tabs: [
          tab('https://a.com/', { id: 1, index: 0, windowId: 1, pinned: true }),
          tab('https://a.com/2', { id: 2, index: 3, windowId: 1 }),
        ],
      },
    ];
    expect(desiredTabOrder(groups, 1)).toEqual([2]);
  });
});

describe('planTabSort', () => {
  const move = (tabId: number, index: number) => ({ tabId, index });

  it('reorders movable tabs that sit next to each other', () => {
    const windowTabs = [
      tab('https://github.com/', { id: 1, index: 0, windowId: 1 }),
      tab('https://example.com/', { id: 2, index: 1, windowId: 1 }),
    ];
    // Dashboard wants example.com first.
    expect(planTabSort(windowTabs, 1, [2, 1])).toEqual([move(2, 0)]);
  });

  it('never moves a tab that is in a Chrome group, and never changes where the group sits', () => {
    // Group occupies 0-1. The loose tab at 2 must be sorted *within its own
    // run*, so a plan that would put it at index 0 — shoving the group — is
    // exactly what this guards against.
    const windowTabs = [
      tab('https://a.com/1', { id: 1, index: 0, windowId: 1, groupId: 9 }),
      tab('https://a.com/2', { id: 2, index: 1, windowId: 1, groupId: 9 }),
      tab('https://example.com/', { id: 3, index: 2, windowId: 1 }),
    ];
    expect(planTabSort(windowTabs, 1, [3])).toEqual([]);
  });

  it('sorts loose tabs inside the gap between two groups without touching either group', () => {
    // Group A at 0-1, loose 2-3, group B at 4-5.
    const windowTabs = [
      tab('https://a.com/1', { id: 1, index: 0, windowId: 1, groupId: 9 }),
      tab('https://a.com/2', { id: 2, index: 1, windowId: 1, groupId: 9 }),
      tab('https://b.com/', { id: 3, index: 2, windowId: 1 }),
      tab('https://example.com/', { id: 4, index: 3, windowId: 1 }),
      tab('https://c.com/1', { id: 5, index: 4, windowId: 1, groupId: 8 }),
      tab('https://c.com/2', { id: 6, index: 5, windowId: 1, groupId: 8 }),
    ];
    // Dashboard wants example.com before b.com — both loose, both in the run {2,3}.
    expect(planTabSort(windowTabs, 1, [4, 3])).toEqual([move(4, 2)]);
  });

  it('sorts each run only against itself, never dragging a tab across a group', () => {
    // A loose tab alone at index 0, a group at 1-2, two loose tabs at 3-4.
    const windowTabs = [
      tab('https://zzz.com/', { id: 1, index: 0, windowId: 1 }),
      tab('https://a.com/1', { id: 2, index: 1, windowId: 1, groupId: 9 }),
      tab('https://a.com/2', { id: 3, index: 2, windowId: 1, groupId: 9 }),
      tab('https://mmm.com/', { id: 4, index: 3, windowId: 1 }),
      tab('https://bbb.com/', { id: 5, index: 4, windowId: 1 }),
    ];
    // Dashboard order is alphabetical: bbb, mmm, zzz. The lone tab in run
    // {0} has nothing to swap with, so it stays put; run {3,4} sorts its own
    // members. The group is never crossed and never moved.
    expect(planTabSort(windowTabs, 1, [5, 4, 1])).toEqual([move(5, 3)]);
  });

  it('leaves pinned tabs alone', () => {
    const windowTabs = [
      tab('https://a.com/', { id: 1, index: 0, windowId: 1, pinned: true }),
      tab('https://b.com/', { id: 2, index: 1, windowId: 1 }),
      tab('https://c.com/', { id: 3, index: 2, windowId: 1 }),
    ];
    expect(planTabSort(windowTabs, 1, [3, 2])).toEqual([move(3, 1)]);
  });

  it('is a no-op when the window is already in order', () => {
    const windowTabs = [
      tab('https://example.com/', { id: 1, index: 0, windowId: 1 }),
      tab('https://github.com/', { id: 2, index: 1, windowId: 1 }),
    ];
    expect(planTabSort(windowTabs, 1, [1, 2])).toEqual([]);
  });

  it('ignores tabs from other windows', () => {
    const windowTabs = [
      tab('https://example.com/', { id: 1, index: 0, windowId: 1 }),
      tab('https://github.com/', { id: 2, index: 1, windowId: 1 }),
      tab('https://other.com/', { id: 3, index: 0, windowId: 2 }),
    ];
    expect(planTabSort(windowTabs, 1, [1, 2])).toEqual([]);
  });
});
