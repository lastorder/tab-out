import { describe, expect, it } from 'vitest';
import { escapeHtml, faviconUrl, plural } from '@/ui/html';

describe('escapeHtml', () => {
  it('escapes every character that could break out of markup', () => {
    expect(escapeHtml(`<script>"x" & 'y'</script>`)).toBe(
      '&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;',
    );
  });

  it('renders nullish values as empty rather than "null"/"undefined"', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('plural', () => {
  it('switches on exactly one, and supports irregular plurals', () => {
    expect(plural(1, 'tab')).toBe('1 tab');
    expect(plural(0, 'tab')).toBe('0 tabs');
    expect(plural(2, 'entry', 'entries')).toBe('2 entries');
  });
});

describe('faviconUrl', () => {
  it('builds an encoded favicon URL, or nothing without a hostname', () => {
    expect(faviconUrl('example.com', 32)).toBe(
      'https://www.google.com/s2/favicons?domain=example.com&sz=32',
    );
    expect(faviconUrl('a b.com')).toContain('a%20b.com');
    expect(faviconUrl('')).toBe('');
  });
});
