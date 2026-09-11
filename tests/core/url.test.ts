import { describe, expect, it } from 'vitest';
import {
  groupKeyOf,
  hostnameOf,
  isInternalUrl,
  LOCAL_FILES_KEY,
  normalizeUrlInput,
  parseUrl,
  stripWww,
} from '@/core/url';

describe('parseUrl', () => {
  it('parses a valid URL', () => {
    expect(parseUrl('https://example.com/a')?.hostname).toBe('example.com');
  });

  it('returns null instead of throwing on junk', () => {
    expect(parseUrl('not a url')).toBeNull();
    expect(parseUrl('')).toBeNull();
    expect(parseUrl(undefined)).toBeNull();
    expect(parseUrl(null)).toBeNull();
  });
});

describe('hostnameOf', () => {
  it('extracts hostnames', () => {
    expect(hostnameOf('https://www.github.com/a/b')).toBe('www.github.com');
  });

  it('returns an empty string for unparseable input', () => {
    expect(hostnameOf('garbage')).toBe('');
  });

  it('returns an empty string for file URLs, which have no host', () => {
    expect(hostnameOf('file:///Users/me/notes.md')).toBe('');
  });
});

describe('groupKeyOf', () => {
  it('groups all local files together', () => {
    expect(groupKeyOf('file:///Users/me/a.md')).toBe(LOCAL_FILES_KEY);
    expect(groupKeyOf('file:///tmp/b.txt')).toBe(LOCAL_FILES_KEY);
  });

  it('groups web pages by hostname', () => {
    expect(groupKeyOf('https://example.com/deep/path')).toBe('example.com');
  });

  it('keeps ports out of the key but subdomains in it', () => {
    expect(groupKeyOf('http://localhost:3000/x')).toBe('localhost');
    expect(groupKeyOf('https://gist.github.com/x')).toBe('gist.github.com');
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

  it('treats missing URLs as internal so they are never rendered', () => {
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
  it('adds https:// to a bare hostname', () => {
    expect(normalizeUrlInput('example.com')).toBe('https://example.com/');
  });

  it('preserves an existing scheme', () => {
    expect(normalizeUrlInput('http://example.com/x')).toBe('http://example.com/x');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeUrlInput('  example.com  ')).toBe('https://example.com/');
  });

  it('keeps paths, queries and fragments', () => {
    expect(normalizeUrlInput('example.com/a?b=1#c')).toBe('https://example.com/a?b=1#c');
  });

  it('rejects input with no hostname', () => {
    expect(normalizeUrlInput('')).toBe('');
    expect(normalizeUrlInput('   ')).toBe('');
    expect(normalizeUrlInput('https://')).toBe('');
  });
});
