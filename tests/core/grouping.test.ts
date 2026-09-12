import { beforeEach, describe, expect, it } from 'vitest';
import {
  attachPinnedPlaceholders,
  buildDashboardModel,
  buildPinnedPriorities,
  DISPOSABLE_GROUP_KEY,
  getRealTabs,
  groupDisplayTitle,
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
  it('groups by registrable domain, merging subdomains, and collects local files into one bucket', () => {
    const byHost = groupTabs(
      tabs('https://example.com/a', 'https://example.com/b', 'https://other.com/'),
      emptySettings(),
    );
    expect(byHost.map((g) => g.key).sort()).toEqual(['example.com', 'other.com']);
    expect(byHost.find((g) => g.key === 'example.com')!.tabs).toHaveLength(2);

    const merged = groupTabs(
      tabs('https://mail.google.com/', 'https://calendar.google.com/'),
      emptySettings(),
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]!.key).toBe('google.com');
    expect(merged[0]!.tabs).toHaveLength(2);

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

    const disposable = result.find((g) => g.key === DISPOSABLE_GROUP_KEY)!;
    expect(disposable.tabs.map((t) => t.url)).toEqual(['https://github.com/', 'https://x.com/home']);
    const github = result.find((g) => g.key === 'github.com')!;
    expect(github.tabs).toHaveLength(1);
  });

  it('skips tabs whose URL cannot be parsed', () => {
    expect(groupTabs([tab('nonsense')], emptySettings())).toHaveLength(0);
  });

  it('groups by domain instead when disposableEnabled is off, without touching the stored rules', () => {
    // Off means "stop applying", not "forget" — the rule stays configured.
    const settings = emptySettings({
      disposableEnabled: false,
      disposableRules: [{ hostname: 'github.com', pathExact: ['/'] }],
    });
    const result = groupTabs(tabs('https://github.com/'), settings);
    expect(result).toEqual([{ key: 'github.com', kind: 'domain', tabs: expect.any(Array) }]);
  });

  it('merges the three shipped Google hostnames into one domain card by default, since their registrable domain is shared', () => {
    // A reading of a specific Gmail thread is used (not the inbox) since the
    // inbox itself is claimed by the disposable Gmail rule first.
    const result = groupTabs(
      tabs(
        'https://calendar.google.com/',
        'https://mail.google.com/mail/u/0/#inbox/thread123',
        'https://chat.google.com/',
      ),
      defaultSettings(),
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ key: 'google.com', kind: 'domain' });
    expect(result[0]!.tabs).toHaveLength(3);
  });
});

describe('sortGroups', () => {
  it('sorts alphabetically by displayed title, with Disposable always last', () => {
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

    // Titles: Big, GitHub, Small, then Disposable last regardless of title.
    expect(sortGroups(groups).map((g) => g.key)).toEqual([
      'big.com',
      'github.com',
      'small.com',
      DISPOSABLE_GROUP_KEY,
    ]);
  });

  it('sorts case-insensitively by displayed title, not by key', () => {
    const groups = [
      { key: 'b.com', kind: 'domain' as const, tabs: tabs('https://b.com/') },
      { key: 'a.com', kind: 'domain' as const, tabs: tabs('https://a.com/') },
    ];
    expect(sortGroups(groups).map((g) => g.key)).toEqual(['a.com', 'b.com']);
  });

  it('orders pinned cards by their earliest configured pinnedIndex, ahead of unpinned ones, with Disposable still last', () => {
    const groups = [
      { key: DISPOSABLE_GROUP_KEY, kind: 'disposable' as const, tabs: tabs('https://x.com/home') },
      { key: 'aaa.com', kind: 'domain' as const, tabs: tabs('https://aaa.com/') },
      { key: 'second-pin.com', kind: 'domain' as const, tabs: tabs('https://second-pin.com/') },
      { key: 'first-pin.com', kind: 'domain' as const, tabs: tabs('https://first-pin.com/') },
    ];
    const pinnedGroupOrder = new Map([
      ['first-pin.com', 0],
      ['second-pin.com', 1],
    ]);

    expect(sortGroups(groups, pinnedGroupOrder).map((g) => g.key)).toEqual([
      'first-pin.com',
      'second-pin.com',
      'aaa.com',
      DISPOSABLE_GROUP_KEY,
    ]);
  });
});

