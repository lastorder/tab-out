import { describe, expect, it } from 'vitest';
import { TabSnapshotCache } from '@/services/tab-snapshot-cache';
import { createMemoryStore } from '@/platform/storage';

describe('TabSnapshotCache', () => {
  it('round-trips a recorded snapshot', async () => {
    const cache = new TabSnapshotCache(createMemoryStore());
    await cache.record(7, { url: 'https://a.com/', title: 'A' });

    expect(await cache.consume(7)).toEqual({ url: 'https://a.com/', title: 'A' });
  });

  it('consuming removes the entry, so a second consume returns null', async () => {
    const cache = new TabSnapshotCache(createMemoryStore());
    await cache.record(7, { url: 'https://a.com/', title: 'A' });

    await cache.consume(7);
    expect(await cache.consume(7)).toBeNull();
  });

  it('returns null for a tab id that was never recorded', async () => {
    const cache = new TabSnapshotCache(createMemoryStore());
    expect(await cache.consume(999)).toBeNull();
  });

  it('keeps snapshots for other tabs independent', async () => {
    const cache = new TabSnapshotCache(createMemoryStore());
    await cache.record(1, { url: 'https://a.com/', title: 'A' });
    await cache.record(2, { url: 'https://b.com/', title: 'B' });

    expect(await cache.consume(1)).toEqual({ url: 'https://a.com/', title: 'A' });
    expect(await cache.consume(2)).toEqual({ url: 'https://b.com/', title: 'B' });
  });

  it('record() refreshes an existing snapshot rather than duplicating it', async () => {
    const cache = new TabSnapshotCache(createMemoryStore());
    await cache.record(7, { url: 'https://old.com/', title: 'Old' });
    await cache.record(7, { url: 'https://new.com/', title: 'New' });

    expect(await cache.consume(7)).toEqual({ url: 'https://new.com/', title: 'New' });
  });

  it('tolerates a corrupt stored value', async () => {
    const cache = new TabSnapshotCache(createMemoryStore({ tabSnapshots: 'not an object' }));
    expect(await cache.consume(1)).toBeNull();
  });
});
