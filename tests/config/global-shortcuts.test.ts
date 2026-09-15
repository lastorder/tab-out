import { describe, expect, it } from 'vitest';
import manifest from '@/manifest.json';
import {
  createDefaultSettings,
  DEFAULT_GLOBAL_DASHBOARD_SHORTCUT_ENABLED,
  DEFAULT_GLOBAL_SEARCH_SHORTCUT_ENABLED,
} from '@/config/defaults';
import { normalizeSettings } from '@/config/schema';

type CommandDef = { suggested_key?: Record<string, string> };
const commands = manifest.commands as Record<string, CommandDef>;

describe('global shortcut defaults', () => {
  it('ships both global shortcuts switched off', () => {
    // A fresh install must not claim a browser-wide chord on the user's behalf.
    const settings = createDefaultSettings();
    expect(settings.globalSearchShortcutEnabled).toBe(false);
    expect(settings.globalDashboardShortcutEnabled).toBe(false);
    expect(DEFAULT_GLOBAL_SEARCH_SHORTCUT_ENABLED).toBe(false);
    expect(DEFAULT_GLOBAL_DASHBOARD_SHORTCUT_ENABLED).toBe(false);
  });

  it('treats settings saved before the fields existed as off, not on', () => {
    // The upgrade path: `normalizeSettings` runs before `migrateSettings`, so
    // a missing field must resolve to the "off" default rather than enabling a
    // browser-wide shortcut for every existing user.
    const { settings } = normalizeSettings({
      version: 3,
      pinnedSites: [],
      disposableRules: [],
    });
    expect(settings.globalSearchShortcutEnabled).toBe(false);
    expect(settings.globalDashboardShortcutEnabled).toBe(false);
  });

  it('repairs a non-boolean value to off and reports it', () => {
    const { settings, issues } = normalizeSettings({
      globalSearchShortcutEnabled: 'yes',
      globalDashboardShortcutEnabled: 1,
    });
    expect(settings.globalSearchShortcutEnabled).toBe(false);
    expect(settings.globalDashboardShortcutEnabled).toBe(false);
    expect(issues.map((issue) => issue.path)).toEqual([
      'globalSearchShortcutEnabled',
      'globalDashboardShortcutEnabled',
    ]);
  });
});

describe('manifest commands', () => {
  // These assertions exist so the chords the options page *displays* (read
  // straight out of this manifest) can never silently disagree with the ones
  // Chrome actually binds, and so a future edit can't quietly change the
  // documented defaults.
  it('declares both global commands with the documented Mac defaults', () => {
    expect(Object.keys(commands)).toEqual(['global-search', 'global-dashboard']);
    expect(commands['global-search']?.suggested_key).toEqual({
      default: 'Ctrl+Shift+F',
      mac: 'Command+Shift+F',
    });
    expect(commands['global-dashboard']?.suggested_key).toEqual({
      default: 'Ctrl+Shift+T',
      mac: 'Command+Shift+T',
    });
  });

  it('opens the search popup from the toolbar icon too', () => {
    expect(manifest.action.default_popup).toBe('popup.html');
  });
});
