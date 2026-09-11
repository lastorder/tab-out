import { describe, expect, it } from 'vitest';
import { renderIssues, renderSection } from '@/options/render';
import { settingsToDraft } from '@/options/draft';
import { createDefaultSettings } from '@/config/defaults';

const draft = settingsToDraft(createDefaultSettings());
const emptyDraft = { pinned: [], landing: [], custom: [] };

describe('renderSection', () => {
  it('renders one row per pinned site, tagged for the event delegate', () => {
    const html = renderSection('pinned', draft);
    expect(html.match(/class="row row-pinned"/g)).toHaveLength(3);
    expect(html).toContain('data-section="pinned"');
    expect(html).toContain('data-field="url"');
    expect(html).toContain('value="https://mail.google.com/"');
  });

  it('renders the homepage rule fields', () => {
    const html = renderSection('landing', draft);
    expect(html).toContain('data-field="hostname"');
    expect(html).toContain('data-field="pathPrefix"');
    expect(html).toContain('data-field="pathExact"');
    expect(html).toContain('data-field="urlNotContains"');
  });

  it('renders custom group fields', () => {
    const html = renderSection('custom', {
      ...emptyDraft,
      custom: [{ groupKey: 'work', groupLabel: 'Work', hostname: '.acme.net', pathPrefix: '' }],
    });
    expect(html).toContain('data-field="groupKey"');
    expect(html).toContain('value="work"');
  });

  it('disables move-up on the first row and move-down on the last', () => {
    const html = renderSection('pinned', draft);
    const rows = html.split('class="row row-pinned"').slice(1);

    expect(rows[0]).toContain('data-action="move-up"');
    expect(rows[0]).toMatch(/move-up"[^>]*disabled/);
    expect(rows[2]).toMatch(/move-down"[^>]*disabled/);
    expect(rows[1]).not.toMatch(/move-up"[^>]*disabled/);
  });

  it('gives every row a remove button', () => {
    expect(renderSection('pinned', draft).match(/data-action="remove"/g)).toHaveLength(3);
  });

  it('shows a helpful message when a table is empty', () => {
    expect(renderSection('pinned', emptyDraft)).toContain('No pinned sites yet');
    expect(renderSection('landing', emptyDraft)).toContain('Homepages card will stay empty');
    expect(renderSection('custom', emptyDraft)).toContain('tabs group by hostname');
  });

  it('escapes hostile values instead of injecting them', () => {
    const html = renderSection('pinned', {
      ...emptyDraft,
      pinned: [{ url: '"><script>alert(1)</script>', label: '' }],
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&quot;&gt;&lt;script&gt;');
  });

  it('emits no inline event handlers', () => {
    expect(renderSection('pinned', draft)).not.toMatch(/\son\w+=/);
  });
});

describe('renderIssues', () => {
  it('renders nothing when there are no issues', () => {
    expect(renderIssues([])).toBe('');
  });

  it('uses singular wording for a single issue', () => {
    const html = renderIssues([{ path: 'pinnedSites[0]', message: 'Missing or invalid URL.' }]);
    expect(html).toContain('1 entry was');
    expect(html).toContain('pinnedSites[0]');
    expect(html).toContain('Missing or invalid URL.');
  });

  it('uses plural wording for several issues', () => {
    const html = renderIssues([
      { path: 'a', message: 'x' },
      { path: 'b', message: 'y' },
    ]);
    expect(html).toContain('2 entries were');
    expect(html.match(/<li>/g)).toHaveLength(2);
  });
});
