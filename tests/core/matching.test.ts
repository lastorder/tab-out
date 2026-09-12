import { describe, expect, it } from 'vitest';
import { findCustomGroup, isDisposable, isDisposableDomain, matchesDisposableRule } from '@/core/matching';
import { DEFAULT_DISPOSABLE_RULES } from '@/config/defaults';

describe('matchesDisposableRule', () => {
  it('matches only the site root when no path constraint is given', () => {
    const rule = { hostname: 'github.com' };
    expect(matchesDisposableRule(rule, 'https://github.com/')).toBe(true);
    expect(matchesDisposableRule(rule, 'https://github.com/acme/app')).toBe(false);
  });

  it('supports exact paths, path prefixes, and subdomain suffixes', () => {
    expect(
      matchesDisposableRule({ hostname: 'x.com', pathExact: ['/home'] }, 'https://x.com/home'),
    ).toBe(true);
    expect(
      matchesDisposableRule({ hostname: 'e.com', pathPrefix: '/docs' }, 'https://e.com/docs/intro'),
    ).toBe(true);
    expect(
      matchesDisposableRule(
        { hostnameEndsWith: '.atlassian.net', pathPrefix: '/' },
        'https://acme.atlassian.net/jira',
      ),
    ).toBe(true);
  });

  it('lets urlNotContains veto an otherwise matching URL', () => {
    // This is what makes "the Gmail inbox is disposable, an email isn't" work
    // as data rather than code.
    const rule = { hostname: 'mail.google.com', pathPrefix: '/', urlNotContains: ['#inbox/'] };
    expect(matchesDisposableRule(rule, 'https://mail.google.com/mail/u/0/#inbox')).toBe(true);
    expect(matchesDisposableRule(rule, 'https://mail.google.com/mail/u/0/#inbox/AbC123')).toBe(false);
  });

  it('never matches a rule with no hostname constraint', () => {
    // A half-filled options form must not capture every tab on the internet.
    expect(matchesDisposableRule({ pathPrefix: '/' }, 'https://anything.com/')).toBe(false);
  });

  it('returns false for malformed URLs', () => {
    expect(matchesDisposableRule({ hostname: 'x.com' }, 'nonsense')).toBe(false);
  });
});

describe('isDisposable with the shipped defaults', () => {
  it.each([
    ['https://mail.google.com/mail/u/0/#inbox', true],
    ['https://mail.google.com/mail/u/0/#inbox/FMfcgz123', false],
    ['https://x.com/home', true],
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

describe('findCustomGroup', () => {
  const rules = [
    { groupKey: 'jira', groupLabel: 'Jira', hostnameEndsWith: '.atlassian.net', pathPrefix: '/jira' },
    { groupKey: 'atlassian', groupLabel: 'Atlassian', hostnameEndsWith: '.atlassian.net' },
  ];

  it('returns the first matching rule, so order is meaningful', () => {
    expect(findCustomGroup('https://acme.atlassian.net/jira/x', rules)?.groupKey).toBe('jira');
    expect(findCustomGroup('https://acme.atlassian.net/wiki', rules)?.groupKey).toBe('atlassian');
    expect(findCustomGroup('https://example.com', rules)).toBeNull();
  });
});

describe('isDisposableDomain', () => {
  it('recognises hostnames and suffixes mentioned by any rule', () => {
    expect(isDisposableDomain('github.com', DEFAULT_DISPOSABLE_RULES)).toBe(true);
    expect(isDisposableDomain('example.com', DEFAULT_DISPOSABLE_RULES)).toBe(false);
    expect(isDisposableDomain('acme.atlassian.net', [{ hostnameEndsWith: '.atlassian.net' }])).toBe(true);
  });
});
