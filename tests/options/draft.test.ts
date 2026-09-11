import { describe, expect, it } from 'vitest';
import {
  addRow,
  draftToSettings,
  EMPTY_LANDING_ROW,
  EMPTY_PINNED_ROW,
  hostnameFromField,
  hostnameToField,
  joinList,
  moveRow,
  removeRow,
  settingsToDraft,
  splitList,
} from '@/options/draft';
import { createDefaultSettings } from '@/config/defaults';

describe('splitList / joinList', () => {
  it('splits on commas and trims', () => {
    expect(splitList(' /home , /feed ')).toEqual(['/home', '/feed']);
  });

  it('drops empty entries', () => {
    expect(splitList(',, ,')).toEqual([]);
  });

  it('round-trips', () => {
    expect(splitList(joinList(['/a', '/b']))).toEqual(['/a', '/b']);
  });

  it('renders undefined as an empty field', () => {
    expect(joinList(undefined)).toBe('');
  });
});

describe('hostname field conversion', () => {
  it('shows suffix rules with a leading dot', () => {
    expect(hostnameToField({ hostnameEndsWith: '.acme.net' })).toBe('.acme.net');
    expect(hostnameToField({ hostnameEndsWith: 'acme.net' })).toBe('.acme.net');
  });

  it('shows exact rules as-is', () => {
    expect(hostnameToField({ hostname: 'x.com' })).toBe('x.com');
    expect(hostnameToField({})).toBe('');
  });

  it('reads a leading dot back as a suffix rule', () => {
    expect(hostnameFromField('.acme.net')).toEqual({ hostnameEndsWith: '.acme.net' });
    expect(hostnameFromField('x.com')).toEqual({ hostname: 'x.com' });
  });

  it('tolerates a pasted full URL', () => {
    expect(hostnameFromField('https://x.com/home')).toEqual({ hostname: 'x.com' });
  });

  it('returns nothing for blank input', () => {
    expect(hostnameFromField('   ')).toEqual({});
  });
});

describe('settingsToDraft', () => {
  it('flattens settings into all-string form rows', () => {
    const draft = settingsToDraft(createDefaultSettings());

    expect(draft.pinned[0]).toEqual({
      url: 'https://calendar.google.com/',
      label: 'Google Calendar',
    });
    expect(draft.landing[0]).toEqual({
      hostname: 'mail.google.com',
      pathPrefix: '/',
      pathExact: '',
      urlNotContains: '#inbox/, #sent/, #search/',
    });
  });
});

describe('draftToSettings', () => {
  it('is the inverse of settingsToDraft for the shipped defaults', () => {
    const settings = createDefaultSettings();
    expect(draftToSettings(settingsToDraft(settings)).settings).toEqual(settings);
  });

  it('drops entirely blank rows without complaining', () => {
    const draft = settingsToDraft(createDefaultSettings());
    draft.pinned.push({ ...EMPTY_PINNED_ROW });
    draft.landing.push({ ...EMPTY_LANDING_ROW });

    const { settings, issues } = draftToSettings(draft);
    expect(settings.pinnedSites).toHaveLength(3);
    expect(issues).toHaveLength(0);
  });

  it('reports a half-filled row as an issue', () => {
    const { settings, issues } = draftToSettings({
      pinned: [{ url: '', label: 'Missing URL' }],
      landing: [],
      custom: [],
      maxHistoryItems: '100',
    });
    expect(settings.pinnedSites).toEqual([]);
    expect(issues).toHaveLength(1);
  });

  it('normalises a bare hostname typed into the URL field', () => {
    const { settings } = draftToSettings({
      pinned: [{ url: 'example.com', label: '' }],
      landing: [],
      custom: [],
      maxHistoryItems: '100',
    });
    expect(settings.pinnedSites).toEqual([{ url: 'https://example.com/' }]);
  });

  it('builds a custom group rule from its form row', () => {
    const { settings } = draftToSettings({
      pinned: [],
      landing: [],
      custom: [
        { groupKey: 'work', groupLabel: 'Work', hostname: '.acme.net', pathPrefix: '/jira' },
      ],
      maxHistoryItems: '100',
    });
    expect(settings.customGroups[0]).toEqual({
      groupKey: 'work',
      groupLabel: 'Work',
      hostnameEndsWith: '.acme.net',
      pathPrefix: '/jira',
    });
  });

  it('omits blank optional fields rather than storing empty strings', () => {
    const { settings } = draftToSettings({
      pinned: [],
      landing: [{ hostname: 'x.com', pathPrefix: '', pathExact: '/home', urlNotContains: '' }],
      custom: [],
      maxHistoryItems: '100',
    });
    expect(settings.landingPatterns[0]).toEqual({ hostname: 'x.com', pathExact: ['/home'] });
  });
});

describe('row list helpers', () => {
  const rows = [{ url: 'a', label: '' }, { url: 'b', label: '' }, { url: 'c', label: '' }];

  it('appends a row', () => {
    expect(addRow(rows, { url: 'd', label: '' })).toHaveLength(4);
  });

  it('removes a row by index', () => {
    expect(removeRow(rows, 1).map((r) => r.url)).toEqual(['a', 'c']);
  });

  it('ignores an out-of-range removal', () => {
    expect(removeRow(rows, 99)).toHaveLength(3);
    expect(removeRow(rows, -1)).toHaveLength(3);
  });

  it('moves a row up and down', () => {
    expect(moveRow(rows, 1, -1).map((r) => r.url)).toEqual(['b', 'a', 'c']);
    expect(moveRow(rows, 1, 1).map((r) => r.url)).toEqual(['a', 'c', 'b']);
  });

  it('clamps movement at the list edges', () => {
    expect(moveRow(rows, 0, -1).map((r) => r.url)).toEqual(['a', 'b', 'c']);
    expect(moveRow(rows, 2, 1).map((r) => r.url)).toEqual(['a', 'b', 'c']);
  });

  it('never mutates the input array', () => {
    const original = [...rows];
    moveRow(rows, 0, 1);
    removeRow(rows, 0);
    addRow(rows, { url: 'z', label: '' });
    expect(rows).toEqual(original);
  });
});
