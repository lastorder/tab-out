import { beforeEach, describe, expect, it } from 'vitest';
import {
  groupTitle,
  renderEmptyState,
  renderEntries,
  renderGroupCard,
  renderPinnedPlaceholder,
} from '@/ui/render/cards';
import { renderChip, renderOverflowChips, VISIBLE_CHIP_LIMIT } from '@/ui/render/chips';
import { renderArchiveList, renderSavedItem } from '@/ui/render/saved';
import { LANDING_GROUP_KEY } from '@/core/grouping';
import type { TabGroup } from '@/types';
import { resetTabIds, tab } from '../helpers/factories';

beforeEach(() => resetTabIds());

const domainGroup = (tabsList = [tab('https://github.com/acme/app')]): TabGroup => ({
  key: 'github.com',
  kind: 'domain',
  tabs: tabsList,
});

describe('groupTitle', () => {
  it('uses the friendly brand name for a domain group', () => {
    expect(groupTitle(domainGroup())).toBe('GitHub');
  });

  it('names the synthetic homepages group', () => {
    expect(groupTitle({ key: LANDING_GROUP_KEY, kind: 'landing', tabs: [] })).toBe('Homepages');
  });

  it('prefers an explicit label', () => {
    expect(groupTitle({ key: 'work', label: 'Work', kind: 'custom', tabs: [] })).toBe('Work');
  });
});

describe('renderGroupCard', () => {
  it('carries the group index so handlers can look the group up', () => {
    expect(renderGroupCard(domainGroup(), 3)).toContain('data-group-index="3"');
  });

  it('pluralises the tab count', () => {
    expect(renderGroupCard(domainGroup(), 0)).toContain('1 tab open');
    expect(
      renderGroupCard(domainGroup([tab('https://github.com/a'), tab('https://github.com/b')]), 0),
    ).toContain('2 tabs open');
  });

  it('shows a duplicate badge and a dedupe button when URLs repeat', () => {
    const html = renderGroupCard(
      domainGroup([tab('https://github.com/a'), tab('https://github.com/a')]),
      0,
    );
    expect(html).toContain('1 duplicate');
    expect(html).toContain('data-action="close-duplicates"');
    expect(html).toContain('has-amber-bar');
  });

  it('omits the dedupe button when there are no duplicates', () => {
    const html = renderGroupCard(domainGroup(), 0);
    expect(html).not.toContain('close-duplicates');
    expect(html).toContain('has-neutral-bar');
  });

  it('collapses chips beyond the visible limit behind "+N more"', () => {
    const many = Array.from({ length: VISIBLE_CHIP_LIMIT + 3 }, (_, i) =>
      tab(`https://github.com/${i}`),
    );
    const html = renderGroupCard(domainGroup(many), 0);
    expect(html).toContain('+3 more');
    expect(html).toContain('data-action="expand-chips"');
  });

  it('escapes a hostile tab title', () => {
    const html = renderGroupCard(
      domainGroup([tab('https://github.com/x', { title: '<img src=x onerror=alert(1)>' })]),
      0,
    );
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img');
  });

  it('escapes a hostile URL so it cannot break out of an attribute', () => {
    const html = renderGroupCard(
      domainGroup([tab('https://github.com/x?q="><script>alert(1)</script>')]),
      0,
    );
    expect(html).not.toContain('"><script>');
  });
});

describe('renderChip', () => {
  it('marks duplicates with a count badge', () => {
    const html = renderChip(tab('https://a.com/'), 3, 'a.com');
    expect(html).toContain('(3x)');
    expect(html).toContain('chip-has-dupes');
  });

  it('omits the badge for a single copy', () => {
    expect(renderChip(tab('https://a.com/'), 1, 'a.com')).not.toContain('chip-dupe-badge');
  });

  it('exposes the save and close actions', () => {
    const html = renderChip(tab('https://a.com/'), 1, 'a.com');
    expect(html).toContain('data-action="save-tab"');
    expect(html).toContain('data-action="close-tab"');
    expect(html).toContain('data-action="focus-tab"');
  });

  it('uses no inline event handlers, which MV3 would block', () => {
    expect(renderChip(tab('https://a.com/'), 1, 'a.com')).not.toMatch(/\son\w+=/);
  });
});

describe('renderOverflowChips', () => {
  it('renders nothing when there is no overflow', () => {
    expect(renderOverflowChips([], {}, 'a.com')).toBe('');
  });

  it('hides the overflow container until expanded', () => {
    const html = renderOverflowChips([tab('https://a.com/1')], {}, 'a.com');
    expect(html).toContain('page-chips-overflow" style="display:none"');
    expect(html).toContain('+1 more');
  });
});

describe('renderPinnedPlaceholder', () => {
  it('renders a click-to-open card carrying its URL and index', () => {
    const html = renderPinnedPlaceholder({ url: 'https://a.com', label: 'A' }, 2);
    expect(html).toContain('data-action="open-pinned-site"');
    expect(html).toContain('data-pinned-url="https://a.com"');
    expect(html).toContain('data-pinned-index="2"');
    expect(html).toContain('Click to open');
  });

  it('falls back to a friendly hostname when no label is set', () => {
    expect(renderPinnedPlaceholder({ url: 'https://mail.google.com' }, 0)).toContain('Gmail');
  });
});

describe('renderEntries', () => {
  it('numbers group cards consecutively, skipping placeholders', () => {
    const html = renderEntries([
      { type: 'placeholder', site: { url: 'https://a.com' }, pinnedIndex: 0 },
      { type: 'group', group: domainGroup() },
      { type: 'placeholder', site: { url: 'https://b.com' }, pinnedIndex: 1 },
      { type: 'group', group: { key: 'x.com', kind: 'domain', tabs: [tab('https://x.com/')] } },
    ]);

    expect(html).toContain('data-group-index="0"');
    expect(html).toContain('data-group-index="1"');
    expect(html).not.toContain('data-group-index="2"');
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

  it('renders a checklist row with its actions', () => {
    const html = renderSavedItem(item, now);
    expect(html).toContain('data-action="complete-saved"');
    expect(html).toContain('data-action="dismiss-saved"');
    expect(html).toContain('data-deferred-id="abc"');
    expect(html).toContain('2 hrs ago');
    expect(html).toContain('example.com');
  });

  it('escapes a hostile saved title', () => {
    const html = renderSavedItem({ ...item, title: '"><script>alert(1)</script>' }, now);
    expect(html).not.toContain('<script>');
  });

  it('renders a "no results" note for an empty archive', () => {
    expect(renderArchiveList([], now)).toContain('No results');
  });

  it('prefers completedAt over savedAt for archived rows', () => {
    const html = renderArchiveList(
      [{ ...item, completed: true, completedAt: '2026-04-04T11:00:00.000Z' }],
      now,
    );
    expect(html).toContain('1 hr ago');
  });
});
