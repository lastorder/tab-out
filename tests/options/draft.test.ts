import { describe, expect, it } from 'vitest';
import {
  addRow,
  draftToSettings,
  EMPTY_LANDING_ROW,
  EMPTY_PINNED_ROW,
  hostnameFromField,
  hostnameToField,
  moveRow,
  removeRow,
  settingsToDraft,
  splitList,
} from '@/options/draft';
import { createDefaultSettings } from '@/config/defaults';

const blankDraft = { pinned: [], landing: [], custom: [], maxHistoryItems: '100', autoSortTabs: true };

describe('hostname field conversion', () => {
  it('uses a leading dot to mean "any subdomain", in both directions', () => {
    // One input box for two rule shapes, without teaching the user the terms.
    expect(hostnameToField({ hostnameEndsWith: '.acme.net' })).toBe('.acme.net');
    expect(hostnameToField({ hostnameEndsWith: 'acme.net' })).toBe('.acme.net');
    expect(hostnameToField({ hostname: 'x.com' })).toBe('x.com');

    expect(hostnameFromField('.acme.net')).toEqual({ hostnameEndsWith: '.acme.net' });
    expect(hostnameFromField('x.com')).toEqual({ hostname: 'x.com' });
  });

  it('tolerates a pasted full URL and blank input', () => {
    expect(hostnameFromField('https://x.com/home')).toEqual({ hostname: 'x.com' });
    expect(hostnameFromField('   ')).toEqual({});
    expect(hostnameToField({})).toBe('');
  });
});

describe('splitList', () => {
  it('splits on commas, trimming and dropping blanks', () => {
    expect(splitList(' /home , /feed ')).toEqual(['/home', '/feed']);
    expect(splitList(',, ,')).toEqual([]);
  });
});

describe('draft round-trip', () => {
  it('is lossless for the shipped defaults', () => {
    const settings = createDefaultSettings();
    expect(draftToSettings(settingsToDraft(settings)).settings).toEqual(settings);
  });

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
    expect(draft.maxHistoryItems).toBe('100');
    expect(draft.autoSortTabs).toBe(true);
  });

  it('drops entirely blank rows silently — they are just unfilled "add" rows', () => {
    const draft = settingsToDraft(createDefaultSettings());
    draft.pinned.push({ ...EMPTY_PINNED_ROW });
    draft.landing.push({ ...EMPTY_LANDING_ROW });

    const { settings, issues } = draftToSettings(draft);
    expect(settings.pinnedSites).toHaveLength(3);
    expect(issues).toHaveLength(0);
  });

  it('reports a half-filled row, and completes a bare hostname', () => {
    const halfFilled = draftToSettings({
      ...blankDraft,
      pinned: [{ url: '', label: 'Missing URL' }],
    });
    expect(halfFilled.settings.pinnedSites).toEqual([]);
    expect(halfFilled.issues).toHaveLength(1);

    const bare = draftToSettings({ ...blankDraft, pinned: [{ url: 'example.com', label: '' }] });
    expect(bare.settings.pinnedSites).toEqual([{ url: 'https://example.com/' }]);
  });

  it('builds rules from form rows, omitting blank optional fields', () => {
    const custom = draftToSettings({
      ...blankDraft,
      custom: [{ groupKey: 'work', groupLabel: 'Work', hostname: '.acme.net', pathPrefix: '/jira' }],
    });
    expect(custom.settings.customGroups[0]).toEqual({
      groupKey: 'work',
      groupLabel: 'Work',
      hostnameEndsWith: '.acme.net',
      pathPrefix: '/jira',
    });

    const landing = draftToSettings({
      ...blankDraft,
      landing: [{ hostname: 'x.com', pathPrefix: '', pathExact: '/home', urlNotContains: '' }],
    });
    expect(landing.settings.landingPatterns[0]).toEqual({
      hostname: 'x.com',
      pathExact: ['/home'],
    });
  });
});

describe('row list helpers', () => {
  const rows = [{ url: 'a', label: '' }, { url: 'b', label: '' }, { url: 'c', label: '' }];

  it('adds, removes and reorders without mutating the input', () => {
    const original = [...rows];

    expect(addRow(rows, { url: 'd', label: '' })).toHaveLength(4);
    expect(removeRow(rows, 1).map((r) => r.url)).toEqual(['a', 'c']);
    expect(moveRow(rows, 1, -1).map((r) => r.url)).toEqual(['b', 'a', 'c']);
    expect(moveRow(rows, 1, 1).map((r) => r.url)).toEqual(['a', 'c', 'b']);

    expect(rows).toEqual(original);
  });

  it('clamps out-of-range indexes and edge moves', () => {
    expect(removeRow(rows, 99)).toHaveLength(3);
    expect(removeRow(rows, -1)).toHaveLength(3);
    expect(moveRow(rows, 0, -1).map((r) => r.url)).toEqual(['a', 'b', 'c']);
    expect(moveRow(rows, 2, 1).map((r) => r.url)).toEqual(['a', 'b', 'c']);
  });
});
