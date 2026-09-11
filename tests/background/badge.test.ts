import { describe, expect, it } from 'vitest';
import { badgeStateForCount, badgeStateForTabs, countRealTabs } from '@/background/badge';

describe('countRealTabs', () => {
  it('counts only real web pages', () => {
    expect(
      countRealTabs([
        { url: 'https://a.com/' },
        { url: 'chrome://newtab/' },
        { url: 'chrome-extension://abc/index.html' },
        { url: 'file:///tmp/a.txt' },
      ]),
    ).toBe(2);
  });
});

describe('badgeStateForCount', () => {
  it('shows nothing at zero, rather than a "0"', () => {
    expect(badgeStateForCount(0)).toEqual({ text: '' });
    expect(badgeStateForCount(-1)).toEqual({ text: '' });
  });

  it.each([
    [1, '#3d7a4a'],
    [10, '#3d7a4a'],
    [11, '#b8892e'],
    [20, '#b8892e'],
    [21, '#b35a5a'],
    [500, '#b35a5a'],
  ])('colours %i tabs %s', (count, color) => {
    expect(badgeStateForCount(count)).toEqual({ text: String(count), color });
  });
});

describe('badgeStateForTabs', () => {
  it('ignores internal pages when deriving the badge', () => {
    expect(badgeStateForTabs([{ url: 'https://a.com/' }, { url: 'chrome://newtab/' }])).toEqual({
      text: '1',
      color: '#3d7a4a',
    });
  });
});
