import { describe, expect, it } from 'vitest';
import {
  clampHistory,
  dedupeAgainstOpenUrls,
  filterHistory,
  removeHistoryById,
  removeHistoryByUrl,
  sortHistoryByRecency,
  upsertHistoryEntry,
} from '@/core/history';
import { historyEntry } from '../helpers/factories';

describe('sortHistoryByRecency', () => {
  it('orders newest-closed first', () => {
    const a = historyEntry('https://a.com/', { closedAt: '2026-04-01T00:00:00.000Z' });
    const b = historyEntry('https://b.com/', { closedAt: '2026-04-03T00:00:00.000Z' });
    const c = historyEntry('https://c.com/', { closedAt: '2026-04-02T00:00:00.000Z' });

    expect(sortHistoryByRecency([a, b, c]).map((e) => e.url)).toEqual([
      'https://b.com/',
      'https://c.com/',
      'https://a.com/',
    ]);
  });
});

describe('upsertHistoryEntry', () => {
  it('inserts a new entry at the front', () => {
    const existing = [historyEntry('https://old.com/', { closedAt: '2026-04-01T00:00:00.000Z' })];
    const fresh = historyEntry('https://new.com/', { closedAt: '2026-04-02T00:00:00.000Z' });

    expect(upsertHistoryEntry(existing, fresh, 100).map((e) => e.url)).toEqual([
      'https://new.com/',
      'https://old.com/',
    ]);
  });

  it('replaces an earlier entry for the same URL rather than duplicating it', () => {
    const existing = [
      historyEntry('https://a.com/', { id: 'old', closedAt: '2026-04-01T00:00:00.000Z' }),
    ];
    const reclosed = historyEntry('https://a.com/', {
      id: 'new',
      closedAt: '2026-04-05T00:00:00.000Z',
    });

    const result = upsertHistoryEntry(existing, reclosed, 100);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('new');
  });

  it('trims to maxItems, dropping the oldest', () => {
    const existing = [
      historyEntry('https://a.com/', { closedAt: '2026-04-03T00:00:00.000Z' }),
      historyEntry('https://b.com/', { closedAt: '2026-04-02T00:00:00.000Z' }),
    ];
    const fresh = historyEntry('https://c.com/', { closedAt: '2026-04-04T00:00:00.000Z' });

    const result = upsertHistoryEntry(existing, fresh, 2);
    expect(result.map((e) => e.url)).toEqual(['https://c.com/', 'https://a.com/']);
  });

  it('treats a maxItems of 0 as "keep nothing"', () => {
    expect(upsertHistoryEntry([], historyEntry('https://a.com/'), 0)).toEqual([]);
  });
});

describe('removeHistoryByUrl / removeHistoryById', () => {
  const entries = [
    historyEntry('https://a.com/', { id: '1' }),
    historyEntry('https://b.com/', { id: '2' }),
  ];

  it('removes every entry matching a URL', () => {
    expect(removeHistoryByUrl(entries, 'https://a.com/').map((e) => e.id)).toEqual(['2']);
  });

  it('removes one entry by id', () => {
    expect(removeHistoryById(entries, '2').map((e) => e.id)).toEqual(['1']);
  });

  it('is a no-op when nothing matches', () => {
    expect(removeHistoryByUrl(entries, 'https://gone.com/')).toHaveLength(2);
    expect(removeHistoryById(entries, 'missing')).toHaveLength(2);
  });
});

describe('dedupeAgainstOpenUrls', () => {
  it('filters out entries whose URL is currently open', () => {
    const entries = [historyEntry('https://a.com/'), historyEntry('https://b.com/')];
    const result = dedupeAgainstOpenUrls(entries, new Set(['https://a.com/']));
    expect(result.map((e) => e.url)).toEqual(['https://b.com/']);
  });

  it('returns everything unchanged when nothing is open', () => {
    const entries = [historyEntry('https://a.com/')];
    expect(dedupeAgainstOpenUrls(entries, new Set())).toEqual(entries);
  });
});

describe('clampHistory', () => {
  it('sorts then trims to maxItems', () => {
    const entries = [
      historyEntry('https://old.com/', { closedAt: '2026-04-01T00:00:00.000Z' }),
      historyEntry('https://new.com/', { closedAt: '2026-04-05T00:00:00.000Z' }),
    ];
    expect(clampHistory(entries, 1).map((e) => e.url)).toEqual(['https://new.com/']);
  });

  it('clamps a negative limit to zero rather than throwing', () => {
    expect(clampHistory([historyEntry('https://a.com/')], -5)).toEqual([]);
  });
});

describe('filterHistory', () => {
  const entries = [
    historyEntry('https://example.com/typescript', { title: 'TypeScript Handbook' }),
    historyEntry('https://other.com/rust', { title: 'Rust Book' }),
  ];

  it('returns everything for a query shorter than two characters', () => {
    expect(filterHistory(entries, '')).toHaveLength(2);
    expect(filterHistory(entries, 'r')).toHaveLength(2);
  });

  it('matches titles case-insensitively', () => {
    expect(filterHistory(entries, 'HANDBOOK')).toHaveLength(1);
  });

  it('matches URLs too', () => {
    expect(filterHistory(entries, 'other.com')).toHaveLength(1);
  });
});
