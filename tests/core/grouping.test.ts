import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyPinnedSites,
  buildDashboardModel,
  DISPOSABLE_GROUP_KEY,
  getRealTabs,
  groupTabs,
  pinnedInsertIndex,
  sortGroups,
} from '@/core/grouping';
import { defaultSettings, emptySettings, resetTabIds, tab, tabs } from '../helpers/factories';

beforeEach(() => resetTabIds());

describe('getRealTabs', () => {
  it('filters out browser-internal pages', () => {
    const list = tabs(
      'https://example.com',
      'chrome://newtab/',
      'chrome-extension://abc/index.html',
      'about:blank',
      'file:///tmp/a.txt',
    );
    expect(getRealTabs(list).map((t) => t.url)).toEqual([
      'https://example.com',
      'file:///tmp/a.txt',
    ]);
  });
});

describe('groupTabs', () => {
  it('groups by hostname, and collects local files into one bucket', () => {
    const byHost = groupTabs(
      tabs('https://example.com/a', 'https://example.com/b', 'https://other.com/'),
      emptySettings(),
    );
    expect(byHost.map((g) => g.key)).toEqual(['example.com', 'other.com']);
    expect(byHost[0]!.tabs).toHaveLength(2);

    const files = groupTabs(tabs('file:///a.md', 'file:///b.md'), emptySettings());
    expect(files).toHaveLength(1);
    expect(files[0]!.key).toBe('local-files');
  });

  it('pulls disposable tabs into their own group, leaving content tabs behind', () => {
    // This separation is the whole point: clearing Disposable must not close
    // the PR you're reviewing on the same host.
    const result = groupTabs(
      tabs('https://github.com/', 'https://github.com/acme/app', 'https://x.com/home'),
      defaultSettings(),
    );

    expect(result[0]!.key).toBe(DISPOSABLE_GROUP_KEY);
    expect(result[0]!.tabs.map((t) => t.url)).toEqual([
      'https://github.com/',
      'https://x.com/home',
    ]);
    expect(result[1]!.key).toBe('github.com');
    expect(result[1]!.tabs).toHaveLength(1);
  });

  it('applies rules in precedence order: disposable, then custom, then hostname', () => {
    const custom = emptySettings({
      customGroups: [{ groupKey: 'work', groupLabel: 'Work', hostnameEndsWith: '.acme.net' }],
    });
    const grouped = groupTabs(tabs('https://jira.acme.net/a', 'https://wiki.acme.net/b'), custom);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({ key: 'work', label: 'Work', kind: 'custom' });

    const both = emptySettings({
      disposableRules: [{ hostname: 'acme.net', pathExact: ['/'] }],
      customGroups: [{ groupKey: 'work', groupLabel: 'Work', hostname: 'acme.net' }],
    });
    expect(groupTabs(tabs('https://acme.net/'), both)[0]!.key).toBe(DISPOSABLE_GROUP_KEY);
  });

  it('skips tabs whose URL cannot be parsed', () => {
    expect(groupTabs([tab('nonsense')], emptySettings())).toHaveLength(0);
  });

  it('groups by hostname instead when disposableEnabled is off, without touching the stored rules', () => {
    // Off means "stop applying", not "forget" — the rule stays configured.
    const settings = emptySettings({
      disposableEnabled: false,
      disposableRules: [{ hostname: 'github.com', pathExact: ['/'] }],
    });
    const result = groupTabs(tabs('https://github.com/'), settings);
    expect(result).toEqual([{ key: 'github.com', kind: 'domain', tabs: expect.any(Array) }]);
  });

  it('merges the three shipped Google hostnames into one custom card by default', () => {
    // This is what DEFAULT_CUSTOM_GROUPS exists to demonstrate: three
    // unrelated hostnames, one shared groupKey, one card. A reading of a
    // specific Gmail thread is used (not the inbox) since the inbox itself
    // is claimed by the disposable Gmail rule first.
    const result = groupTabs(
      tabs(
        'https://calendar.google.com/',
        'https://mail.google.com/mail/u/0/#inbox/thread123',
        'https://chat.google.com/',
      ),
      defaultSettings(),
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ key: 'google-suite', label: 'Google', kind: 'custom' });
    expect(result[0]!.tabs).toHaveLength(3);
  });
});

describe('sortGroups', () => {
  it('orders Disposable first, then domains the rules mention, then by size, then by key', () => {
    const groups = [
      { key: 'small.com', kind: 'domain' as const, tabs: tabs('https://small.com/') },
      {
        key: 'big.com',
        kind: 'domain' as const,
        tabs: tabs('https://big.com/1', 'https://big.com/2', 'https://big.com/3'),
      },
      { key: 'github.com', kind: 'domain' as const, tabs: tabs('https://github.com/a') },
      { key: DISPOSABLE_GROUP_KEY, kind: 'disposable' as const, tabs: tabs('https://x.com/home') },
    ];

    expect(sortGroups(groups, defaultSettings().disposableRules).map((g) => g.key)).toEqual([
      DISPOSABLE_GROUP_KEY,
      'github.com',
      'big.com',
      'small.com',
    ]);
  });

  it('breaks ties on key, so the layout does not shuffle between renders', () => {
    const groups = [
      { key: 'b.com', kind: 'domain' as const, tabs: tabs('https://b.com/') },
      { key: 'a.com', kind: 'domain' as const, tabs: tabs('https://a.com/') },
    ];
    expect(sortGroups(groups, []).map((g) => g.key)).toEqual(['a.com', 'b.com']);
  });
});