describe('groupDisplayTitle', () => {
  it('uses the explicit label, else the friendly brand name, else Disposable', () => {
    expect(groupDisplayTitle({ key: 'github.com' })).toBe('GitHub');
    expect(groupDisplayTitle({ key: 'work.com', label: 'Work' })).toBe('Work');
    expect(groupDisplayTitle({ key: DISPOSABLE_GROUP_KEY })).toBe('Disposable');
  });
});

describe('attachPinnedPlaceholders', () => {
  it('adds a placeholder for a pinned site with no open tab, under its own domain key', () => {
    const groups = [{ key: 'github.com', kind: 'domain' as const, tabs: tabs('https://github.com/') }];
    const { groups: withPlaceholders, placeholders } = attachPinnedPlaceholders(
      groups,
      tabs('https://github.com/'),
      [{ url: 'https://github.com' }, { url: 'https://absent.com', label: 'Absent' }],
    );

    // github.com already existed and needed nothing extra.
    expect(withPlaceholders.find((g) => g.key === 'github.com')!.tabs).toHaveLength(1);
    expect(placeholders.get('github.com')).toBeUndefined();

    // absent.com didn't exist at all — a new (empty) card is created for it.
    const absentGroup = withPlaceholders.find((g) => g.key === 'absent.com');
    expect(absentGroup).toMatchObject({ key: 'absent.com', kind: 'domain', tabs: [] });
    expect(placeholders.get('absent.com')).toEqual([
      { site: { url: 'https://absent.com', label: 'Absent' }, pinnedIndex: 1 },
    ]);
  });

  it('groups two pinned placeholders under the same registrable domain into one card', () => {
    const { groups, placeholders } = attachPinnedPlaceholders(
      [],
      [],
      [{ url: 'https://mail.google.com/' }, { url: 'https://calendar.google.com/' }],
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.key).toBe('google.com');
    expect(placeholders.get('google.com')).toHaveLength(2);
  });

  it('adds nothing for a pinned site with an unusable URL', () => {
    const { groups, placeholders } = attachPinnedPlaceholders([], [], [{ url: 'nonsense' }]);
    expect(groups).toHaveLength(0);
    expect(placeholders.size).toBe(0);
  });
});

describe('buildPinnedPriorities', () => {
  it('records the earliest pinnedIndex and configured label per hostname', () => {
    const { byHostname, byGroupKey } = buildPinnedPriorities([
      { url: 'https://calendar.google.com/', label: 'Google Calendar' },
      { url: 'https://mail.google.com/', label: 'Gmail' },
      { url: 'https://github.com/' },
    ]);

    expect(byHostname.get('calendar.google.com')).toEqual({ pinnedIndex: 0, label: 'Google Calendar' });
    expect(byHostname.get('mail.google.com')).toEqual({ pinnedIndex: 1, label: 'Gmail' });
    expect(byHostname.get('github.com')).toEqual({ pinnedIndex: 2 });

    // Both Google hostnames share the registrable domain "google.com" — the
    // earlier-configured one (calendar, index 0) wins the card's priority.
    expect(byGroupKey.get('google.com')).toBe(0);
    expect(byGroupKey.get('github.com')).toBe(2);
  });

  it('keeps the first entry when two pinned sites share a hostname', () => {
    const { byHostname } = buildPinnedPriorities([
      { url: 'https://a.com/x', label: 'First' },
      { url: 'https://a.com/y', label: 'Second' },
    ]);
    expect(byHostname.get('a.com')).toEqual({ pinnedIndex: 0, label: 'First' });
  });

  it('ignores an entry with an unusable URL', () => {
    const { byHostname, byGroupKey } = buildPinnedPriorities([{ url: 'nonsense' }]);
    expect(byHostname.size).toBe(0);
    expect(byGroupKey.size).toBe(0);
  });
});

