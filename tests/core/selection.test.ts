import { beforeEach, describe, expect, it } from 'vitest';
import {
  desiredTabOrder,
  findFocusTarget,
  needsSorting,
  selectStaleDashboardTabIds,
  selectTabIdsByExactUrl,
  selectTabIdsByHostname,
} from '@/core/selection';
import { resetTabIds, tab } from '../helpers/factories';

beforeEach(() => resetTabIds());

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
        tabs: [
          tab('https://a.com/2', { id: 2, index: 5, windowId: 1 }),
          tab('https://a.com/1', { id: 1, index: 2, windowId: 1 }),
          tab('https://a.com/3', { id: 3, index: 0, windowId: 2 }),
        ],
      },
      { tabs: [tab('https://b.com/', { id: 4, index: 1, windowId: 1 })] },
    ];
    expect(desiredTabOrder(groups, 1)).toEqual([1, 2, 4]);
  });

  it('detects a mismatch, ignoring lists too short to have an order', () => {
    expect(needsSorting([1, 2, 3], [1, 2, 3])).toBe(false);
    expect(needsSorting([3, 2, 1], [1, 2, 3])).toBe(true);
    expect(needsSorting([1, 2], [1, 2, 3])).toBe(true);
    expect(needsSorting([], [])).toBe(false);
    expect(needsSorting([1], [1])).toBe(false);
  });
});
