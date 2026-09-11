import { describe, expect, it } from 'vitest';
import {
  migrateSettings,
  normalizeSettings,
  parseSettingsJson,
  stringifySettings,
} from '@/config/schema';
import { createDefaultSettings, SETTINGS_VERSION } from '@/config/defaults';

describe('normalizeSettings', () => {
  it('leaves the shipped defaults untouched', () => {
    // Guards the invariant that defaults are already in normalised form;
    // without it, "reset to defaults" would silently rewrite what it stored.
    const defaults = createDefaultSettings();
    const { settings, issues } = normalizeSettings(defaults);
    expect(settings).toEqual(defaults);
    expect(issues).toEqual([]);
  });

  it('falls back to defaults for non-object input', () => {
    expect(normalizeSettings(null).settings).toEqual(createDefaultSettings());
    expect(normalizeSettings('nope').settings).toEqual(createDefaultSettings());
    expect(normalizeSettings(undefined).settings).toEqual(createDefaultSettings());
  });

  it('keeps valid settings intact', () => {
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

  describe('maxHistoryItems', () => {
    it('accepts a valid whole number as-is', () => {
      expect(normalizeSettings({ maxHistoryItems: 250 }).settings.maxHistoryItems).toBe(250);
    });

    it('rounds a fractional number', () => {
      expect(normalizeSettings({ maxHistoryItems: 49.6 }).settings.maxHistoryItems).toBe(50);
    });

    it('coerces a numeric string, as the options form submits it', () => {
      expect(normalizeSettings({ maxHistoryItems: '75' }).settings.maxHistoryItems).toBe(75);
    });

    it('falls back to the default without an issue when the field is missing', () => {
      const { settings, issues } = normalizeSettings({});
      expect(settings.maxHistoryItems).toBe(100);
      expect(issues).toEqual([]);
    });

    it('falls back to the default and reports an issue for non-numeric input', () => {
      const { settings, issues } = normalizeSettings({ maxHistoryItems: 'lots' });
      expect(settings.maxHistoryItems).toBe(100);
      expect(issues).toHaveLength(1);
      expect(issues[0]!.path).toBe('maxHistoryItems');
    });

    it('clamps below the minimum', () => {
      const { settings, issues } = normalizeSettings({ maxHistoryItems: 0 });
      expect(settings.maxHistoryItems).toBe(1);
      expect(issues).toHaveLength(1);
    });

    it('clamps above the maximum', () => {
      const { settings, issues } = normalizeSettings({ maxHistoryItems: 5000 });
      expect(settings.maxHistoryItems).toBe(1000);
      expect(issues).toHaveLength(1);
    });
  });

  describe('autoSortTabs', () => {
    it('accepts true and false as-is', () => {
      expect(normalizeSettings({ autoSortTabs: true }).settings.autoSortTabs).toBe(true);
      expect(normalizeSettings({ autoSortTabs: false }).settings.autoSortTabs).toBe(false);
    });

    it('defaults to on, without an issue, when the field is missing', () => {
      const { settings, issues } = normalizeSettings({});
      expect(settings.autoSortTabs).toBe(true);
      expect(issues).toEqual([]);
    });

    it('falls back to the default and reports an issue for a non-boolean value', () => {
      const { settings, issues } = normalizeSettings({ autoSortTabs: 'yes' });
      expect(settings.autoSortTabs).toBe(true);
      expect(issues).toHaveLength(1);
      expect(issues[0]!.path).toBe('autoSortTabs');
    });
  });

  describe('pinned sites', () => {
    it('upgrades bare hostnames to full URLs', () => {
      const { settings } = normalizeSettings({ pinnedSites: [{ url: 'example.com' }] });
      expect(settings.pinnedSites).toEqual([{ url: 'https://example.com/' }]);
    });

    it('drops entries with no usable URL and reports why', () => {
      const { settings, issues } = normalizeSettings({
        pinnedSites: [{ url: '' }, { label: 'no url' }, 'not an object'],
      });
      expect(settings.pinnedSites).toEqual([]);
      expect(issues).toHaveLength(3);
    });

    it('drops duplicate URLs', () => {
      const { settings, issues } = normalizeSettings({
        pinnedSites: [{ url: 'https://a.com/' }, { url: 'https://a.com/' }],
      });
      expect(settings.pinnedSites).toHaveLength(1);
      expect(issues[0]!.message).toMatch(/Duplicate/);
    });

    it('omits an empty label rather than storing an empty string', () => {
      const { settings } = normalizeSettings({
        pinnedSites: [{ url: 'https://a.com/', label: '   ' }],
      });
      expect(settings.pinnedSites[0]).not.toHaveProperty('label');
    });
  });

  describe('landing patterns', () => {
    it('requires a hostname constraint', () => {
      const { settings, issues } = normalizeSettings({
        landingPatterns: [{ pathPrefix: '/' }],
      });
      expect(settings.landingPatterns).toEqual([]);
      expect(issues[0]!.message).toMatch(/hostname/);
    });

    it('strips a scheme accidentally typed into the hostname field', () => {
      const { settings } = normalizeSettings({
        landingPatterns: [{ hostname: 'https://x.com' }],
      });
      expect(settings.landingPatterns[0]!.hostname).toBe('x.com');
    });

    it('adds a leading slash to paths', () => {
      const { settings } = normalizeSettings({
        landingPatterns: [{ hostname: 'x.com', pathPrefix: 'home', pathExact: ['feed'] }],
      });
      expect(settings.landingPatterns[0]).toMatchObject({
        pathPrefix: '/home',
        pathExact: ['/feed'],
      });
    });

    it('drops empty entries from list fields', () => {
      const { settings } = normalizeSettings({
        landingPatterns: [{ hostname: 'x.com', urlNotContains: ['', '  ', '#inbox/'] }],
      });
      expect(settings.landingPatterns[0]!.urlNotContains).toEqual(['#inbox/']);
    });

    it('prefers an exact hostname over a suffix when both are present', () => {
      const { settings } = normalizeSettings({
        landingPatterns: [{ hostname: 'x.com', hostnameEndsWith: '.y.com' }],
      });
      expect(settings.landingPatterns[0]).toEqual({ hostname: 'x.com' });
    });
  });

  describe('custom groups', () => {
    it('requires a group key', () => {
      const { settings, issues } = normalizeSettings({
        customGroups: [{ groupLabel: 'X', hostname: 'a.com' }],
      });
      expect(settings.customGroups).toEqual([]);
      expect(issues[0]!.message).toMatch(/groupKey/);
    });

    it('falls back to the key when no label is given', () => {
      const { settings } = normalizeSettings({
        customGroups: [{ groupKey: 'work', hostname: 'a.com' }],
      });
      expect(settings.customGroups[0]!.groupLabel).toBe('work');
    });

    it('drops duplicate group keys', () => {
      const { settings } = normalizeSettings({
        customGroups: [
          { groupKey: 'work', hostname: 'a.com' },
          { groupKey: 'work', hostname: 'b.com' },
        ],
      });
      expect(settings.customGroups).toHaveLength(1);
    });
  });

  it('accepts an explicitly empty section instead of substituting defaults', () => {
    const { settings } = normalizeSettings({ pinnedSites: [], landingPatterns: [] });
    expect(settings.pinnedSites).toEqual([]);
    expect(settings.landingPatterns).toEqual([]);
  });

  it('substitutes defaults for a missing section', () => {
    const { settings } = normalizeSettings({ pinnedSites: [] });
    expect(settings.landingPatterns).toEqual(createDefaultSettings().landingPatterns);
  });
});

describe('migrateSettings', () => {
  it('leaves current-version settings untouched', () => {
    const settings = createDefaultSettings();
    expect(migrateSettings(settings)).toBe(settings);
  });

  it('stamps the current version onto older settings', () => {
    const old = { ...createDefaultSettings(), version: 0 };
    expect(migrateSettings(old).version).toBe(SETTINGS_VERSION);
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
