import { describe, expect, it } from 'vitest';
import { renderHistoryEmpty, renderHistoryItem, renderHistoryList } from '@/ui/render/history';
import { historyEntry } from '../helpers/factories';

const now = new Date('2026-04-04T12:00:00.000Z');

describe('renderHistoryItem', () => {
  it('shows title, domain and relative time', () => {
    const entry = historyEntry('https://example.com/x', {
      title: 'Example Page',
      closedAt: '2026-04-04T10:00:00.000Z',
    });
    const html = renderHistoryItem(entry, now);

    expect(html).toContain('Example Page');
    expect(html).toContain('example.com');
    expect(html).toContain('2 hrs ago');
  });

  it('carries the reopen and remove actions with the entry id and url', () => {
    const entry = historyEntry('https://example.com/x', { id: 'abc' });
    const html = renderHistoryItem(entry, now);

    expect(html).toContain('data-action="reopen-history"');
    expect(html).toContain('data-action="remove-history"');
    expect(html).toContain('data-history-id="abc"');
    expect(html).toContain('data-history-url="https://example.com/x"');
  });

  it('falls back to the URL when there is no title', () => {
    const entry = historyEntry('https://example.com/x', { title: '' });
    expect(renderHistoryItem(entry, now)).toContain('https://example.com/x');
  });

  it('escapes a hostile title', () => {
    const entry = historyEntry('https://a.com/', { title: '<img src=x onerror=alert(1)>' });
    const html = renderHistoryItem(entry, now);
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img');
  });

  it('escapes a hostile URL so it cannot break out of an attribute', () => {
    const entry = historyEntry('https://a.com/?q="><script>alert(1)</script>');
    expect(renderHistoryItem(entry, now)).not.toContain('"><script>');
  });

  it('emits no inline event handlers', () => {
    expect(renderHistoryItem(historyEntry('https://a.com/'), now)).not.toMatch(/\son\w+=/);
  });
});

describe('renderHistoryEmpty', () => {
  it('explains there is nothing yet', () => {
    expect(renderHistoryEmpty(false)).toContain('No closed tabs yet');
  });

  it('explains a search came up empty, distinctly from a truly empty list', () => {
    expect(renderHistoryEmpty(true)).toContain('No matching closed tabs');
    expect(renderHistoryEmpty(true)).not.toContain('No closed tabs yet');
  });
});

describe('renderHistoryList', () => {
  it('renders one row per entry', () => {
    const entries = [historyEntry('https://a.com/'), historyEntry('https://b.com/')];
    const html = renderHistoryList(entries, false, now);
    expect(html.match(/class="history-item"/g)).toHaveLength(2);
  });

  it('renders the empty state instead when there are no entries', () => {
    expect(renderHistoryList([], false, now)).toContain('No closed tabs yet');
    expect(renderHistoryList([], true, now)).toContain('No matching closed tabs');
  });
});
