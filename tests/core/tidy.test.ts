import { beforeEach, describe, expect, it } from 'vitest';
import { selectTidyTabIds } from '@/core/tidy';
import { resetTabIds, tab } from '../helpers/factories';

beforeEach(() => resetTabIds());

const RULES = [{ pattern: 'https://github.com/' }];

describe('selectTidyTabIds', () => {
  it('closes a disposable tab, attributing it to "disposable"', () => {
    const tabs = [tab('https://github.com/', { id: 1 }), tab('https://example.com/', { id: 2 })];

    const { tabIds, breakdown } = selectTidyTabIds(tabs, {
      disposableEnabled: true,
      disposableRules: RULES,
      savedUrls: new Set(),
    });

    expect(tabIds).toEqual([1]);
    expect(breakdown).toEqual({ disposable: 1, saved: 0, duplicates: 0 });
  });

  it('closes a tab whose URL is already saved for later, attributing it to "saved"', () => {
    const tabs = [tab('https://example.com/article', { id: 1 })];

    const { tabIds, breakdown } = selectTidyTabIds(tabs, {
      disposableEnabled: true,
      disposableRules: [],
      savedUrls: new Set(['https://example.com/article']),
    });

    expect(tabIds).toEqual([1]);
    expect(breakdown).toEqual({ disposable: 0, saved: 1, duplicates: 0 });
  });

  it('closes every extra copy of a duplicated URL, keeping one', () => {
    const tabs = [
      tab('https://a.com/', { id: 1 }),
      tab('https://a.com/', { id: 2, active: true }),
      tab('https://a.com/', { id: 3 }),
    ];

    const { tabIds, breakdown } = selectTidyTabIds(tabs, {
      disposableEnabled: true,
      disposableRules: [],
      savedUrls: new Set(),
    });

    // Prefers keeping the active tab, matching "Close duplicates" elsewhere.
    expect(tabIds.sort()).toEqual([1, 3]);
    expect(breakdown).toEqual({ disposable: 0, saved: 0, duplicates: 2 });
  });

  it('closes nothing, and reports an all-zero breakdown, when nothing qualifies', () => {
    const tabs = [tab('https://example.com/', { id: 1 })];

    const { tabIds, breakdown } = selectTidyTabIds(tabs, {
      disposableEnabled: true,
      disposableRules: RULES,
      savedUrls: new Set(),
    });

    expect(tabIds).toEqual([]);
    expect(breakdown).toEqual({ disposable: 0, saved: 0, duplicates: 0 });
  });

  it('ignores disposable rules entirely when disposableEnabled is off', () => {
    const tabs = [tab('https://github.com/', { id: 1 })];

    const { tabIds, breakdown } = selectTidyTabIds(tabs, {
      disposableEnabled: false,
      disposableRules: RULES,
      savedUrls: new Set(),
    });

    expect(tabIds).toEqual([]);
    expect(breakdown.disposable).toBe(0);
  });

  it('attributes each tab to exactly one reason, so the breakdown sums to the total closed', () => {
    // github.com/ is both disposable *and* duplicated. It must be counted
    // once, as disposable — not twice, and not also as a "kept" duplicate
    // copy that somehow still gets closed.
    const tabs = [
      tab('https://github.com/', { id: 1 }),
      tab('https://github.com/', { id: 2 }),
      tab('https://saved.com/', { id: 3 }),
      tab('https://dup.com/', { id: 4 }),
      tab('https://dup.com/', { id: 5 }),
    ];

    const { tabIds, breakdown } = selectTidyTabIds(tabs, {
      disposableEnabled: true,
      disposableRules: RULES,
      savedUrls: new Set(['https://saved.com/']),
    });

    const total = breakdown.disposable + breakdown.saved + breakdown.duplicates;
    expect(tabIds).toHaveLength(total);
    expect(breakdown).toEqual({ disposable: 2, saved: 1, duplicates: 1 });
  });
});
