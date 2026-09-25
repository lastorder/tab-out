import { describe, expect, it } from 'vitest';
import {
  clampHistory,
  filterHistory,
  shouldRecordClosedTab,
  sortHistoryByRecency,
  upsertHistoryEntry,
} from '@/core/history';
import { emptySettings, historyEntry } from '../helpers/factories';

const at = (iso: string, url: string) => historyEntry(url, { closedAt: iso });

describe('sortHistoryByRecency', () => {
  it('orders newest-closed first', () => {
    const entries = [
      at('2026-04-01T00:00:00.000Z', 'https://a.com/'),
      at('2026-04-03T00:00:00.000Z', 'https://b.com/'),
      at('2026-04-02T00:00:00.000Z', 'https://c.com/'),
    ];
    expect(sortHistoryByRecency(entries).map((e) => e.url)).toEqual([
      'https://b.com/',
      'https://c.com/',
      'https://a.com/',
    ]);
  });
});

describe('upsertHistoryEntry', () => {
  it('replaces an earlier entry for the same URL instead of duplicating it', () => {
    const existing = [historyEntry('https://a.com/', { id: 'old', closedAt: '2026-04-01T00:00:00.000Z' })];
    const reclosed = historyEntry('https://a.com/', { id: 'new', closedAt: '2026-04-05T00:00:00.000Z' });

    const result = upsertHistoryEntry(existing, reclosed, 100);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('new');
  });

  it('puts the new entry first and drops the oldest beyond maxItems', () => {
    const existing = [
      at('2026-04-03T00:00:00.000Z', 'https://a.com/'),
      at('2026-04-02T00:00:00.000Z', 'https://b.com/'),
    ];
    const fresh = at('2026-04-04T00:00:00.000Z', 'https://c.com/');

    expect(upsertHistoryEntry(existing, fresh, 2).map((e) => e.url)).toEqual([
      'https://c.com/',
      'https://a.com/',
    ]);
  });
});

describe('clampHistory', () => {
  it('keeps the newest entries, and treats a non-positive limit as "keep nothing"', () => {
    const entries = [
      at('2026-04-01T00:00:00.000Z', 'https://old.com/'),
      at('2026-04-05T00:00:00.000Z', 'https://new.com/'),
    ];
    expect(clampHistory(entries, 1).map((e) => e.url)).toEqual(['https://new.com/']);
    expect(clampHistory(entries, 0)).toEqual([]);
    expect(clampHistory(entries, -5)).toEqual([]);
  });
});

describe('filterHistory', () => {
  const entries = [
    historyEntry('https://example.com/typescript', { title: 'TypeScript Handbook' }),
    historyEntry('https://other.com/rust', { title: 'Rust Book' }),
  ];

  it('matches title or URL, case-insensitively', () => {
    expect(filterHistory(entries, 'HANDBOOK')).toHaveLength(1);
    expect(filterHistory(entries, 'other.com')).toHaveLength(1);
  });

  it('shows everything until the query is worth filtering on', () => {
    expect(filterHistory(entries, '')).toHaveLength(2);
    expect(filterHistory(entries, 'r')).toHaveLength(2);
  });

  it('narrows a space-separated query, requiring every term', () => {
    const entries = [
      historyEntry('https://docs.example.com/tab-out', { title: 'Tab Out Guide' }),
      historyEntry('https://docs.example.com/other', { title: 'Other Docs' }),
      historyEntry('https://blog.example.com/tab-out', { title: 'Tab Out Launch' }),
    ];
    // Only the first matches both "tab" (title) and "docs" (URL).
    expect(filterHistory(entries, 'tab docs').map((e) => e.title)).toEqual(['Tab Out Guide']);
  });
});

describe('shouldRecordClosedTab', () => {
  const rules = [{ pattern: 'https://github.com/' }];

  it('skips a disposable URL while disposable rules are enabled', () => {
    expect(
      shouldRecordClosedTab('https://github.com/', emptySettings({ disposableRules: rules })),
    ).toBe(false);
  });

  it('records the same URL once disposable rules are switched off', () => {
    expect(
      shouldRecordClosedTab(
        'https://github.com/',
        emptySettings({ disposableEnabled: false, disposableRules: rules }),
      ),
    ).toBe(true);
  });

  it('records a URL the rules do not match', () => {
    expect(
      shouldRecordClosedTab('https://github.com/issue/1', emptySettings({ disposableRules: rules })),
    ).toBe(true);
  });
});
