import { describe, expect, it } from 'vitest';
import {
  addRow,
  addSuggestedDisposableRules,
  draftToSettings,
  EMPTY_DISPOSABLE_ROW,
  EMPTY_PINNED_ROW,
  moveRow,
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
  maxHistoryItems: '100',
  autoSortTabs: true,
  searchShortcut: { key: 'f', ctrl: true, meta: false, alt: false, shift: false },
};

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

  it('flattens settings into all-string form rows, including the two enable toggles', () => {
    const draft = settingsToDraft(createDefaultSettings());
    expect(draft.pinnedEnabled).toBe(true);
    expect(draft.disposableEnabled).toBe(true);
    // All three share google.com's registrable domain, so they already
    // land in one domain card without a merge feature.
    expect(draft.pinned).toEqual([
      { url: 'https://calendar.google.com/', label: 'Google Calendar' },
      { url: 'https://mail.google.com/', label: 'Gmail' },
      { url: 'https://chat.google.com/', label: 'Google Chat' },
    ]);
    expect(draft.disposable[0]).toEqual({ pattern: 'https://x.com/home' });
    expect(draft.maxHistoryItems).toBe('100');
    expect(draft.autoSortTabs).toBe(true);
  });

  it('drops entirely blank rows silently — they are just unfilled "add" rows', () => {
    const draft = settingsToDraft(createDefaultSettings());
    draft.pinned.push({ ...EMPTY_PINNED_ROW });
    draft.disposable.push({ ...EMPTY_DISPOSABLE_ROW });

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

  it('builds rules from form rows', () => {
    const disposable = draftToSettings({
      ...blankDraft,
      disposable: [{ pattern: 'https://x.com/home' }],
    });
    expect(disposable.settings.disposableRules[0]).toEqual({ pattern: 'https://x.com/home' });
  });

  it('carries the two enable toggles through to settings', () => {
    const off = draftToSettings({ ...blankDraft, pinnedEnabled: false, disposableEnabled: false });
    expect(off.settings.pinnedEnabled).toBe(false);
    expect(off.settings.disposableEnabled).toBe(false);
  });
});

describe('addSuggestedDisposableRules', () => {
  it('appends a suggestion not already present, as its row form', () => {
    const result = addSuggestedDisposableRules([], [{ pattern: 'https://github.com/' }]);
    expect(result).toEqual([{ pattern: 'https://github.com/' }]);
  });

  it('never adds a rule already present, and never touches existing rows', () => {
    const existing = [{ pattern: 'https://github.com/' }];
    const result = addSuggestedDisposableRules(existing, [{ pattern: 'https://github.com/' }]);
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
