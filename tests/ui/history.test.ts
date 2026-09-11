import { describe, expect, it } from 'vitest';
import { renderHistoryList } from '@/ui/render/history';
import { historyEntry } from '../helpers/factories';

const now = new Date('2026-04-04T12:00:00.000Z');
const render = (entry: Parameters<typeof historyEntry>[1] & object = {}) =>
  renderHistoryList([historyEntry('https://example.com/x', entry)], false, now);

describe('renderHistoryList', () => {
  it('shows title, domain and how long ago it closed', () => {
    const html = render({ title: 'Example Page', closedAt: '2026-04-04T10:00:00.000Z' });
    expect(html).toContain('Example Page');
    expect(html).toContain('example.com');
    expect(html).toContain('2 hrs ago');
  });

  it('carries reopen and remove actions with the entry id and url', () => {
    const html = render({ id: 'abc' });
    expect(html).toContain('data-action="reopen-history"');
    expect(html).toContain('data-action="remove-history"');
    expect(html).toContain('data-history-id="abc"');
    expect(html).toContain('data-history-url="https://example.com/x"');
  });

  it('renders one row per entry', () => {
    const html = renderHistoryList(
      [historyEntry('https://a.com/'), historyEntry('https://b.com/')],
      false,
      now,
    );
    expect(html.match(/class="history-item"/g)).toHaveLength(2);
  });

  it('distinguishes an empty list from an empty search', () => {
    expect(renderHistoryList([], false, now)).toContain('No closed tabs yet');
    expect(renderHistoryList([], true, now)).toContain('No matching closed tabs');
  });

  it('escapes hostile titles and URLs so they cannot become markup', () => {
    const hostile = renderHistoryList(
      [historyEntry('https://a.com/?q="><script>alert(1)</script>', {
        title: '<img src=x onerror=alert(1)>',
      })],
      false,
      now,
    );
    expect(hostile).not.toContain('<img src=x onerror=alert(1)>');
    expect(hostile).not.toContain('"><script>');
    expect(hostile).toContain('&lt;img');
  });

  it('emits no inline event handlers, which MV3 would block anyway', () => {
    expect(render({ title: 'Ordinary page' })).not.toMatch(/\son\w+=/);
  });
});
