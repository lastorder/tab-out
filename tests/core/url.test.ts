import { describe, expect, it } from 'vitest';
import { groupKeyOf, hostnameOf, isInternalUrl, normalizeUrlInput, registrableDomainOf, stripWww } from '@/core/url';

describe('hostnameOf', () => {
  it('extracts the hostname, and returns empty for anything unparseable', () => {
    expect(hostnameOf('https://www.github.com/a/b')).toBe('www.github.com');
    expect(hostnameOf('garbage')).toBe('');
    // file:// URLs genuinely have no host — that's why groupKeyOf exists.
    expect(hostnameOf('file:///Users/me/notes.md')).toBe('');
  });
});

describe('registrableDomainOf', () => {
  it('collapses subdomains to the registrable domain', () => {
    expect(registrableDomainOf('mail.google.com')).toBe('google.com');
    expect(registrableDomainOf('calendar.google.com')).toBe('google.com');
    expect(registrableDomainOf('gist.github.com')).toBe('github.com');
    expect(registrableDomainOf('example.com')).toBe('example.com');
  });

  it('keeps a known two-label public suffix intact', () => {
    expect(registrableDomainOf('news.bbc.co.uk')).toBe('bbc.co.uk');
    expect(registrableDomainOf('acme.com.cn')).toBe('acme.com.cn');
  });

  it('leaves hosts with two labels or fewer, and IP addresses, unchanged', () => {
    expect(registrableDomainOf('localhost')).toBe('localhost');
    expect(registrableDomainOf('example.com')).toBe('example.com');
    expect(registrableDomainOf('127.0.0.1')).toBe('127.0.0.1');
  });

  it('returns empty for an empty hostname', () => {
    expect(registrableDomainOf('')).toBe('');
  });
});

describe('groupKeyOf', () => {
  it('groups web pages by registrable domain, merging subdomains of the same site', () => {
    expect(groupKeyOf('https://example.com/deep/path')).toBe('example.com');
    expect(groupKeyOf('https://gist.github.com/x')).toBe('github.com');
    expect(groupKeyOf('https://mail.google.com/')).toBe('google.com');
    expect(groupKeyOf('https://calendar.google.com/')).toBe('google.com');
    expect(groupKeyOf('http://localhost:3000/x')).toBe('localhost');
  });

  it('collects every local file into one bucket', () => {
    expect(groupKeyOf('file:///Users/me/a.md')).toBe('local-files');
    expect(groupKeyOf('file:///tmp/b.txt')).toBe('local-files');
  });
});

describe('isInternalUrl', () => {
  it.each([
    // The dashboard itself, in disguise — this exact URL, not the chrome://
    // scheme in general.
    'chrome://newtab/',
    'chrome-extension://abc/index.html',
    'about:blank',
    'devtools://devtools/bundled/inspector.html',
  ])('treats %s as internal', (url) => {
    expect(isInternalUrl(url)).toBe(true);
  });

  it.each([
    'https://example.com',
    'http://localhost:3000',
    'file:///tmp/a.txt',
    // Browser system pages are real tabs the user opens on purpose — they
    // should group, close and get recorded into history like any other.
    'chrome://extensions/',
    'chrome://settings/',
    'edge://settings',
    'brave://bookmarks',
  ])('treats %s as a real page', (url) => {
    expect(isInternalUrl(url)).toBe(false);
  });

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
