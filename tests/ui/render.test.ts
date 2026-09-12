import { beforeEach, describe, expect, it } from 'vitest';
import { groupTitle, renderEmptyState, renderEntries, VISIBLE_CHIP_LIMIT } from '@/ui/render/cards';
import { renderArchiveList, renderSavedItem } from '@/ui/render/saved';
import { DISPOSABLE_GROUP_KEY } from '@/core/grouping';
import type { TabGroup } from '@/types';
import { resetTabIds, tab } from '../helpers/factories';

beforeEach(() => resetTabIds());

const group = (tabsList = [tab('https://github.com/acme/app')]): TabGroup => ({
  key: 'github.com',
  kind: 'domain',
  tabs: tabsList,
});

/** Renders a single group card, as the dashboard would. */
const card = (g: TabGroup = group()) => renderEntries([{ type: 'group', group: g }]);

describe('groupTitle', () => {
  it('uses the explicit label, else the friendly brand name', () => {
    expect(groupTitle(group())).toBe('GitHub');
    expect(groupTitle({ key: DISPOSABLE_GROUP_KEY, kind: 'disposable', tabs: [] })).toBe('Disposable');
    expect(groupTitle({ key: 'work', label: 'Work', kind: 'custom', tabs: [] })).toBe('Work');
  });
});

describe('group cards', () => {
  it('pluralises the tab count', () => {
    expect(card()).toContain('1 tab open');
    expect(card(group([tab('https://github.com/a'), tab('https://github.com/b')]))).toContain(
      '2 tabs open',
    );
  });

  it('surfaces duplicates with a badge, a dedupe button and an amber bar', () => {
    const html = card(group([tab('https://github.com/a'), tab('https://github.com/a')]));
    expect(html).toContain('1 duplicate');
    expect(html).toContain('data-action="close-duplicates"');
    expect(html).toContain('has-amber-bar');

    const clean = card();
    expect(clean).not.toContain('close-duplicates');
    expect(clean).toContain('has-neutral-bar');
  });

  it('collapses chips beyond the visible limit behind "+N more"', () => {
    const many = Array.from({ length: VISIBLE_CHIP_LIMIT + 3 }, (_, i) =>
      tab(`https://github.com/${i}`),
    );
    const html = card(group(many));
    expect(html).toContain('+3 more');
    expect(html).toContain('data-action="expand-chips"');
    expect(html).toContain('page-chips-overflow" style="display:none"');
  });

  it('exposes per-chip focus, save and close actions', () => {
    const html = card();
    expect(html).toContain('data-action="focus-tab"');
    expect(html).toContain('data-action="save-tab"');
    expect(html).toContain('data-action="close-tab"');
  });

  it('escapes hostile titles and URLs', () => {
    const hostile = card(
      group([
        tab('https://github.com/x?q="><script>alert(1)</script>', {
          title: '<img src=x onerror=alert(1)>',
        }),
      ]),
    );
    expect(hostile).not.toContain('<img src=x onerror=alert(1)>');
    expect(hostile).not.toContain('"><script>');
    expect(hostile).toContain('&lt;img');
  });

  it('emits no inline event handlers, which MV3 would block', () => {
    expect(card()).not.toMatch(/\son\w+=/);
  });
});

describe('renderEntries', () => {
  it('numbers group cards consecutively, skipping placeholders', () => {
    // Handlers resolve a card back to its group by this index, so a gap or a
    // double-count would act on the wrong group.
    const html = renderEntries([
      { type: 'placeholder', site: { url: 'https://a.com' }, pinnedIndex: 0 },
      { type: 'group', group: group() },
      { type: 'placeholder', site: { url: 'https://b.com' }, pinnedIndex: 1 },
      { type: 'group', group: { key: 'x.com', kind: 'domain', tabs: [tab('https://x.com/')] } },
    ]);

    expect(html).toContain('data-group-index="0"');
    expect(html).toContain('data-group-index="1"');
    expect(html).not.toContain('data-group-index="2"');
  });

  it('renders pinned placeholders as click-to-open cards', () => {
    const html = renderEntries([
      { type: 'placeholder', site: { url: 'https://a.com', label: 'A' }, pinnedIndex: 2 },
    ]);
    expect(html).toContain('data-action="open-pinned-site"');
    expect(html).toContain('data-pinned-url="https://a.com"');
    expect(html).toContain('data-pinned-index="2"');
    expect(html).toContain('Click to open');

    const unlabelled = renderEntries([
      { type: 'placeholder', site: { url: 'https://mail.google.com' }, pinnedIndex: 0 },
    ]);
    expect(unlabelled).toContain('Gmail');
  });
});

describe('renderEmptyState', () => {
  it('celebrates inbox zero', () => {
    expect(renderEmptyState()).toContain('Inbox zero, but for tabs.');
  });
});

describe('saved-tab rendering', () => {
  const item = {
    id: 'abc',
    url: 'https://example.com/x',
    title: 'Read this',
    savedAt: '2026-04-04T10:00:00.000Z',
    completed: false,
    dismissed: false,
  };
  const now = new Date('2026-04-04T12:00:00.000Z');

  it('renders a checklist row with its actions and metadata', () => {
    const html = renderSavedItem(item, now);
    expect(html).toContain('data-action="complete-saved"');
    expect(html).toContain('data-action="dismiss-saved"');
    expect(html).toContain('data-deferred-id="abc"');
    expect(html).toContain('example.com');
    expect(html).toContain('2 hrs ago');
  });

  it('opens via the tabs API rather than a plain link, so file:// tabs can reopen', () => {
    // A raw <a href="file://..."> is silently blocked by Chrome from an
    // extension page; data-action + chrome.tabs.create is not.
    const html = renderSavedItem({ ...item, url: 'file:///Users/me/notes.md' }, now);
    expect(html).toContain('data-action="open-saved"');
    expect(html).toContain('data-saved-url="file:///Users/me/notes.md"');
    expect(html).not.toContain('<a ');
  });

  it('escapes a hostile saved title', () => {
    expect(renderSavedItem({ ...item, title: '"><script>alert(1)</script>' }, now)).not.toContain(
      '<script>',
    );
  });

  it('prefers completedAt over savedAt for archived rows, and handles an empty archive', () => {
    expect(
      renderArchiveList([{ ...item, completed: true, completedAt: '2026-04-04T11:00:00.000Z' }], now),
    ).toContain('1 hr ago');
    expect(renderArchiveList([], now)).toContain('No results');
  });
});
