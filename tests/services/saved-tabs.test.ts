import { beforeEach, describe, expect, it } from 'vitest';
import { filterSavedTabs, SAVED_TABS_KEY, SavedTabsService } from '@/services/saved-tabs';
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

  it('saves a tab onto the active list', async () => {
    const entry = await ctx.service.save({ url: 'https://a.com/', title: 'A' });

    expect(entry).toMatchObject({
      id: 'id-1',
      url: 'https://a.com/',
      title: 'A',
      completed: false,
      dismissed: false,
      savedAt: '2026-04-04T12:00:00.000Z',
    });

    const { active, archived } = await ctx.service.list();
    expect(active).toHaveLength(1);
    expect(archived).toHaveLength(0);
  });

  it('falls back to the URL when no title is given', async () => {
    const entry = await ctx.service.save({ url: 'https://a.com/' });
    expect(entry.title).toBe('https://a.com/');
  });

  it('moves a completed item into the archive and stamps completedAt', async () => {
    await ctx.service.save({ url: 'https://a.com/', title: 'A' });
    ctx.advanceMinutes(30);

    expect(await ctx.service.complete('id-1')).toBe(true);

    const { active, archived } = await ctx.service.list();
    expect(active).toHaveLength(0);
    expect(archived).toHaveLength(1);
    expect(archived[0]!.completedAt).toBe('2026-04-04T12:30:00.000Z');
  });

  it('hides a dismissed item from both lists', async () => {
    await ctx.service.save({ url: 'https://a.com/', title: 'A' });
    expect(await ctx.service.dismiss('id-1')).toBe(true);

    const { active, archived } = await ctx.service.list();
    expect(active).toHaveLength(0);
    expect(archived).toHaveLength(0);
  });

  it('keeps the dismissed record in storage rather than deleting it', async () => {
    await ctx.service.save({ url: 'https://a.com/' });
    await ctx.service.dismiss('id-1');

    const raw = (await ctx.store.get(SAVED_TABS_KEY)) as SavedTab[];
    expect(raw).toHaveLength(1);
    expect(raw[0]!.dismissed).toBe(true);
  });

  it('reports false for an unknown id', async () => {
    expect(await ctx.service.complete('missing')).toBe(false);
    expect(await ctx.service.dismiss('missing')).toBe(false);
  });

  it('preserves insertion order across several saves', async () => {
    await ctx.service.save({ url: 'https://a.com/', title: 'A' });
    await ctx.service.save({ url: 'https://b.com/', title: 'B' });

    const { active } = await ctx.service.list();
    expect(active.map((t) => t.title)).toEqual(['A', 'B']);
  });

  it('tolerates a corrupt stored value', async () => {
    const ctx2 = makeService(createMemoryStore({ [SAVED_TABS_KEY]: 'not an array' }));
    expect(await ctx2.service.list()).toEqual({ active: [], archived: [] });
  });

  it('skips malformed records inside a valid array', async () => {
    const ctx2 = makeService(
      createMemoryStore({
        [SAVED_TABS_KEY]: [{ id: 'ok', url: 'https://a.com/' }, null, { nope: true }],
      }),
    );
    const { active } = await ctx2.service.list();
    expect(active).toHaveLength(1);
  });

  it('searches the archive', async () => {
    await ctx.service.save({ url: 'https://a.com/', title: 'TypeScript guide' });
    await ctx.service.save({ url: 'https://b.com/', title: 'Rust guide' });
    await ctx.service.complete('id-1');
    await ctx.service.complete('id-2');

    expect(await ctx.service.searchArchive('typescript')).toHaveLength(1);
  });
});

describe('filterSavedTabs', () => {
  const items: SavedTab[] = [
    {
      id: '1',
      url: 'https://example.com/typescript',
      title: 'TypeScript Handbook',
      savedAt: '',
      completed: true,
      dismissed: false,
    },
    {
      id: '2',
      url: 'https://other.com/rust',
      title: 'Rust Book',
      savedAt: '',
      completed: true,
      dismissed: false,
    },
  ];

  it('returns everything for a query shorter than two characters', () => {
    expect(filterSavedTabs(items, '')).toHaveLength(2);
    expect(filterSavedTabs(items, 'r')).toHaveLength(2);
  });

  it('matches titles case-insensitively', () => {
    expect(filterSavedTabs(items, 'HANDBOOK')).toHaveLength(1);
  });

  it('matches URLs too', () => {
    expect(filterSavedTabs(items, 'other.com')).toHaveLength(1);
  });

  it('returns nothing when there is no match', () => {
    expect(filterSavedTabs(items, 'python')).toHaveLength(0);
  });
});
