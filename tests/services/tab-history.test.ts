import { describe, expect, it, vi } from 'vitest';
import { HISTORY_KEY, TabHistoryService } from '@/services/tab-history';
import { createMemoryStore } from '@/platform/storage';
import type { KeyValueStore } from '@/platform/storage';
import type { ClosedTabEntry } from '@/types';

/** Deterministic ids and clock so assertions are exact. */
function makeService(store: KeyValueStore = createMemoryStore()) {
  let counter = 0;
  let clock = Date.parse('2026-04-04T12:00:00.000Z');
  const service = new TabHistoryService(store, {
    makeId: () => `hist-${++counter}`,
    now: () => new Date(clock),
  });
  return {
    service,
    store,
    advanceMinutes(minutes: number) {
      clock += minutes * 60_000;
    },
  };
}

describe('TabHistoryService.record', () => {
  it('records a closure, defaulting the title to the URL', async () => {
    const { service } = makeService();
    const entry = await service.record({ url: 'https://a.com/' }, 100);

    expect(entry).toMatchObject({
      id: 'hist-1',
      url: 'https://a.com/',
      title: 'https://a.com/',
      closedAt: '2026-04-04T12:00:00.000Z',
    });
  });

  it('updates one entry rather than duplicating when the same page closes twice', async () => {
    const ctx = makeService();
    await ctx.service.record({ url: 'https://a.com/', title: 'First close' }, 100);
    ctx.advanceMinutes(10);
    await ctx.service.record({ url: 'https://a.com/', title: 'Second close' }, 100);

    const list = await ctx.service.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ title: 'Second close', closedAt: '2026-04-04T12:10:00.000Z' });
  });

  it('trims to the configured limit, dropping the oldest', async () => {
    const ctx = makeService();
    for (const url of ['https://a.com/', 'https://b.com/', 'https://c.com/']) {
      await ctx.service.record({ url }, 2);
      ctx.advanceMinutes(1);
    }
    expect((await ctx.service.list()).map((e) => e.url)).toEqual([
      'https://c.com/',
      'https://b.com/',
    ]);
  });
});

describe('TabHistoryService.list', () => {
  it('returns entries newest-first, excluding any URL currently open', async () => {
    const ctx = makeService();
    await ctx.service.record({ url: 'https://a.com/' }, 100);
    ctx.advanceMinutes(5);
    await ctx.service.record({ url: 'https://b.com/' }, 100);

    expect((await ctx.service.list()).map((e) => e.url)).toEqual([
      'https://b.com/',
      'https://a.com/',
    ]);
    expect((await ctx.service.list(new Set(['https://b.com/']))).map((e) => e.url)).toEqual([
      'https://a.com/',
    ]);
  });

  it('survives a corrupt stored value and skips malformed records', async () => {
    expect(await makeService(createMemoryStore({ [HISTORY_KEY]: 'nope' })).service.list()).toEqual([]);

    const partial = makeService(
      createMemoryStore({
        [HISTORY_KEY]: [
          { id: 'ok', url: 'https://a.com/', title: 'A', closedAt: '2026-04-04T00:00:00.000Z' },
          null,
          { nope: true },
        ],
      }),
    );
    expect(await partial.service.list()).toHaveLength(1);
  });
});

describe('TabHistoryService removal', () => {
  it('removes by URL, by id, and wholesale', async () => {
    const ctx = makeService();
    await ctx.service.record({ url: 'https://a.com/' }, 100);
    await ctx.service.removeByUrl('https://a.com/');
    expect(await ctx.service.list()).toEqual([]);

    await ctx.service.record({ url: 'https://b.com/' }, 100);
    expect(await ctx.service.removeById('hist-2')).toBe(true);
    expect(await ctx.service.removeById('hist-2')).toBe(false);

    await ctx.service.record({ url: 'https://c.com/' }, 100);
    await ctx.service.clear();
    expect(await ctx.service.list()).toEqual([]);
  });

  it('trims down to a newly-lowered limit immediately', async () => {
    const ctx = makeService();
    for (const url of ['https://a.com/', 'https://b.com/', 'https://c.com/']) {
      await ctx.service.record({ url }, 100);
      ctx.advanceMinutes(1);
    }

    await ctx.service.trimTo(1);

    const raw = (await ctx.store.get(HISTORY_KEY)) as ClosedTabEntry[];
    expect(raw).toHaveLength(1);
    expect(raw[0]!.url).toBe('https://c.com/');
  });
});

describe('TabHistoryService.onChanged', () => {
  // This is what lets the dashboard repaint the moment the *background
  // worker* records a closure, rather than waiting for a refresh.
  it('fires for writes and stops after unsubscribe, ignoring unrelated keys', async () => {
    const ctx = makeService();
    const listener = vi.fn();
    const off = ctx.service.onChanged(listener);

    await ctx.service.record({ url: 'https://a.com/' }, 100);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1));

    await ctx.store.set('something-else', 1);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(listener).toHaveBeenCalledTimes(1);

    off();
    await ctx.service.record({ url: 'https://b.com/' }, 100);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