describe('applyPinnedSites', () => {
  it('promotes an existing group and preserves the configured pinned order', () => {
    const groups = [
      { key: 'other.com', kind: 'domain' as const, tabs: tabs('https://other.com/') },
      { key: 'a.com', kind: 'domain' as const, tabs: tabs('https://a.com/') },
      { key: 'b.com', kind: 'domain' as const, tabs: tabs('https://b.com/') },
    ];
    const { orderedGroups } = applyPinnedSites(groups, [], [
      { url: 'https://b.com' },
      { url: 'https://a.com' },
    ]);
    expect(orderedGroups.map((g) => g.key)).toEqual(['b.com', 'a.com', 'other.com']);
  });

  it('renders a placeholder when a pinned site has no open tabs', () => {
    const { entries } = applyPinnedSites([], [], [{ url: 'https://absent.com', label: 'Absent' }]);
    expect(entries).toEqual([
      { type: 'placeholder', site: { url: 'https://absent.com', label: 'Absent' }, pinnedIndex: 0 },
    ]);
  });

  it('reclaims a pinned site\u2019s tabs from Disposable without duplicating them', () => {
    const homeTab = tab('https://github.com/', { id: 10 });
    const otherTab = tab('https://x.com/home', { id: 11 });
    const groups = [
      { key: DISPOSABLE_GROUP_KEY, kind: 'disposable' as const, tabs: [homeTab, otherTab] },
    ];

    const { orderedGroups } = applyPinnedSites(groups, [homeTab, otherTab], [
      { url: 'https://github.com' },
    ]);

    expect(orderedGroups[0]!.key).toBe('github.com');
    expect(orderedGroups[0]!.tabs.map((t) => t.id)).toEqual([10]);
    expect(orderedGroups[1]!.tabs.map((t) => t.id)).toEqual([11]);
  });

  it('drops a group that has had all of its tabs reclaimed', () => {
    const only = tab('https://github.com/', { id: 20 });
    const groups = [{ key: DISPOSABLE_GROUP_KEY, kind: 'disposable' as const, tabs: [only] }];

    const { orderedGroups } = applyPinnedSites(groups, [only], [{ url: 'https://github.com' }]);
    expect(orderedGroups).toHaveLength(1);
    expect(orderedGroups[0]!.key).toBe('github.com');
  });

  it('ignores pinned entries with an unusable URL', () => {
    expect(applyPinnedSites([], [], [{ url: 'nonsense' }]).entries).toHaveLength(0);
  });

  it('does not mutate the groups it was given', () => {
    const original = [{ key: 'a.com', kind: 'domain' as const, tabs: tabs('https://a.com/') }];
    const snapshot = JSON.stringify(original);
    applyPinnedSites(original, [], [{ url: 'https://a.com' }]);
    expect(JSON.stringify(original)).toBe(snapshot);
  });
});

describe('buildDashboardModel', () => {
  it('produces the full render model from raw tabs', () => {
    const settings = emptySettings({
      pinnedSites: [{ url: 'https://absent.com/' }],
    });
    const model = buildDashboardModel(
      tabs(
        'chrome://newtab/',
        'https://github.com/',
        'https://github.com/acme/app',
        'https://example.com/',
      ),
      settings,
    );

    expect(model.realTabs).toHaveLength(3);
    expect(model.groupCount).toBe(model.orderedGroups.length);
    // The one pinned site above has no open tabs.
    expect(model.entries.filter((e) => e.type === 'placeholder')).toHaveLength(1);
  });

  it('returns an empty model when nothing is open', () => {
    expect(buildDashboardModel([], emptySettings())).toMatchObject({ entries: [], groupCount: 0 });
  });

  it('skips pinned promotion and placeholders entirely when pinnedEnabled is off', () => {
    const settings = emptySettings({
      pinnedEnabled: false,
      pinnedSites: [{ url: 'https://absent.com/' }],
    });
    const model = buildDashboardModel(tabs('https://github.com/'), settings);

    expect(model.entries.some((e) => e.type === 'placeholder')).toBe(false);
    expect(model.orderedGroups.map((g) => g.key)).toEqual(['github.com']);
  });
});

describe('pinnedInsertIndex', () => {
  const pinned = [
    { url: 'https://first.com' },
    { url: 'https://second.com' },
    { url: 'https://third.com' },
  ];

  it('inserts after the closest preceding pinned sibling that is open', () => {
    expect(pinnedInsertIndex(pinned, 2, [tab('https://first.com/', { index: 4 })])).toBe(5);
    expect(
      pinnedInsertIndex(pinned, 2, [
        tab('https://first.com/', { index: 1 }),
        tab('https://second.com/', { index: 6 }),
      ]),
    ).toBe(7);
  });

  it('falls back to the front of the tab bar when no sibling is open', () => {
    expect(pinnedInsertIndex(pinned, 2, [])).toBe(0);
    expect(pinnedInsertIndex(pinned, 0, [])).toBe(0);
  });
});
