import { beforeEach, describe, expect, it } from 'vitest';
import { groupTitle, renderEmptyState, renderGroupCard, renderGroups, VISIBLE_CHIP_LIMIT } from '@/ui/render/cards';
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
const card = (g: TabGroup = group()) => renderGroups([g]);

describe('groupTitle', () => {
  it('uses the explicit label, else the friendly brand name', () => {
    expect(groupTitle(group())).toBe('GitHub');
    expect(groupTitle({ key: DISPOSABLE_GROUP_KEY, kind: 'disposable', tabs: [] })).toBe('Disposable');
    expect(groupTitle({ key: 'work.com', label: 'Work', kind: 'domain', tabs: [] })).toBe('Work');
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

describe('renderGroups', () => {
  it('numbers group cards consecutively', () => {
    // Handlers resolve a card back to its group by this index, so a gap or a
    // double-count would act on the wrong group.
    const html = renderGroups([
      group(),
      { key: 'x.com', kind: 'domain', tabs: [tab('https://x.com/')] },
    ]);

    expect(html).toContain('data-group-index="0"');
    expect(html).toContain('data-group-index="1"');
    expect(html).not.toContain('data-group-index="2"');
  });

  it('passes each group its own placeholders by key', () => {
    const html = renderGroups(
      [group()],
      new Map([['github.com', [{ site: { url: 'https://absent.example/' }, pinnedIndex: 0 }]]]),
    );
    expect(html).toContain('page-chip-placeholder');
    expect(html).toContain('data-pinned-url="https://absent.example/"');
  });
});

describe('renderGroupCard with placeholders', () => {
  it('renders a grayed, click-to-open placeholder chip, sorted ahead of unpinned real tabs', () => {
    const html = renderGroupCard(group(), 0, [
      { site: { url: 'https://absent.com/', label: 'Absent' }, pinnedIndex: 2 },
    ]);

    expect(html).toContain('page-chip-placeholder');
    expect(html).toContain('data-action="open-pinned-site"');
    expect(html).toContain('data-pinned-url="https://absent.com/"');
    expect(html).toContain('data-pinned-index="2"');
    expect(html).toContain('Absent');
    // Every placeholder is pinned by definition, so it sorts ahead of the
    // group's one unpinned real tab.
    expect(html.indexOf('Absent')).toBeLessThan(html.indexOf('data-action="focus-tab"'));
  });

  it('omits the tab-count badge and "Close all" button for a placeholder-only card', () => {
    const emptyGroup: TabGroup = { key: 'absent.com', kind: 'domain', tabs: [] };
    const html = renderGroupCard(emptyGroup, 0, [
      { site: { url: 'https://absent.com/', label: 'Absent' }, pinnedIndex: 0 },
    ]);

    expect(html).not.toContain('tabs open');
    expect(html).not.toContain('data-action="close-group"');
    expect(html).toContain('pinned-only-card');
  });
});

describe('renderGroupCard chip ordering and pinned labels', () => {
  it('sorts pinned chips first, in configured order, ahead of alphabetically-sorted unpinned chips', () => {
    // Distinct hostnames sharing one registrable domain, so they land in one
    // card together (like mail.google.com / calendar.google.com), while
    // pinning — which matches by hostname + path prefix — picks out one.
    const zetaTab = tab('https://zeta.example/', { title: 'Zeta' });
    const alphaTab = tab('https://alpha.example/', { title: 'Alpha' });
    const pinnedTab = tab('https://pinned.example/', { title: 'Pinned Page' });

    const html = renderGroupCard(
      { key: 'example', kind: 'domain', tabs: [zetaTab, alphaTab, pinnedTab] },
      0,
      [],
      [{ hostname: 'pinned.example', pathPrefix: '', pinnedIndex: 0 }],
    );

    const pinnedPos = html.indexOf('Pinned Page');
    const alphaPos = html.indexOf('data-tab-url="https://alpha.example/"');
    const zetaPos = html.indexOf('data-tab-url="https://zeta.example/"');

    expect(pinnedPos).toBeGreaterThan(-1);
    expect(pinnedPos).toBeLessThan(alphaPos);
    // Unpinned chips fall back to alphabetical order: Alpha before Zeta.
    expect(alphaPos).toBeLessThan(zetaPos);
  });

  it("prefers a pinned site's configured label over the tab's own title — even after the tab has navigated to a different path on the same host", () => {
    // https://calendar.google.com/ redirects to a deep path once opened; the
    // hostname (what pinning matches on) never changes.
    const navigatedTab = tab('https://calendar.google.com/calendar/u/0/r', {
      title: 'Google Calendar - Week of...',
    });
    const html = renderGroupCard(
      { key: 'google.com', kind: 'domain', tabs: [navigatedTab] },
      0,
      [],
      [{ hostname: 'calendar.google.com', pathPrefix: '', pinnedIndex: 0, label: 'Google Calendar' }],
    );

    expect(html).toContain('Google Calendar');
    expect(html).not.toContain('Week of');
  });

  it('leaves an unrelated tab on the same host alone when the pin is a deep page', () => {
    // Regression: a pinned Jira board used to relabel *every* tab on that
    // Jira hostname — issues, backlog, everything — because the label
    // override matched on hostname alone.
    const board = 'https://acme.atlassian.net/jira/software/c/projects/ROTF2OTROR/boards/10559';
    const boardTab = tab(board, { title: 'ROTF2OTROR board - Agile Board' });
    const issueTab = tab('https://acme.atlassian.net/browse/ROTF2OTROR-260', {
      title: 'Fix the flaky deploy step',
    });

    const html = renderGroupCard(
      { key: 'atlassian.net', kind: 'domain', tabs: [boardTab, issueTab] },
      0,
      [],
      [
        {
          hostname: 'acme.atlassian.net',
          pathPrefix: '/jira/software/c/projects/ROTF2OTROR/boards/10559',
          pinnedIndex: 0,
          label: 'Jira Board',
        },
      ],
    );

    expect(html).toContain('Jira Board');
    // The issue keeps its own title rather than becoming a second "Jira Board".
    expect(html).toContain('Fix the flaky deploy step');
    expect(html).toContain(
      'data-tab-url="https://acme.atlassian.net/browse/ROTF2OTROR-260" title="Fix the flaky deploy step"',
    );
  });

  it('sorts a pinned real tab and a pinned placeholder together, by their configured order, across kinds', () => {
    const secondPinTab = tab('https://second.example/', { title: 'Second' });
    const html = renderGroupCard(
      { key: 'shared.example', kind: 'domain', tabs: [secondPinTab] },
      0,
      [{ site: { url: 'https://first.example/', label: 'First' }, pinnedIndex: 0 }],
      [{ hostname: 'second.example', pathPrefix: '', pinnedIndex: 1 }],
    );

    expect(html.indexOf('First')).toBeLessThan(html.indexOf('data-tab-url="https://second.example/"'));
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
