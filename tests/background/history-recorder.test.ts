import { describe, expect, it } from 'vitest';
import { recordTabRemoved, trackTabActivity } from '@/background/history-recorder';
import { TabHistoryService } from '@/services/tab-history';
import { TabSnapshotCache } from '@/services/tab-snapshot-cache';
import { createMemoryStore } from '@/platform/storage';

function makeDeps() {
  const historyService = new TabHistoryService(createMemoryStore());
  const snapshotCache = new TabSnapshotCache(createMemoryStore());
  return { historyService, snapshotCache };
}

describe('trackTabActivity', () => {
  it('snapshots the tab so it can be recorded when it later closes', async () => {
    const deps = makeDeps();
    await trackTabActivity({ id: 7, url: 'https://a.com/', title: 'A' }, deps);

    await recordTabRemoved(7, { ...deps, getMaxHistoryItems: async () => 100 });
    expect(await deps.historyService.list()).toMatchObject([{ url: 'https://a.com/' }]);
  });

  it('purges any history entry for a URL that has been reopened', async () => {
    const deps = makeDeps();
    await deps.historyService.record({ url: 'https://a.com/', title: 'A' }, 100);

    await trackTabActivity({ id: 9, url: 'https://a.com/', title: 'A' }, deps);

    expect(await deps.historyService.list()).toEqual([]);
  });

  it('does not purge history for browser-internal pages', async () => {
    const deps = makeDeps();
    await deps.historyService.record({ url: 'https://a.com/', title: 'A' }, 100);

    // A blank/loading tab reports an internal or empty URL; it must not
    // touch unrelated history entries.
    await trackTabActivity({ id: 1, url: 'chrome://newtab/', title: '' }, deps);
    await trackTabActivity({ id: 2, url: '', title: '' }, deps);

    expect(await deps.historyService.list()).toHaveLength(1);
  });
});

describe('recordTabRemoved', () => {
  it('records the tab it had a snapshot for', async () => {
    const deps = makeDeps();
    await deps.snapshotCache.record(5, { url: 'https://a.com/', title: 'A' });

    await recordTabRemoved(5, { ...deps, getMaxHistoryItems: async () => 100 });

    expect(await deps.historyService.list()).toMatchObject([{ url: 'https://a.com/', title: 'A' }]);
  });

  it('does nothing for a tab id with no snapshot', async () => {
    const deps = makeDeps();
    await recordTabRemoved(999, { ...deps, getMaxHistoryItems: async () => 100 });
    expect(await deps.historyService.list()).toEqual([]);
  });

  it('does not record browser-internal pages', async () => {
    const deps = makeDeps();
    await deps.snapshotCache.record(5, { url: 'chrome://newtab/', title: '' });

    await recordTabRemoved(5, { ...deps, getMaxHistoryItems: async () => 100 });

    expect(await deps.historyService.list()).toEqual([]);
  });

  it('consumes the snapshot even when the page was internal, so it cannot leak to a later tab id', async () => {
    const deps = makeDeps();
    await deps.snapshotCache.record(5, { url: 'chrome://newtab/', title: '' });
    await recordTabRemoved(5, { ...deps, getMaxHistoryItems: async () => 100 });

    expect(await deps.snapshotCache.consume(5)).toBeNull();
  });

  it('respects the injected history limit', async () => {
    const deps = makeDeps();
    await deps.snapshotCache.record(1, { url: 'https://a.com/', title: 'A' });
    await recordTabRemoved(1, { ...deps, getMaxHistoryItems: async () => 100 });
    await deps.snapshotCache.record(2, { url: 'https://b.com/', title: 'B' });
    await recordTabRemoved(2, { ...deps, getMaxHistoryItems: async () => 1 });

    const list = await deps.historyService.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.url).toBe('https://b.com/');
  });
});
