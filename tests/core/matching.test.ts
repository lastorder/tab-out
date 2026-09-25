import { describe, expect, it } from 'vitest';
import { isDisposable, matchesDisposableRule } from '@/core/matching';
import { DEFAULT_DISPOSABLE_RULES } from '@/config/defaults';

describe('matchesDisposableRule', () => {
  it('matches an exact URL with no wildcard', () => {
    const rule = { pattern: 'https://github.com/' };
    expect(matchesDisposableRule(rule, 'https://github.com/')).toBe(true);
    expect(matchesDisposableRule(rule, 'https://github.com/acme/app')).toBe(false);
  });

  it('lets * match any characters, including /', () => {
    expect(matchesDisposableRule({ pattern: 'https://github.com/*' }, 'https://github.com/')).toBe(
      true,
    );
    expect(
      matchesDisposableRule({ pattern: 'https://github.com/*' }, 'https://github.com/acme/app'),
    ).toBe(true);
    expect(
      matchesDisposableRule(
        { pattern: 'https://github.com/*/issues/*' },
        'https://github.com/acme/app/issues/1',
      ),
    ).toBe(true);
    expect(
      matchesDisposableRule(
        { pattern: 'https://github.com/*/issues/*' },
        'https://github.com/acme/app/pull/1',
      ),
    ).toBe(false);
  });

  it('supports a subdomain wildcard', () => {
    expect(matchesDisposableRule({ pattern: '*.google.com/*' }, 'https://mail.google.com/x')).toBe(
      true,
    );
    expect(matchesDisposableRule({ pattern: '*.google.com/*' }, 'https://example.com/x')).toBe(
      false,
    );
  });

  it('a bare * matches every URL', () => {
    expect(matchesDisposableRule({ pattern: '*' }, 'https://anything.com/')).toBe(true);
    expect(matchesDisposableRule({ pattern: '*' }, 'nonsense')).toBe(true);
  });

  it('never matches an empty pattern', () => {
    // A half-filled options form must not capture every tab on the internet.
    expect(matchesDisposableRule({ pattern: '' }, 'https://anything.com/')).toBe(false);
  });
});

describe('isDisposable with the shipped defaults', () => {
  it.each([
    ['https://x.com/home', true],
    ['https://www.linkedin.com/', true],
    ['https://www.linkedin.com/feed/', true],
    ['https://github.com/', true],
    ['https://github.com/acme/app/pull/1', false],
    // The Zoom rule matches the post-join launcher page (the desktop app
    // handles the actual call), not the whole zoom.us domain.
    ['https://thoughtworks.zoom.us/j/95180550147?pwd=abc#success', true],
    ['https://thoughtworks.zoom.us/profile', false],
    ['https://example.com/', false],
  ])('%s → %s', (url, expected) => {
    expect(isDisposable(url, DEFAULT_DISPOSABLE_RULES)).toBe(expected);
  });
});
