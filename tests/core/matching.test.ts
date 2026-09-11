import { describe, expect, it } from 'vitest';
import {
  findCustomGroup,
  isLandingDomain,
  isLandingPage,
  matchesCustomGroup,
  matchesLandingPattern,
} from '@/core/matching';
import { DEFAULT_LANDING_PATTERNS } from '@/config/defaults';

describe('matchesLandingPattern', () => {
  it('matches only the site root when no path constraint is given', () => {
    const rule = { hostname: 'github.com' };
    expect(matchesLandingPattern(rule, 'https://github.com/')).toBe(true);
    expect(matchesLandingPattern(rule, 'https://github.com/acme/app')).toBe(false);
  });

  it('matches an exact path list', () => {
    const rule = { hostname: 'x.com', pathExact: ['/home', '/explore'] };
    expect(matchesLandingPattern(rule, 'https://x.com/home')).toBe(true);
    expect(matchesLandingPattern(rule, 'https://x.com/explore')).toBe(true);
    expect(matchesLandingPattern(rule, 'https://x.com/zara')).toBe(false);
  });

  it('matches a path prefix', () => {
    const rule = { hostname: 'example.com', pathPrefix: '/docs' };
    expect(matchesLandingPattern(rule, 'https://example.com/docs/intro')).toBe(true);
    expect(matchesLandingPattern(rule, 'https://example.com/blog')).toBe(false);
  });

  it('matches subdomains with hostnameEndsWith', () => {
    const rule = { hostnameEndsWith: '.atlassian.net', pathPrefix: '/' };
    expect(matchesLandingPattern(rule, 'https://acme.atlassian.net/jira')).toBe(true);
    expect(matchesLandingPattern(rule, 'https://atlassian.com/jira')).toBe(false);
  });

  it('lets urlNotContains veto an otherwise matching URL', () => {
    const rule = {
      hostname: 'mail.google.com',
      pathPrefix: '/',
      urlNotContains: ['#inbox/'],
    };
    expect(matchesLandingPattern(rule, 'https://mail.google.com/mail/u/0/#inbox')).toBe(true);
    expect(matchesLandingPattern(rule, 'https://mail.google.com/mail/u/0/#inbox/AbC123')).toBe(
      false,
    );
  });

  it('never matches a rule with no hostname constraint', () => {
    expect(matchesLandingPattern({ pathPrefix: '/' }, 'https://anything.com/')).toBe(false);
  });

  it('returns false for malformed URLs', () => {
    expect(matchesLandingPattern({ hostname: 'x.com' }, 'nonsense')).toBe(false);
  });
});

describe('isLandingPage with shipped defaults', () => {
  it('treats the Gmail inbox as a homepage but a thread as content', () => {
    expect(isLandingPage('https://mail.google.com/mail/u/0/#inbox', DEFAULT_LANDING_PATTERNS)).toBe(
      true,
    );
    expect(
      isLandingPage('https://mail.google.com/mail/u/0/#inbox/FMfcgz123', DEFAULT_LANDING_PATTERNS),
    ).toBe(false);
  });

  it('treats the X and GitHub front pages as homepages', () => {
    expect(isLandingPage('https://x.com/home', DEFAULT_LANDING_PATTERNS)).toBe(true);
    expect(isLandingPage('https://github.com/', DEFAULT_LANDING_PATTERNS)).toBe(true);
  });

  it('leaves content pages out of the Homepages group', () => {
    expect(isLandingPage('https://github.com/acme/app/pull/1', DEFAULT_LANDING_PATTERNS)).toBe(
      false,
    );
    expect(isLandingPage('https://example.com/', DEFAULT_LANDING_PATTERNS)).toBe(false);
  });
});

describe('matchesCustomGroup', () => {
  const rule = {
    groupKey: 'jira',
    groupLabel: 'Jira',
    hostnameEndsWith: '.atlassian.net',
    pathPrefix: '/jira',
  };

  it('matches host suffix plus path prefix', () => {
    expect(matchesCustomGroup(rule, 'https://acme.atlassian.net/jira/board/1')).toBe(true);
  });

  it('rejects the right host with the wrong path', () => {
    expect(matchesCustomGroup(rule, 'https://acme.atlassian.net/wiki/page')).toBe(false);
  });

  it('matches any path when no prefix is set', () => {
    const loose = { groupKey: 'k', groupLabel: 'K', hostname: 'example.com' };
    expect(matchesCustomGroup(loose, 'https://example.com/anything')).toBe(true);
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
  });

  it('returns null when nothing matches', () => {
    expect(findCustomGroup('https://example.com', rules)).toBeNull();
  });
});

describe('isLandingDomain', () => {
  it('recognises hostnames mentioned by any rule', () => {
    expect(isLandingDomain('github.com', DEFAULT_LANDING_PATTERNS)).toBe(true);
    expect(isLandingDomain('example.com', DEFAULT_LANDING_PATTERNS)).toBe(false);
  });

  it('recognises suffix rules', () => {
    expect(isLandingDomain('acme.atlassian.net', [{ hostnameEndsWith: '.atlassian.net' }])).toBe(
      true,
    );
  });
});
