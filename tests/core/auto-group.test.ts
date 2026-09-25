import { beforeEach, describe, expect, it } from 'vitest';
import { planTabGrouping } from '@/core/auto-group';
import { defaultSettings, emptySettings, resetTabIds, tab } from '../helpers/factories';

beforeEach(() => resetTabIds());

describe('planTabGrouping', () => {
  it('plans a new group for a domain with 2+ ungrouped tabs', () => {
    const actions = planTabGrouping(
      [tab('https://example.com/a'), tab('https://example.com/b')],
      emptySettings(),
    );
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      kind: 'create',
      key: 'example.com',
      title: 'Example',
      windowId: 1,
    });
    expect(actions[0]!.tabIds).toHaveLength(2);
  });

  it('does not plan anything for a lone ungrouped tab with no existing group', () => {
    expect(planTabGrouping([tab('https://example.com/a')], emptySettings())).toEqual([]);
  });

  it('adopts a lone new tab into the Chrome tab group its domain already has', () => {
    // The whole point of the feature: opening one more tab of an already
    // grouped site should join that group, not sit outside it.
    const actions = planTabGrouping(
      [
        tab('https://example.com/a', { groupId: 5 }),
        tab('https://example.com/b', { groupId: 5 }),
        tab('https://example.com/c'),
      ],
      emptySettings(),
    );

    expect(actions).toEqual([
      { kind: 'adopt', key: 'example.com', groupId: 5, windowId: 1, tabIds: [3] },
    ]);
  });

  it('still adopts into a group the user has renamed, because adoption reads the tabs, not the title', () => {
    // A group auto-created as "Thoughtworks" and then renamed to "Work" is
    // still the thoughtworks.com group: `domainGroupsByWindowDomain` derives
    // a group's domain from its member tabs' URLs, never from its title, so
    // renaming can't silently stop later tabs joining it.
    const actions = planTabGrouping(
      [
        tab('https://thoughtworks.com/a', { groupId: 7 }),
        tab('https://thoughtworks.com/b', { groupId: 7 }),
        tab('https://thoughtworks.com/c'),
      ],
      emptySettings(),
    );

    expect(actions).toEqual([
      { kind: 'adopt', key: 'thoughtworks.com', groupId: 7, windowId: 1, tabIds: [3] },
    ]);
  });

  it('stops adopting once the user repurposes that group by adding another site to it', () => {
    // The flip side of reading the tabs rather than the title: a group the
    // user has turned into a mixed-site group is no longer anyone's domain
    // group, so it is left alone (and, with no group of its own, the domain
    // falls back to the normal create threshold).
    const actions = planTabGrouping(
      [
        tab('https://thoughtworks.com/a', { groupId: 7 }),
        tab('https://other.com/a', { groupId: 7 }),
        tab('https://thoughtworks.com/b'),
        tab('https://thoughtworks.com/c'),
      ],
      emptySettings(),
    );

    expect(actions).toEqual([
      { kind: 'create', key: 'thoughtworks.com', title: 'Thoughtworks', windowId: 1, tabIds: [3, 4] },
    ]);
  });

  it('never seeds a second group for a domain that already has one', () => {
    // The regression this guards: counting only *ungrouped* tabs made two
    // fresh tabs of an already-grouped domain look like a brand-new domain,
    // so the sweep created a duplicate group for the same site.
    const actions = planTabGrouping(
      [
        tab('https://thoughtworks.com/a', { groupId: 7 }),
        tab('https://thoughtworks.com/b', { groupId: 7 }),
        tab('https://thoughtworks.com/c'),
        tab('https://thoughtworks.com/d'),
      ],
      emptySettings(),
    );

    expect(actions.filter((action) => action.kind === 'create')).toEqual([]);
    expect(actions).toEqual([
      { kind: 'adopt', key: 'thoughtworks.com', groupId: 7, windowId: 1, tabIds: [3, 4] },
    ]);
  });

  it('never plans an action for tabs already in a Chrome tab group', () => {
    const actions = planTabGrouping(
      [
        tab('https://example.com/a', { groupId: 5 }),
        tab('https://example.com/b', { groupId: 5 }),
      ],
      emptySettings(),
    );
    expect(actions).toEqual([]);
  });

  it('never groups a pinned tab, and never counts one toward the threshold', () => {
    // Grouping a pinned tab would un-pin it (Chrome treats pinning and
    // grouping as mutually exclusive), silently undoing the user's pin.
    const actions = planTabGrouping(
      [
        tab('https://example.com/a', { pinned: true }),
        tab('https://example.com/b', { pinned: true }),
        tab('https://example.com/c'),
      ],
      emptySettings(),
    );

    // The two pinned tabs are invisible to the sweep, leaving just one
    // ungrouped tab — below the threshold, so nothing happens at all.
    expect(actions).toEqual([]);
  });

  it('does not adopt a pinned tab into its domain\'s existing group', () => {
    const actions = planTabGrouping(
      [
        tab('https://example.com/a', { groupId: 5 }),
        tab('https://example.com/b', { groupId: 5 }),
        tab('https://example.com/pinned', { pinned: true }),
      ],
      emptySettings(),
    );

    expect(actions).toEqual([]);
  });

  it('does not treat a mixed-domain group the user built by hand as anyone\'s domain group', () => {
    // A hand-made group is the user's own arrangement; a fresh tab that
    // merely shares a domain with one of its members must not be moved in.
    const actions = planTabGrouping(
      [
        tab('https://example.com/a', { groupId: 5 }),
        tab('https://other.com/a', { groupId: 5 }),
        tab('https://example.com/b'),
      ],
      emptySettings(),
    );

    // Only one ungrouped example.com tab, so no new group either.
    expect(actions).toEqual([]);
  });

  it('keeps windows apart, since a Chrome tab group only ever belongs to one', () => {
    const actions = planTabGrouping(
      [
        tab('https://example.com/a', { windowId: 1 }),
        tab('https://example.com/b', { windowId: 2 }),
      ],
      emptySettings(),
    );
    // Two tabs, but one per window — neither window reaches the threshold.
    expect(actions).toEqual([]);
  });

  it('adopts into the group in the matching window, not another window\'s', () => {
    const actions = planTabGrouping(
      [
        tab('https://example.com/a', { windowId: 1, groupId: 5 }),
        tab('https://example.com/b', { windowId: 2, groupId: 9 }),
        tab('https://example.com/c', { windowId: 2 }),
      ],
      emptySettings(),
    );

    expect(actions).toEqual([
      { kind: 'adopt', key: 'example.com', groupId: 9, windowId: 2, tabIds: [3] },
    ]);
  });

  it('excludes disposable tabs, same as the dashboard does', () => {
    const actions = planTabGrouping(
      [tab('https://github.com/'), tab('https://github.com/acme/app')],
      defaultSettings(),
    );
    // github.com/ itself is disposable by default, leaving only one real tab.
    expect(actions).toEqual([]);
  });

  it('excludes browser-internal tabs', () => {
    const actions = planTabGrouping(
      [tab('chrome://newtab/'), tab('https://example.com/a'), tab('https://example.com/b')],
      emptySettings(),
    );
    expect(actions).toHaveLength(1);
    expect(actions[0]!.tabIds).toHaveLength(2);
  });
});