describe('buildDashboardModel', () => {
  it('merges the shipped Google pinned sites into one domain card, with the open one rendering as a normal tab', () => {
    const model = buildDashboardModel(tabs('https://chat.google.com/'), defaultSettings());

    expect(model.orderedGroups).toHaveLength(1);
    expect(model.orderedGroups[0]).toMatchObject({ key: 'google.com', kind: 'domain' });
    expect(model.orderedGroups[0]!.tabs.map((t) => t.url)).toEqual(['https://chat.google.com/']);
    // Only the two still-unopened shipped pinned sites get placeholders.
    expect(model.placeholders.get('google.com')).toHaveLength(2);
  });

  it('creates a placeholder-only Google card for the shipped pinned sites when nothing is open', () => {
    const model = buildDashboardModel([], defaultSettings());

    expect(model.orderedGroups).toHaveLength(1);
    expect(model.orderedGroups[0]).toMatchObject({ key: 'google.com', tabs: [] });
    expect(model.placeholders.get('google.com')).toHaveLength(3);
    // A card with only placeholders doesn't count toward "N domains".
    expect(model.groupCount).toBe(0);
  });

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
    // github.com and example.com have real tabs; absent.com is placeholder-only.
    expect(model.groupCount).toBe(2);
    expect(model.orderedGroups).toHaveLength(3);
    expect(model.placeholders.get('absent.com')).toEqual([
      { site: { url: 'https://absent.com/' }, pinnedIndex: 0 },
    ]);
  });

  it('returns an empty model when nothing is open', () => {
    const model = buildDashboardModel([], emptySettings());
    expect(model.orderedGroups).toEqual([]);
    expect(model.placeholders.size).toBe(0);
    expect(model.groupCount).toBe(0);
  });

  it('adds no placeholders and no pinned sort-priority when pinnedEnabled is off', () => {
    const settings = emptySettings({
      pinnedEnabled: false,
      pinnedSites: [{ url: 'https://absent.com/' }],
    });
    const model = buildDashboardModel(tabs('https://github.com/'), settings);

    expect(model.placeholders.size).toBe(0);
    expect(model.orderedGroups.map((g) => g.key)).toEqual(['github.com']);
  });

  it('keeps an open pinned tab in its own domain card rather than extracting it', () => {
    const settings = emptySettings({ pinnedSites: [{ url: 'https://github.com/' }] });
    const model = buildDashboardModel(
      tabs('https://github.com/', 'https://github.com/acme/app'),
      settings,
    );

    expect(model.orderedGroups).toHaveLength(1);
    expect(model.orderedGroups[0]!.tabs).toHaveLength(2);
    expect(model.placeholders.size).toBe(0);
  });

  it('orders interleaved pinned cards by configured order, ahead of unpinned cards, and exposes per-hostname pinned info', () => {
    const settings = emptySettings({
      pinnedSites: [
        { url: 'https://second.example/', label: 'Second Pin' },
        { url: 'https://first.example/', label: 'First Pin' },
      ],
    });
    // "aaa.example" would otherwise sort first alphabetically, but neither
    // pinned site is configured before it — both pinned cards still lead.
    const model = buildDashboardModel(
      tabs('https://aaa.example/', 'https://first.example/', 'https://second.example/'),
      settings,
    );

    expect(model.orderedGroups.map((g) => g.key)).toEqual([
      'second.example',
      'first.example',
      'aaa.example',
    ]);
    expect(model.pinnedHostnames.get('second.example')).toEqual({
      pinnedIndex: 0,
      label: 'Second Pin',
    });
    expect(model.pinnedHostnames.get('first.example')).toEqual({ pinnedIndex: 1, label: 'First Pin' });
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
