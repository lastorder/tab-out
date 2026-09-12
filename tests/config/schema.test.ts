import { describe, expect, it } from 'vitest';
import { migrateSettings, normalizeSettings, parseSettingsJson, stringifySettings } from '@/config/schema';
import { createDefaultSettings, SETTINGS_VERSION } from '@/config/defaults';

describe('normalizeSettings', () => {
  it('leaves the shipped defaults untouched', () => {
    // Guards a real invariant: without it, "reset to defaults" would silently
    // store something different from what the source says the defaults are.
    const defaults = createDefaultSettings();
    const { settings, issues } = normalizeSettings(defaults);
    expect(settings).toEqual(defaults);
    expect(issues).toEqual([]);
  });

  it('round-trips valid settings unchanged', () => {
    const input = {
      version: 2,
      pinnedEnabled: false,
      pinnedSites: [{ url: 'https://example.com/', label: 'Example' }],
      disposableEnabled: false,
      disposableRules: [{ hostname: 'x.com', pathExact: ['/home'] }],
      customGroups: [{ groupKey: 'k', groupLabel: 'K', hostname: 'a.com' }],
      maxHistoryItems: 250,
      autoSortTabs: false,
    };
    expect(normalizeSettings(input).settings).toEqual(input);
  });

  it('falls back to defaults for input that is not an object at all', () => {
    for (const bad of [null, 'nope', undefined]) {
      expect(normalizeSettings(bad).settings).toEqual(createDefaultSettings());
    }
  });

  it('substitutes defaults for a missing section, but honours an explicitly empty one', () => {
    const { settings } = normalizeSettings({ pinnedSites: [], disposableRules: [] });
    expect(settings.pinnedSites).toEqual([]);
    expect(settings.disposableRules).toEqual([]);
    expect(settings.customGroups).toEqual(createDefaultSettings().customGroups);
  });

  describe('pinned sites', () => {
    it('completes bare hostnames and drops entries with no usable URL', () => {
      const { settings, issues } = normalizeSettings({
        pinnedSites: [{ url: 'example.com' }, { url: '' }, { label: 'no url' }, 'not an object'],
      });
      expect(settings.pinnedSites).toEqual([{ url: 'https://example.com/' }]);
      expect(issues).toHaveLength(3);
    });

    it('drops duplicate URLs and omits an empty label', () => {
      const { settings } = normalizeSettings({
        pinnedSites: [{ url: 'https://a.com/', label: '   ' }, { url: 'https://a.com/' }],
      });
      expect(settings.pinnedSites).toHaveLength(1);
      expect(settings.pinnedSites[0]).not.toHaveProperty('label');
    });
  });

  describe('rules', () => {
    it('requires a hostname constraint on disposable rules', () => {
      const { settings, issues } = normalizeSettings({ disposableRules: [{ pathPrefix: '/' }] });
      expect(settings.disposableRules).toEqual([]);
      expect(issues[0]!.message).toMatch(/hostname/);
    });

    it('repairs pasted schemes and missing leading slashes', () => {
      const { settings } = normalizeSettings({
        disposableRules: [
          { hostname: 'https://x.com', pathPrefix: 'home', pathExact: ['feed'], urlNotContains: ['', ' ', '#inbox/'] },
        ],
      });
      expect(settings.disposableRules[0]).toEqual({
        hostname: 'x.com',
        pathPrefix: '/home',
        pathExact: ['/feed'],
        urlNotContains: ['#inbox/'],
      });
    });

    it('requires a group key, defaults the label to it, and de-dupes keys', () => {
      const { settings, issues } = normalizeSettings({
        customGroups: [
          { groupLabel: 'X', hostname: 'a.com' },
          { groupKey: 'work', hostname: 'a.com' },
          { groupKey: 'work', hostname: 'b.com' },
        ],
      });
      expect(settings.customGroups).toEqual([
        { groupKey: 'work', groupLabel: 'work', hostname: 'a.com' },
      ]);
      expect(issues).toHaveLength(2);
    });
  });

  describe('scalar fields', () => {
    it('coerces, rounds and clamps maxHistoryItems', () => {
      expect(normalizeSettings({ maxHistoryItems: 250 }).settings.maxHistoryItems).toBe(250);
      expect(normalizeSettings({ maxHistoryItems: 49.6 }).settings.maxHistoryItems).toBe(50);
      // The options form submits a string.
      expect(normalizeSettings({ maxHistoryItems: '75' }).settings.maxHistoryItems).toBe(75);
      expect(normalizeSettings({ maxHistoryItems: 0 }).settings.maxHistoryItems).toBe(1);
      expect(normalizeSettings({ maxHistoryItems: 5000 }).settings.maxHistoryItems).toBe(1000);
    });

    it('defaults every boolean on, and each reports bad input independently', () => {
      expect(normalizeSettings({}).settings).toMatchObject({
        autoSortTabs: true,
        pinnedEnabled: true,
        disposableEnabled: true,
      });
      expect(normalizeSettings({ autoSortTabs: false }).settings.autoSortTabs).toBe(false);
      expect(normalizeSettings({ pinnedEnabled: false }).settings.pinnedEnabled).toBe(false);
      expect(normalizeSettings({ disposableEnabled: false }).settings.disposableEnabled).toBe(false);

      const { settings, issues } = normalizeSettings({
        maxHistoryItems: 'lots',
        autoSortTabs: 'yes',
        pinnedEnabled: 'yes',
        disposableEnabled: 'yes',
      });
      expect(settings).toMatchObject({
        maxHistoryItems: 100,
        autoSortTabs: true,
        pinnedEnabled: true,
        disposableEnabled: true,
      });
      expect(issues.map((i) => i.path).sort()).toEqual([
        'autoSortTabs',
        'disposableEnabled',
        'maxHistoryItems',
        'pinnedEnabled',
      ]);
    });

    it('reports no issue when a scalar is simply absent', () => {
      expect(normalizeSettings({}).issues).toEqual([]);
    });
  });

  describe('upgrading a v1 blob', () => {
    // The load-bearing case: normalizeSettings runs *before* migrateSettings,
    // so if it didn't fall back to the old key name here, a real user's
    // saved rules (or a previously-exported JSON file) would silently be
    // replaced by the defaults the moment they upgraded.
    const v1Blob = {
      version: 1,
      pinnedSites: [{ url: 'https://a.com/' }],
      landingPatterns: [{ hostname: 'x.com', pathExact: ['/home'] }],
      customGroups: [],
      maxHistoryItems: 250,
      autoSortTabs: false,
    };

    it('reads rules from the old "landingPatterns" key', () => {
      const { settings, issues } = normalizeSettings(v1Blob);
      expect(settings.disposableRules).toEqual([{ hostname: 'x.com', pathExact: ['/home'] }]);
      expect(settings.pinnedSites).toEqual([{ url: 'https://a.com/' }]);
      expect(issues).toEqual([]);
    });

    it('defaults the two new toggles on, since a v1 blob never had them', () => {
      expect(normalizeSettings(v1Blob).settings).toMatchObject({
        pinnedEnabled: true,
        disposableEnabled: true,
      });
    });

    it('prefers the new key when both are somehow present', () => {
      const { settings } = normalizeSettings({
        ...v1Blob,
        disposableRules: [{ hostname: 'new.com' }],
      });
      expect(settings.disposableRules).toEqual([{ hostname: 'new.com' }]);
    });
  });
});

describe('migrateSettings', () => {
  it('stamps the current version onto older settings, leaving current ones alone', () => {
    const settings = createDefaultSettings();
    expect(migrateSettings(settings)).toBe(settings);
    expect(migrateSettings({ ...settings, version: 1 }).version).toBe(SETTINGS_VERSION);
  });
});

describe('JSON round-trip', () => {
  it('survives export then import unchanged', () => {
    const settings = createDefaultSettings();
    const result = parseSettingsJson(stringifySettings(settings));
    expect(result.ok).toBe(true);
    expect(result.settings).toEqual(settings);
  });

  it('reports invalid JSON instead of throwing', () => {
    const result = parseSettingsJson('{ not json');
    expect(result.ok).toBe(false);
    expect(result.issues[0]!.message).toMatch(/Invalid JSON/);
    expect(result.settings).toEqual(createDefaultSettings());
  });
});
