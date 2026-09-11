import { describe, expect, it } from 'vitest';
import { findCustomGroup, isLandingDomain, isLandingPage, matchesLandingPattern } from '@/core/matching';
import { DEFAULT_LANDING_PATTERNS } from '@/config/defaults';

describe('matchesLandingPattern', () => {
  it('matches only the site root when no path constraint is given', () => {
    const rule = { hostname: 'github.com' };
    expect(matchesLandingPattern(rule, 'https://github.com/')).toBe(true);
    expect(matchesLandingPattern(rule, 'https://github.com/acme/app')).toBe(false);
  });

  it('supports exact paths, path prefixes, and subdomain suffixes', () => {
    expect(
      matchesLandingPattern({ hostname: 'x.com', pathExact: ['/home'] }, 'https://x.com/home'),
    ).toBe(true);
    expect(
      matchesLandingPattern({ hostname: 'e.com', pathPrefix: '/docs' }, 'https://e.com/docs/intro'),
    ).toBe(true);
    expect(
      matchesLandingPattern(
        { hostnameEndsWith: '.atlassian.net', pathPrefix: '/' },
        'https://acme.atlassian.net/jira',
      ),
    ).toBe(true);
  });

  it('lets urlNotContains veto an otherwise matching URL', () => {
    // This is what makes "the Gmail inbox is a homepage, an email isn't" work
    // as data rather than code.
    const rule = { hostname: 'mail.google.com', pathPrefix: '/', urlNotContains: ['#inbox/'] };
    expect(matchesLandingPattern(rule, 'https://mail.google.com/mail/u/0/#inbox')).toBe(true);
    expect(matchesLandingPattern(rule, 'https://mail.google.com/mail/u/0/#inbox/AbC123')).toBe(false);
  });

  it('never matches a rule with no hostname constraint', () => {
    // A half-filled options form must not capture every tab on the internet.
    expect(matchesLandingPattern({ pathPrefix: '/' }, 'https://anything.com/')).toBe(false);
  });

  it('returns false for malformed URLs', () => {
    expect(matchesLandingPattern({ hostname: 'x.com' }, 'nonsense')).toBe(false);
  });
});

describe('isLandingPage with the shipped defaults', () => {
  it.each([
    ['https://mail.google.com/mail/u/0/#inbox', true],
    ['https://mail.google.com/mail/u/0/#inbox/FMfcgz123', false],
    ['https://x.com/home', true],
    ['https://github.com/', true],
    ['https://github.com/acme/app/pull/1', false],
    ['https://example.com/', false],
  ])('%s → %s', (url, expected) => {
    expect(isLandingPage(url, DEFAULT_LANDING_PATTERNS)).toBe(expected);
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

describe('isLandingDomain', () => {
  it('recognises hostnames and suffixes mentioned by any rule', () => {
    expect(isLandingDomain('github.com', DEFAULT_LANDING_PATTERNS)).toBe(true);
    expect(isLandingDomain('example.com', DEFAULT_LANDING_PATTERNS)).toBe(false);
    expect(isLandingDomain('acme.atlassian.net', [{ hostnameEndsWith: '.atlassian.net' }])).toBe(true);
  });
});
