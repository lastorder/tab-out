import { describe, expect, it } from 'vitest';
import { attr, escapeHtml, faviconUrl, join, plural } from '@/ui/html';

describe('escapeHtml', () => {
  it('escapes every HTML-significant character', () => {
    expect(escapeHtml(`<script>"x" & 'y'</script>`)).toBe(
      '&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;',
    );
  });

  it('renders null and undefined as empty strings', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('stringifies non-strings', () => {
    expect(escapeHtml(42)).toBe('42');
  });
});

describe('attr', () => {
  it('escapes quotes so an attribute cannot be broken out of', () => {
    expect(attr('" onerror="alert(1)')).toBe('&quot; onerror=&quot;alert(1)');
  });
});

describe('plural', () => {
  it('uses the singular for exactly one', () => {
    expect(plural(1, 'tab')).toBe('1 tab');
    expect(plural(0, 'tab')).toBe('0 tabs');
    expect(plural(2, 'tab')).toBe('2 tabs');
  });

  it('accepts an irregular plural', () => {
    expect(plural(2, 'entry', 'entries')).toBe('2 entries');
  });
});

describe('join', () => {
  it('concatenates, skipping falsy fragments', () => {
    expect(join(['a', false, null, undefined, 'b'])).toBe('ab');
  });
});

describe('faviconUrl', () => {
  it('builds a favicon service URL', () => {
    expect(faviconUrl('example.com', 32)).toBe(
      'https://www.google.com/s2/favicons?domain=example.com&sz=32',
    );
  });

  it('URL-encodes the hostname', () => {
    expect(faviconUrl('a b.com')).toContain('a%20b.com');
  });

  it('returns an empty string when there is no hostname', () => {
    expect(faviconUrl('')).toBe('');
  });
});
