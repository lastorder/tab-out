import { describe, expect, it, vi } from 'vitest';
import { SETTINGS_KEY, SettingsStore } from '@/config/store';
import { createMemoryStore, type KeyValueStore } from '@/platform/storage';
import { createDefaultSettings } from '@/config/defaults';
import { emptySettings } from '../helpers/factories';

describe('SettingsStore', () => {
  it('returns defaults when nothing has been saved', async () => {
    expect(await new SettingsStore(createMemoryStore()).load()).toEqual(createDefaultSettings());
  });

  it('round-trips saved settings', async () => {
    const store = new SettingsStore(createMemoryStore());
    const saved = await store.save(emptySettings({ pinnedSites: [{ url: 'https://a.com/' }] }));

    expect(saved.pinnedSites).toEqual([{ url: 'https://a.com/' }]);
    expect(await store.load()).toEqual(saved);
  });

  it('validates on the way in and repairs on the way out', async () => {
    // Bad input must never be persisted...
    const backing = createMemoryStore();
    await new SettingsStore(backing).save(
      emptySettings({ pinnedSites: [{ url: 'not a url' }, { url: 'good.com' }] }),
    );
    expect(await backing.get(SETTINGS_KEY)).toMatchObject({
      pinnedSites: [{ url: 'https://good.com/' }],
    });

    // ...and data already corrupt in storage must not break the new tab page.
    const corrupt = new SettingsStore(
      createMemoryStore({ [SETTINGS_KEY]: { pinnedSites: [{ url: '' }] } }),
    );
    expect((await corrupt.load()).pinnedSites).toEqual([]);
  });

  it('merges a partial update into what is already stored', async () => {
    const store = new SettingsStore(createMemoryStore());
    await store.save(
      emptySettings({
        pinnedSites: [{ url: 'https://a.com/' }],
        disposableRules: [{ hostname: 'x.com' }],
      }),
    );

    const patched = await store.patch({ pinnedSites: [{ url: 'https://b.com/' }] });
    expect(patched.pinnedSites).toEqual([{ url: 'https://b.com/' }]);
    expect(patched.disposableRules).toEqual([{ hostname: 'x.com' }]);
  });

  it('restores defaults on reset', async () => {
    const store = new SettingsStore(createMemoryStore());
    await store.save(emptySettings());
    expect(await store.reset()).toEqual(createDefaultSettings());
  });

  it('falls back to defaults when storage itself fails', async () => {
    const broken: KeyValueStore = {
      get: () => Promise.reject(new Error('storage exploded')),
      set: async () => {},
      onChanged: () => () => {},
    };
    expect(await new SettingsStore(broken).load()).toEqual(createDefaultSettings());
  });

  it('notifies on change, ignoring unrelated keys', async () => {
    const backing = createMemoryStore();
    const store = new SettingsStore(backing);
    const listener = vi.fn();
    store.onChanged(listener);

    await backing.set('something-else', 1);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(listener).not.toHaveBeenCalled();

    await store.save(emptySettings({ pinnedSites: [{ url: 'https://a.com/' }] }));
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());
    expect(listener.mock.calls[0]![0].pinnedSites).toEqual([{ url: 'https://a.com/' }]);
  });
});

describe('createMemoryStore', () => {
  it('isolates stored values from later caller mutation, like real storage does', async () => {
    // Real chrome.storage serialises across a process boundary; the fake has
    // to match that, or tests would pass while production broke.
    const store = createMemoryStore();
    const value = { list: [1, 2] };
    await store.set('k', value);
    value.list.push(3);

    expect(await store.get('k')).toEqual({ list: [1, 2] });
  });
});
