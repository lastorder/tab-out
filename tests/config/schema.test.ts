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
      version: 1,
      pinnedSites: [{ url: 'https://example.com/', label: 'Example' }],
      landingPatterns: [{ hostname: 'x.com', pathExact: ['/home'] }],
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
    const { settings } = normalizeSettings({ pinnedSites: [], landingPatterns: [] });
    expect(settings.pinnedSites).toEqual([]);
    expect(settings.landingPatterns).toEqual([]);
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
    it('requires a hostname constraint on landing patterns', () => {
      const { settings, issues } = normalizeSettings({ landingPatterns: [{ pathPrefix: '/' }] });
      expect(settings.landingPatterns).toEqual([]);
      expect(issues[0]!.message).toMatch(/hostname/);
    });

    it('repairs pasted schemes and missing leading slashes', () => {
      const { settings } = normalizeSettings({
        landingPatterns: [
          { hostname: 'https://x.com', pathPrefix: 'home', pathExact: ['feed'], urlNotContains: ['', ' ', '#inbox/'] },
        ],
      });
      expect(settings.landingPatterns[0]).toEqual({
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

    it('defaults autoSortTabs on, and both scalars report bad input', () => {
      expect(normalizeSettings({}).settings.autoSortTabs).toBe(true);
      expect(normalizeSettings({ autoSortTabs: false }).settings.autoSortTabs).toBe(false);

      const { settings, issues } = normalizeSettings({ maxHistoryItems: 'lots', autoSortTabs: 'yes' });
      expect(settings).toMatchObject({ maxHistoryItems: 100, autoSortTabs: true });
      expect(issues.map((i) => i.path).sort()).toEqual(['autoSortTabs', 'maxHistoryItems']);
    });

    it('reports no issue when a scalar is simply absent', () => {
      expect(normalizeSettings({}).issues).toEqual([]);
    });
  });
});

describe('migrateSettings', () => {
  it('stamps the current version onto older settings, leaving current ones alone', () => {
    const settings = createDefaultSettings();
    expect(migrateSettings(settings)).toBe(settings);
    expect(migrateSettings({ ...settings, version: 0 }).version).toBe(SETTINGS_VERSION);
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
