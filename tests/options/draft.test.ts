import { describe, expect, it } from 'vitest';
import {
  addRow,
  addSuggestedDisposableRules,
  draftToSettings,
  EMPTY_DISPOSABLE_ROW,
  EMPTY_PINNED_ROW,
  hostnameFromField,
  hostnameToField,
  moveRow,
  patternFromField,
  patternToField,
  removeRow,
  settingsToDraft,
  splitList,
} from '@/options/draft';
import { createDefaultSettings, DEFAULT_DISPOSABLE_RULES } from '@/config/defaults';

const blankDraft = {
  pinnedEnabled: true,
  pinned: [],
  disposableEnabled: true,
  disposable: [],
  custom: [],
  maxHistoryItems: '100',
  autoSortTabs: true,
};

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

describe('pattern field conversion', () => {
  // This is the field that replaced three separate ones (pathPrefix,
  // pathExact, urlNotContains). Every shipped default must round-trip
  // losslessly through it, or "is lossless for the shipped defaults" below
  // would fail — these are the individual cases that guard the same thing.
  it('encodes a prefix term with a trailing *', () => {
    expect(patternToField({ pathPrefix: '/j/' })).toBe('/j/*');
    expect(patternFromField('/j/*')).toEqual({ pathPrefix: '/j/' });
  });

  it('encodes exact paths as plain comma-separated terms', () => {
    expect(patternToField({ pathExact: ['/', '/feed/'] })).toBe('/, /feed/');
    expect(patternFromField('/, /feed/')).toEqual({ pathExact: ['/', '/feed/'] });
  });

  it('encodes veto terms with a leading !', () => {
    expect(patternToField({ pathPrefix: '/', urlNotContains: ['#inbox/', '#sent/'] })).toBe(
      '/*, !#inbox/, !#sent/',
    );
    expect(patternFromField('/*, !#inbox/, !#sent/')).toEqual({
      pathPrefix: '/',
      urlNotContains: ['#inbox/', '#sent/'],
    });
  });

  it('treats blank input, or an empty prefix term, as "match only the root"', () => {
    expect(patternFromField('')).toEqual({});
    expect(patternFromField('*')).toEqual({ pathPrefix: '/' });
  });

  it('auto-prepends a slash to a path term missing one, but not to a veto term', () => {
    // Veto terms are substrings of the *whole URL* (often a hash fragment
    // like "#inbox/"), so they must not be forced to look like a path.
    expect(patternFromField('home')).toEqual({ pathExact: ['/home'] });
    expect(patternFromField('j*')).toEqual({ pathPrefix: '/j' });
    expect(patternFromField('!#inbox/')).toEqual({ urlNotContains: ['#inbox/'] });
  });

  it('keeps only the first prefix term when more than one is given', () => {
    expect(patternFromField('/a*, /b*')).toEqual({ pathPrefix: '/a' });
  });
});

describe('draft round-trip', () => {
  it('is lossless for the shipped defaults', () => {
    const settings = createDefaultSettings();
    expect(draftToSettings(settingsToDraft(settings)).settings).toEqual(settings);
  });

  it('flattens settings into all-string form rows, including the two enable toggles', () => {
    const draft = settingsToDraft(createDefaultSettings());
    expect(draft.pinnedEnabled).toBe(true);
    expect(draft.disposableEnabled).toBe(true);
    // Pinned sites ships empty by default — see config/defaults.ts for why.
    expect(draft.pinned).toEqual([]);
    expect(draft.disposable[0]).toEqual({
      hostname: 'mail.google.com',
      pattern: '/*, !#inbox/, !#sent/, !#search/',
    });
    // The shipped custom-group example: three hostnames, one shared card.
    expect(draft.custom).toEqual([
      { groupKey: 'google-suite', groupLabel: 'Google', hostname: 'calendar.google.com', pathPrefix: '' },
      { groupKey: 'google-suite', groupLabel: 'Google', hostname: 'mail.google.com', pathPrefix: '' },
      { groupKey: 'google-suite', groupLabel: 'Google', hostname: 'chat.google.com', pathPrefix: '' },
    ]);
    expect(draft.maxHistoryItems).toBe('100');
    expect(draft.autoSortTabs).toBe(true);
  });

  it('drops entirely blank rows silently — they are just unfilled "add" rows', () => {
    const draft = settingsToDraft(createDefaultSettings());
    draft.pinned.push({ ...EMPTY_PINNED_ROW });
    draft.disposable.push({ ...EMPTY_DISPOSABLE_ROW });

    const { settings, issues } = draftToSettings(draft);
    expect(settings.pinnedSites).toHaveLength(0);
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

    const disposable = draftToSettings({
      ...blankDraft,
      disposable: [{ hostname: 'x.com', pattern: '/home' }],
    });
    expect(disposable.settings.disposableRules[0]).toEqual({
      hostname: 'x.com',
      pathExact: ['/home'],
    });
  });

  it('carries the two enable toggles through to settings', () => {
    const off = draftToSettings({ ...blankDraft, pinnedEnabled: false, disposableEnabled: false });
    expect(off.settings.pinnedEnabled).toBe(false);
    expect(off.settings.disposableEnabled).toBe(false);
  });
});

describe('addSuggestedDisposableRules', () => {
  it('appends a suggestion not already present, as its row form', () => {
    const result = addSuggestedDisposableRules([], [{ hostname: 'github.com', pathExact: ['/'] }]);
    expect(result).toEqual([{ hostname: 'github.com', pattern: '/' }]);
  });

  it('never adds a rule already present, and never touches existing rows', () => {
    const existing = [{ hostname: 'github.com', pattern: '/' }];
    const result = addSuggestedDisposableRules(existing, [{ hostname: 'github.com', pathExact: ['/'] }]);
    expect(result).toEqual(existing);
    expect(result).not.toBe(existing);
  });

  it('adding every shipped default twice in a row is idempotent', () => {
    const once = addSuggestedDisposableRules([], DEFAULT_DISPOSABLE_RULES);
    const twice = addSuggestedDisposableRules(once, DEFAULT_DISPOSABLE_RULES);
    expect(twice).toEqual(once);
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
