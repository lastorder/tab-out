import { beforeEach, describe, expect, it } from 'vitest';
import { analyzeDuplicates, countUrls, selectDuplicateTabIds, uniqueByUrl } from '@/core/duplicates';
import { resetTabIds, tab, tabs } from '../helpers/factories';

beforeEach(() => resetTabIds());

describe('countUrls', () => {
  it('counts exact URL repeats', () => {
    const list = tabs('https://a.com/', 'https://a.com/', 'https://b.com/');
    expect(countUrls(list)).toEqual({ 'https://a.com/': 2, 'https://b.com/': 1 });
  });
});

describe('analyzeDuplicates', () => {
  it('reports duplicates and how many tabs are redundant', () => {
    const list = tabs(
      'https://a.com/',
      'https://a.com/',
      'https://a.com/',
      'https://b.com/',
      'https://b.com/',
    );
    const report = analyzeDuplicates(list);

    expect(report.hasDuplicates).toBe(true);
    expect(report.duplicateUrls.sort()).toEqual(['https://a.com/', 'https://b.com/']);
    // Two extra copies of a.com plus one of b.com.
    expect(report.extraCount).toBe(3);
  });

  it('does not treat different paths on one host as duplicates', () => {
    const report = analyzeDuplicates(tabs('https://a.com/1', 'https://a.com/2'));
    expect(report.hasDuplicates).toBe(false);
    expect(report.extraCount).toBe(0);
  });

  it('handles an empty list', () => {
    expect(analyzeDuplicates([])).toMatchObject({ hasDuplicates: false, extraCount: 0 });
  });
});

describe('uniqueByUrl', () => {
  it('keeps the first occurrence and preserves order', () => {
    const list = [
      tab('https://a.com/', { id: 1 }),
      tab('https://b.com/', { id: 2 }),
      tab('https://a.com/', { id: 3 }),
    ];
    expect(uniqueByUrl(list).map((t) => t.id)).toEqual([1, 2]);
  });
});

describe('selectDuplicateTabIds', () => {
  it('keeps one copy and closes the rest', () => {
    const list = [
      tab('https://a.com/', { id: 1 }),
      tab('https://a.com/', { id: 2 }),
      tab('https://a.com/', { id: 3 }),
    ];
    expect(selectDuplicateTabIds(list, ['https://a.com/'], true)).toEqual([2, 3]);
  });

  it('keeps the active copy when there is one', () => {
    const list = [
      tab('https://a.com/', { id: 1 }),
      tab('https://a.com/', { id: 2, active: true }),
      tab('https://a.com/', { id: 3 }),
    ];
    expect(selectDuplicateTabIds(list, ['https://a.com/'], true)).toEqual([1, 3]);
  });

  it('closes every copy when keepOne is false', () => {
    const list = [tab('https://a.com/', { id: 1 }), tab('https://a.com/', { id: 2 })];
    expect(selectDuplicateTabIds(list, ['https://a.com/'], false)).toEqual([1, 2]);
  });

  it('ignores URLs that are not open', () => {
    expect(selectDuplicateTabIds(tabs('https://a.com/'), ['https://gone.com/'])).toEqual([]);
  });

  it('does not double-count a URL listed twice', () => {
    const list = [tab('https://a.com/', { id: 1 }), tab('https://a.com/', { id: 2 })];
    expect(selectDuplicateTabIds(list, ['https://a.com/', 'https://a.com/'], true)).toEqual([2]);
  });
});
