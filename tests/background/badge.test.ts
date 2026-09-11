import { describe, expect, it } from 'vitest';
import { badgeStateForTabs } from '@/background/badge';

/** Builds a tab list of `count` real pages. */
const realTabs = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ url: `https://site${i}.com/` }));

describe('badgeStateForTabs', () => {
  it('shows nothing at zero, rather than a "0"', () => {
    expect(badgeStateForTabs([])).toEqual({ text: '' });
  });

  it('ignores browser-internal pages when counting', () => {
    expect(badgeStateForTabs([{ url: 'https://a.com/' }, { url: 'chrome://newtab/' }])).toEqual({
      text: '1',
      color: '#3d7a4a',
    });
  });

  it.each([
    [1, '#3d7a4a'],
    [10, '#3d7a4a'],
    [11, '#b8892e'],
    [20, '#b8892e'],
    [21, '#b35a5a'],
  ])('colours %i tabs %s', (count, color) => {
    expect(badgeStateForTabs(realTabs(count))).toEqual({ text: String(count), color });
  });
});
