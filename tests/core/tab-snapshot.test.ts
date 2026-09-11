import { describe, expect, it } from 'vitest';
import { removeSnapshot, updateSnapshot } from '@/core/tab-snapshot';

describe('updateSnapshot', () => {
  it('adds a new entry', () => {
    const result = updateSnapshot({}, 7, { url: 'https://a.com/', title: 'A' });
    expect(result).toEqual({ '7': { url: 'https://a.com/', title: 'A' } });
  });

  it('overwrites an existing entry for the same tab id', () => {
    const map = { '7': { url: 'https://old.com/', title: 'Old' } };
    const result = updateSnapshot(map, 7, { url: 'https://new.com/', title: 'New' });
    expect(result).toEqual({ '7': { url: 'https://new.com/', title: 'New' } });
  });

  it('does not mutate the input map', () => {
    const map = {};
    updateSnapshot(map, 1, { url: 'https://a.com/', title: 'A' });
    expect(map).toEqual({});
  });

  it('keeps other tabs untouched', () => {
    const map = { '1': { url: 'https://a.com/', title: 'A' } };
    const result = updateSnapshot(map, 2, { url: 'https://b.com/', title: 'B' });
    expect(result['1']).toEqual({ url: 'https://a.com/', title: 'A' });
  });
});

describe('removeSnapshot', () => {
  it('removes and returns the matching entry', () => {
    const map = { '7': { url: 'https://a.com/', title: 'A' } };
    const { snapshots, removed } = removeSnapshot(map, 7);
    expect(removed).toEqual({ url: 'https://a.com/', title: 'A' });
    expect(snapshots).toEqual({});
  });

  it('leaves other entries in place', () => {
    const map = {
      '1': { url: 'https://a.com/', title: 'A' },
      '2': { url: 'https://b.com/', title: 'B' },
    };
    const { snapshots } = removeSnapshot(map, 1);
    expect(snapshots).toEqual({ '2': { url: 'https://b.com/', title: 'B' } });
  });

  it('returns no `removed` for an unknown tab id, and leaves the map untouched', () => {
    const map = { '1': { url: 'https://a.com/', title: 'A' } };
    const { snapshots, removed } = removeSnapshot(map, 99);
    expect(removed).toBeUndefined();
    expect(snapshots).toEqual(map);
  });

  it('does not mutate the input map', () => {
    const map = { '7': { url: 'https://a.com/', title: 'A' } };
    removeSnapshot(map, 7);
    expect(map).toEqual({ '7': { url: 'https://a.com/', title: 'A' } });
  });
});
