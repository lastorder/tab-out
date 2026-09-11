import { describe, expect, it } from 'vitest';
import { groupKeyOf, hostnameOf, isInternalUrl, normalizeUrlInput, stripWww } from '@/core/url';

describe('hostnameOf', () => {
  it('extracts the hostname, and returns empty for anything unparseable', () => {
    expect(hostnameOf('https://www.github.com/a/b')).toBe('www.github.com');
    expect(hostnameOf('garbage')).toBe('');
    // file:// URLs genuinely have no host — that's why groupKeyOf exists.
    expect(hostnameOf('file:///Users/me/notes.md')).toBe('');
  });
});

describe('groupKeyOf', () => {
  it('groups web pages by hostname, keeping subdomains distinct', () => {
    expect(groupKeyOf('https://example.com/deep/path')).toBe('example.com');
    expect(groupKeyOf('https://gist.github.com/x')).toBe('gist.github.com');
    expect(groupKeyOf('http://localhost:3000/x')).toBe('localhost');
  });

  it('collects every local file into one bucket', () => {
    expect(groupKeyOf('file:///Users/me/a.md')).toBe('local-files');
    expect(groupKeyOf('file:///tmp/b.txt')).toBe('local-files');
  });
});

describe('isInternalUrl', () => {
  it.each([
    'chrome://newtab/',
    'chrome-extension://abc/index.html',
    'about:blank',
    'edge://settings',
    'brave://bookmarks',
    'devtools://devtools/bundled/inspector.html',
  ])('treats %s as internal', (url) => {
    expect(isInternalUrl(url)).toBe(true);
  });

  it.each(['https://example.com', 'http://localhost:3000', 'file:///tmp/a.txt'])(
    'treats %s as a real page',
    (url) => {
      expect(isInternalUrl(url)).toBe(false);
    },
  );

  it('treats a missing URL as internal, so half-loaded tabs never render', () => {
    expect(isInternalUrl('')).toBe(true);
    expect(isInternalUrl(undefined)).toBe(true);
  });
});

describe('stripWww', () => {
  it('removes only a leading www', () => {
    expect(stripWww('www.example.com')).toBe('example.com');
    expect(stripWww('wwwx.example.com')).toBe('wwwx.example.com');
    expect(stripWww('api.www.example.com')).toBe('api.www.example.com');
  });
});

describe('normalizeUrlInput', () => {
  it('completes what the user typed into a usable URL', () => {
    expect(normalizeUrlInput('example.com')).toBe('https://example.com/');
    expect(normalizeUrlInput('  example.com  ')).toBe('https://example.com/');
    expect(normalizeUrlInput('http://example.com/x')).toBe('http://example.com/x');
    expect(normalizeUrlInput('example.com/a?b=1#c')).toBe('https://example.com/a?b=1#c');
  });

  it('rejects input with no hostname', () => {
    expect(normalizeUrlInput('')).toBe('');
    expect(normalizeUrlInput('   ')).toBe('');
    expect(normalizeUrlInput('https://')).toBe('');
  });
});
