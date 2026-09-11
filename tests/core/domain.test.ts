import { describe, expect, it } from 'vitest';
import { friendlyDomain } from '@/core/domain';

describe('friendlyDomain', () => {
  it.each([
    // Known brands come from the lookup table.
    ['mail.google.com', 'Gmail'],
    ['news.ycombinator.com', 'Hacker News'],
    ['twitter.com', 'X'],
    ['local-files', 'Local Files'],
    // Pattern rules.
    ['zara.substack.com', "Zara's Substack"],
    ['substack.com', 'Substack'],
    ['myproject.github.io', 'Myproject (GitHub Pages)'],
    // Fallback: drop www and the TLD, capitalise what's left.
    ['www.mysite.com', 'Mysite'],
    ['cool-tool.dev', 'Cool-tool'],
    ['api.staging.acme.io', 'Api Staging Acme'],
  ])('renders %s as "%s"', (hostname, expected) => {
    expect(friendlyDomain(hostname)).toBe(expected);
  });

  it('returns an empty string for missing input', () => {
    expect(friendlyDomain('')).toBe('');
    expect(friendlyDomain(null)).toBe('');
  });
});
