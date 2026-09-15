import { describe, expect, it } from 'vitest';
import { clampSelection, moveSelection, searchTabsAndHistory } from '@/core/search';
import { tab, historyEntry } from '../helpers/factories';

describe('searchTabsAndHistory', () => {
  const openTabs = [
    tab('https://a.com/', { title: 'Alpha' }),
    tab('https://b.com/', { title: 'Beta' }),
  ];
  const history = [
    historyEntry('https://c.com/', { title: 'Gamma' }),
    historyEntry('https://alpha-archive.com/', { title: 'Old Alpha' }),
  ];

  it('returns everything, tabs first, when the query is blank', () => {
    const results = searchTabsAndHistory(openTabs, history, '');
    expect(results.map((r) => r.kind)).toEqual(['tab', 'tab', 'history', 'history']);
  });

  it('filters both lists by title or URL, case-insensitively', () => {
    const results = searchTabsAndHistory(openTabs, history, 'alpha');
    expect(results.map((r) => r.title)).toEqual(['Alpha', 'Old Alpha']);
  });

  it('matches on URL when the title does not contain the query', () => {
    const results = searchTabsAndHistory(openTabs, history, 'b.com');
    expect(results.map((r) => r.title)).toEqual(['Beta']);
  });

  it('narrows a space-separated query, requiring every term to match', () => {
    // "Old Alpha" is at alpha-archive.com: "alpha" hits the title, "archive"
    // the URL. Both must match, and they may match different fields.
    const results = searchTabsAndHistory(openTabs, history, 'alpha archive');
    expect(results.map((r) => r.title)).toEqual(['Old Alpha']);
  });

  it('is order-independent and ignores extra whitespace', () => {
    const results = searchTabsAndHistory(openTabs, history, '  archive   ALPHA  ');
    expect(results.map((r) => r.title)).toEqual(['Old Alpha']);
  });

  it('returns nothing when one of several terms matches nothing', () => {
    expect(searchTabsAndHistory(openTabs, history, 'alpha gamma')).toEqual([]);
  });

  it('tags each result with the fields its kind needs', () => {
    const [tabResult, , historyResult] = searchTabsAndHistory(openTabs, history, '');
    expect(tabResult).toMatchObject({ kind: 'tab', tabId: openTabs[0]!.id });
    expect(tabResult!.historyId).toBeUndefined();
    expect(historyResult).toMatchObject({ kind: 'history', historyId: history[0]!.id });
    expect(historyResult!.tabId).toBeUndefined();
  });

  it('returns nothing when nothing matches', () => {
    expect(searchTabsAndHistory(openTabs, history, 'zzz-nomatch')).toEqual([]);
  });
});

describe('clampSelection', () => {
  it('returns -1 for an empty result list', () => {
    expect(clampSelection(0, 0)).toBe(-1);
  });

  it('clamps a negative index up to 0', () => {
    expect(clampSelection(-1, 5)).toBe(0);
  });

  it('clamps an out-of-range index down to the last row', () => {
    expect(clampSelection(10, 3)).toBe(2);
  });

  it('leaves an in-range index untouched', () => {
    expect(clampSelection(1, 3)).toBe(1);
  });
});

describe('moveSelection', () => {
  it('moves forward and backward within range', () => {
    expect(moveSelection(0, 1, 3)).toBe(1);
    expect(moveSelection(1, -1, 3)).toBe(0);
  });

  it('wraps past the end back to the start', () => {
    expect(moveSelection(2, 1, 3)).toBe(0);
  });

  it('wraps past the start back to the end', () => {
    expect(moveSelection(0, -1, 3)).toBe(2);
  });

  it('returns -1 when there are no results to select', () => {
    expect(moveSelection(0, 1, 0)).toBe(-1);
  });
});
