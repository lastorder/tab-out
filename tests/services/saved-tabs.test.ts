import { beforeEach, describe, expect, it } from 'vitest';
import { SAVED_TABS_KEY, SavedTabsService } from '@/services/saved-tabs';
import { createMemoryStore, type KeyValueStore } from '@/platform/storage';
import type { SavedTab } from '@/types';

/** Deterministic ids and clock so assertions are exact. */
function makeService(store: KeyValueStore = createMemoryStore()) {
  let counter = 0;
  let clock = Date.parse('2026-04-04T12:00:00.000Z');
  const service = new SavedTabsService(store, {
    makeId: () => `id-${++counter}`,
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

describe('SavedTabsService', () => {
  let ctx: ReturnType<typeof makeService>;
  beforeEach(() => {
    ctx = makeService();
  });

  it('saves onto the active list, defaulting the title to the URL', async () => {
    const entry = await ctx.service.save({ url: 'https://a.com/' });

    expect(entry).toMatchObject({
      id: 'id-1',
      url: 'https://a.com/',
      title: 'https://a.com/',
      completed: false,
      dismissed: false,
      savedAt: '2026-04-04T12:00:00.000Z',
    });
    expect(await ctx.service.list()).toMatchObject({ active: [{ id: 'id-1' }], archived: [] });
  });

  it('moves a completed item to the archive, stamping when', async () => {
    await ctx.service.save({ url: 'https://a.com/', title: 'A' });
    ctx.advanceMinutes(30);

    expect(await ctx.service.complete('id-1')).toBe(true);

    const { active, archived } = await ctx.service.list();
    expect(active).toHaveLength(0);
    expect(archived[0]).toMatchObject({ completedAt: '2026-04-04T12:30:00.000Z' });
  });

  it('hides a dismissed item from both lists but keeps the record', async () => {
    await ctx.service.save({ url: 'https://a.com/' });
    expect(await ctx.service.dismiss('id-1')).toBe(true);

    expect(await ctx.service.list()).toEqual({ active: [], archived: [] });
    // Soft delete: a mis-click must not destroy anything.
    expect((await ctx.store.get(SAVED_TABS_KEY)) as SavedTab[]).toHaveLength(1);
  });

  it('reports false for an unknown id', async () => {
    expect(await ctx.service.complete('missing')).toBe(false);
    expect(await ctx.service.dismiss('missing')).toBe(false);
  });

  it('preserves insertion order', async () => {
    await ctx.service.save({ url: 'https://a.com/', title: 'A' });
    await ctx.service.save({ url: 'https://b.com/', title: 'B' });
    const { active } = await ctx.service.list();
    expect(active.map((t) => t.title)).toEqual(['A', 'B']);
  });

  it('tolerates corrupt or malformed stored data', async () => {
    const corrupt = makeService(createMemoryStore({ [SAVED_TABS_KEY]: 'not an array' }));
    expect(await corrupt.service.list()).toEqual({ active: [], archived: [] });

    const partial = makeService(
      createMemoryStore({
        [SAVED_TABS_KEY]: [{ id: 'ok', url: 'https://a.com/' }, null, { nope: true }],
      }),
    );
    expect((await partial.service.list()).active).toHaveLength(1);
  });
});

describe('SavedTabsService.searchArchive', () => {
  it('matches title or URL, and shows everything for a too-short query', async () => {
    const ctx = makeService();
    await ctx.service.save({ url: 'https://a.com/', title: 'TypeScript guide' });
    await ctx.service.save({ url: 'https://other.com/', title: 'Rust guide' });
    await ctx.service.complete('id-1');
    await ctx.service.complete('id-2');

    expect(await ctx.service.searchArchive('typescript')).toHaveLength(1);
    expect(await ctx.service.searchArchive('other.com')).toHaveLength(1);
    expect(await ctx.service.searchArchive('python')).toHaveLength(0);
    expect(await ctx.service.searchArchive('r')).toHaveLength(2);
  });

  it('narrows a space-separated query, requiring every term', async () => {
    const ctx = makeService();
    await ctx.service.save({ url: 'https://docs.example.com/guide', title: 'TypeScript guide' });
    await ctx.service.save({ url: 'https://other.com/', title: 'Rust guide' });
    await ctx.service.complete('id-1');
    await ctx.service.complete('id-2');

    // "typescript" hits the first title, "docs" its URL; both must match.
    expect(await ctx.service.searchArchive('typescript docs')).toHaveLength(1);
    expect(await ctx.service.searchArchive('typescript rust')).toHaveLength(0);
  });
});
