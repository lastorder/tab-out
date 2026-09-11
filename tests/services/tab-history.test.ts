import { describe, expect, it } from 'vitest';
import { HISTORY_KEY, TabHistoryService } from '@/services/tab-history';
import { createMemoryStore } from '@/platform/storage';
import type { KeyValueStore } from '@/platform/storage';
import type { ClosedTabEntry } from '@/types';

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
  it('records a closed tab', async () => {
    const ctx = makeService();
    const entry = await ctx.service.record({ url: 'https://a.com/', title: 'A' }, 100);

    expect(entry).toMatchObject({
      id: 'hist-1',
      url: 'https://a.com/',
      title: 'A',
      closedAt: '2026-04-04T12:00:00.000Z',
    });
    expect(await ctx.service.list()).toHaveLength(1);
  });

  it('falls back to the URL when no title is given', async () => {
    const ctx = makeService();
    const entry = await ctx.service.record({ url: 'https://a.com/' }, 100);
    expect(entry.title).toBe('https://a.com/');
  });

  it('replaces an earlier entry for the same URL instead of duplicating it', async () => {
    const ctx = makeService();
    await ctx.service.record({ url: 'https://a.com/', title: 'First close' }, 100);
    ctx.advanceMinutes(10);
    await ctx.service.record({ url: 'https://a.com/', title: 'Second close' }, 100);

    const list = await ctx.service.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.title).toBe('Second close');
    expect(list[0]!.closedAt).toBe('2026-04-04T12:10:00.000Z');
  });

  it('trims to the configured limit, dropping the oldest', async () => {
    const ctx = makeService();
    await ctx.service.record({ url: 'https://a.com/' }, 2);
    ctx.advanceMinutes(1);
    await ctx.service.record({ url: 'https://b.com/' }, 2);
    ctx.advanceMinutes(1);
    await ctx.service.record({ url: 'https://c.com/' }, 2);

    const list = await ctx.service.list();
    expect(list.map((e) => e.url)).toEqual(['https://c.com/', 'https://b.com/']);
  });
});

describe('TabHistoryService.list', () => {
  it('returns entries newest-first', async () => {
    const ctx = makeService();
    await ctx.service.record({ url: 'https://a.com/' }, 100);
    ctx.advanceMinutes(5);
    await ctx.service.record({ url: 'https://b.com/' }, 100);

    expect((await ctx.service.list()).map((e) => e.url)).toEqual([
      'https://b.com/',
      'https://a.com/',
    ]);
  });

  it('excludes any URL currently open', async () => {
    const ctx = makeService();
    await ctx.service.record({ url: 'https://a.com/' }, 100);
    await ctx.service.record({ url: 'https://b.com/' }, 100);

    const list = await ctx.service.list(new Set(['https://a.com/']));
    expect(list.map((e) => e.url)).toEqual(['https://b.com/']);
  });

  it('tolerates a corrupt stored value', async () => {
    const ctx = makeService(createMemoryStore({ [HISTORY_KEY]: 'not an array' }));
    expect(await ctx.service.list()).toEqual([]);
  });

  it('skips malformed records inside a valid array', async () => {
    const ctx = makeService(
      createMemoryStore({
        [HISTORY_KEY]: [
          { id: 'ok', url: 'https://a.com/', title: 'A', closedAt: '2026-04-04T00:00:00.000Z' },
          null,
          { nope: true },
        ],
      }),
    );
    expect(await ctx.service.list()).toHaveLength(1);
  });
});

describe('TabHistoryService removal and clearing', () => {
  it('removes every entry for a URL', async () => {
    const ctx = makeService();
    await ctx.service.record({ url: 'https://a.com/' }, 100);
    await ctx.service.removeByUrl('https://a.com/');
    expect(await ctx.service.list()).toEqual([]);
  });

  it('removes one entry by id and reports whether it existed', async () => {
    const ctx = makeService();
    await ctx.service.record({ url: 'https://a.com/' }, 100);

    expect(await ctx.service.removeById('hist-1')).toBe(true);
    expect(await ctx.service.removeById('hist-1')).toBe(false);
    expect(await ctx.service.list()).toEqual([]);
  });

  it('clears the whole list', async () => {
    const ctx = makeService();
    await ctx.service.record({ url: 'https://a.com/' }, 100);
    await ctx.service.record({ url: 'https://b.com/' }, 100);
    await ctx.service.clear();
    expect(await ctx.service.list()).toEqual([]);
  });

  it('trims down to a newly-lowered limit immediately', async () => {
    const ctx = makeService();
    await ctx.service.record({ url: 'https://a.com/' }, 100);
    ctx.advanceMinutes(1);
    await ctx.service.record({ url: 'https://b.com/' }, 100);
    ctx.advanceMinutes(1);
    await ctx.service.record({ url: 'https://c.com/' }, 100);

    await ctx.service.trimTo(1);

    const raw = (await ctx.store.get(HISTORY_KEY)) as ClosedTabEntry[];
    expect(raw).toHaveLength(1);
    expect(raw[0]!.url).toBe('https://c.com/');
  });
});
