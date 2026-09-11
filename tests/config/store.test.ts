import { describe, expect, it, vi } from 'vitest';
import { SETTINGS_KEY, SettingsStore } from '@/config/store';
import { createMemoryStore, type KeyValueStore } from '@/platform/storage';
import { createDefaultSettings } from '@/config/defaults';

describe('SettingsStore', () => {
  it('returns defaults when nothing has been saved', async () => {
    const store = new SettingsStore(createMemoryStore());
    expect(await store.load()).toEqual(createDefaultSettings());
  });

  it('round-trips saved settings', async () => {
    const store = new SettingsStore(createMemoryStore());
    const saved = await store.save({
      version: 1,
      pinnedSites: [{ url: 'https://a.com/' }],
      landingPatterns: [],
      customGroups: [],
    });

    expect(saved.pinnedSites).toEqual([{ url: 'https://a.com/' }]);
    expect(await store.load()).toEqual(saved);
  });

  it('repairs invalid data already sitting in storage', async () => {
    const backing = createMemoryStore({ [SETTINGS_KEY]: { pinnedSites: [{ url: '' }] } });
    const store = new SettingsStore(backing);

    const loaded = await store.load();
    expect(loaded.pinnedSites).toEqual([]);
    expect(loaded.version).toBe(createDefaultSettings().version);
  });

  it('validates on the way in, so bad input is never persisted', async () => {
    const backing = createMemoryStore();
    const store = new SettingsStore(backing);

    await store.save({
      version: 1,
      pinnedSites: [{ url: 'not a url' }, { url: 'good.com' }],
      landingPatterns: [],
      customGroups: [],
    });

    expect(await backing.get(SETTINGS_KEY)).toMatchObject({
      pinnedSites: [{ url: 'https://good.com/' }],
    });
  });

  it('merges a partial update into the stored settings', async () => {
    const store = new SettingsStore(createMemoryStore());
    await store.save({
      version: 1,
      pinnedSites: [{ url: 'https://a.com/' }],
      landingPatterns: [{ hostname: 'x.com' }],
      customGroups: [],
    });

    const patched = await store.patch({ pinnedSites: [{ url: 'https://b.com/' }] });
    expect(patched.pinnedSites).toEqual([{ url: 'https://b.com/' }]);
    expect(patched.landingPatterns).toEqual([{ hostname: 'x.com' }]);
  });

  it('restores defaults on reset', async () => {
    const store = new SettingsStore(createMemoryStore());
    await store.save({ version: 1, pinnedSites: [], landingPatterns: [], customGroups: [] });
    expect(await store.reset()).toEqual(createDefaultSettings());
  });

  it('falls back to defaults when storage itself fails', async () => {
    const broken: KeyValueStore = {
      get: () => Promise.reject(new Error('storage exploded')),
      set: async () => {},
      remove: async () => {},
      onChanged: () => () => {},
    };
    expect(await new SettingsStore(broken).load()).toEqual(createDefaultSettings());
  });

  it('notifies listeners when settings change elsewhere', async () => {
    const backing = createMemoryStore();
    const store = new SettingsStore(backing);
    const listener = vi.fn();
    store.onChanged(listener);

    await store.save({
      version: 1,
      pinnedSites: [{ url: 'https://a.com/' }],
      landingPatterns: [],
      customGroups: [],
    });
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());

    expect(listener.mock.calls[0]![0].pinnedSites).toEqual([{ url: 'https://a.com/' }]);
  });

  it('ignores changes to unrelated keys', async () => {
    const backing = createMemoryStore();
    const store = new SettingsStore(backing);
    const listener = vi.fn();
    store.onChanged(listener);

    await backing.set('something-else', 1);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('createMemoryStore', () => {
  it('isolates stored values from later caller mutation', async () => {
    const store = createMemoryStore();
    const value = { list: [1, 2] };
    await store.set('k', value);
    value.list.push(3);

    expect(await store.get('k')).toEqual({ list: [1, 2] });
  });

  it('removes keys', async () => {
    const store = createMemoryStore({ k: 1 });
    await store.remove('k');
    expect(await store.get('k')).toBeUndefined();
  });

  it('stops notifying after unsubscribe', async () => {
    const store = createMemoryStore();
    const listener = vi.fn();
    const off = store.onChanged(listener);
    off();
    await store.set('k', 1);
    expect(listener).not.toHaveBeenCalled();
  });
});
