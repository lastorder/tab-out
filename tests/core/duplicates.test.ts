import { beforeEach, describe, expect, it } from 'vitest';
import { analyzeDuplicates, selectDuplicateTabIds, uniqueByUrl } from '@/core/duplicates';
import { resetTabIds, tab, tabs } from '../helpers/factories';

beforeEach(() => resetTabIds());

describe('analyzeDuplicates', () => {
  it('counts redundant copies, not distinct pages on one host', () => {
    const report = analyzeDuplicates(
      tabs('https://a.com/', 'https://a.com/', 'https://a.com/', 'https://b.com/', 'https://b.com/'),
    );

    expect(report.hasDuplicates).toBe(true);
    expect(report.duplicateUrls.sort()).toEqual(['https://a.com/', 'https://b.com/']);
    // Two extra copies of a.com plus one of b.com.
    expect(report.extraCount).toBe(3);
  });

  it('treats different paths on one host as distinct', () => {
    expect(analyzeDuplicates(tabs('https://a.com/1', 'https://a.com/2'))).toMatchObject({
      hasDuplicates: false,
      extraCount: 0,
    });
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
  it('keeps one copy, preferring the active tab', () => {
    const list = [
      tab('https://a.com/', { id: 1 }),
      tab('https://a.com/', { id: 2, active: true }),
      tab('https://a.com/', { id: 3 }),
    ];
    expect(selectDuplicateTabIds(list, ['https://a.com/'])).toEqual([1, 3]);
  });

  it('closes every copy when keepOne is false', () => {
    const list = [tab('https://a.com/', { id: 1 }), tab('https://a.com/', { id: 2 })];
    expect(selectDuplicateTabIds(list, ['https://a.com/'], false)).toEqual([1, 2]);
  });

  it('ignores URLs that are not open, and never double-counts a repeated URL', () => {
    const list = [tab('https://a.com/', { id: 1 }), tab('https://a.com/', { id: 2 })];
    expect(selectDuplicateTabIds(list, ['https://gone.com/'])).toEqual([]);
    expect(selectDuplicateTabIds(list, ['https://a.com/', 'https://a.com/'])).toEqual([2]);
  });
});
