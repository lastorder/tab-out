import { describe, expect, it } from 'vitest';
import { capitalize, friendlyDomain } from '@/core/domain';

describe('capitalize', () => {
  it('uppercases the first character only', () => {
    expect(capitalize('hello world')).toBe('Hello world');
  });

  it('handles empty input', () => {
    expect(capitalize('')).toBe('');
  });
});

describe('friendlyDomain', () => {
  it('maps known hostnames to brand names', () => {
    expect(friendlyDomain('mail.google.com')).toBe('Gmail');
    expect(friendlyDomain('news.ycombinator.com')).toBe('Hacker News');
    expect(friendlyDomain('x.com')).toBe('X');
    expect(friendlyDomain('twitter.com')).toBe('X');
  });

  it('names personal Substacks after their author', () => {
    expect(friendlyDomain('zara.substack.com')).toBe("Zara's Substack");
  });

  it('does not treat the Substack root as a personal newsletter', () => {
    expect(friendlyDomain('substack.com')).toBe('Substack');
  });

  it('labels GitHub Pages sites', () => {
    expect(friendlyDomain('myproject.github.io')).toBe('Myproject (GitHub Pages)');
  });

  it('strips www and the TLD from unknown domains', () => {
    expect(friendlyDomain('www.mysite.com')).toBe('Mysite');
    expect(friendlyDomain('cool-tool.dev')).toBe('Cool-tool');
  });

  it('capitalises each remaining label of a subdomain', () => {
    expect(friendlyDomain('api.staging.acme.io')).toBe('Api Staging Acme');
  });

  it('handles the local-files bucket', () => {
    expect(friendlyDomain('local-files')).toBe('Local Files');
  });

  it('returns an empty string for empty input', () => {
    expect(friendlyDomain('')).toBe('');
    expect(friendlyDomain(null)).toBe('');
  });
});
