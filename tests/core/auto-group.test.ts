import { beforeEach, describe, expect, it } from 'vitest';
import { planAutoGroups } from '@/core/auto-group';
import { defaultSettings, emptySettings, resetTabIds, tab } from '../helpers/factories';

beforeEach(() => resetTabIds());

describe('planAutoGroups', () => {
  it('plans a group for a domain with 2+ ungrouped tabs', () => {
    const plans = planAutoGroups(
      [tab('https://example.com/a'), tab('https://example.com/b')],
      emptySettings(),
    );
    expect(plans).toHaveLength(1);
    expect(plans[0]!.key).toBe('example.com');
    expect(plans[0]!.title).toBe('Example');
    expect(plans[0]!.tabIds).toHaveLength(2);
  });

  it('does not plan anything for a domain with only one tab', () => {
    const plans = planAutoGroups([tab('https://example.com/a')], emptySettings());
    expect(plans).toEqual([]);
  });

  it('ignores tabs already in some Chrome tab group, even if that would leave 2+ ungrouped ones untouched', () => {
    const plans = planAutoGroups(
      [
        tab('https://example.com/a', { groupId: 5 }),
        tab('https://example.com/b', { groupId: 5 }),
      ],
      emptySettings(),
    );
    expect(plans).toEqual([]);
  });

  it('only sweeps up the ungrouped tabs on a domain, leaving already-grouped ones alone', () => {
    const plans = planAutoGroups(
      [
        tab('https://example.com/a', { groupId: 5 }),
        tab('https://example.com/b'),
        tab('https://example.com/c'),
      ],
      emptySettings(),
    );
    expect(plans).toHaveLength(1);
    expect(plans[0]!.tabIds).toHaveLength(2);
  });

  it('excludes disposable tabs from the count, same as the dashboard does', () => {
    const plans = planAutoGroups(
      [tab('https://github.com/'), tab('https://github.com/acme/app')],
      defaultSettings(),
    );
    // github.com/ itself is disposable by default, leaving only one real tab.
    expect(plans).toEqual([]);
  });

  it('excludes browser-internal tabs', () => {
    const plans = planAutoGroups(
      [tab('chrome://newtab/'), tab('https://example.com/a'), tab('https://example.com/b')],
      emptySettings(),
    );
    expect(plans).toHaveLength(1);
    expect(plans[0]!.tabIds).toHaveLength(2);
  });
});
