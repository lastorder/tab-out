/**
 * A Search box is rendered on more than one page, and its rules live in
 * `src/styles/search.css` — which `dashboard.css` deliberately does NOT
 * import, so each page must link it itself.
 *
 * That split already caused a real bug: `popup.html` was written against the
 * shared markup but shipped without the `<link>`, so the global Cmd+Shift+F
 * popup rendered with browser-default inputs and buttons instead of Tab Out's
 * styling. These checks fail loudly if a page renders search markup without
 * the stylesheet again.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');

/** Every page in `src/` that renders the Search markup. */
const PAGES = ['src/newtab/index.html', 'src/popup/popup.html'];

function read(relativePath: string): string {
  return readFileSync(path.join(ROOT, relativePath), 'utf8');
}

describe('search stylesheet wiring', () => {
  it.each(PAGES)('%s links styles/search.css', (page) => {
    expect(read(page)).toContain('href="styles/search.css"');
  });

  it('keeps the search rules out of dashboard.css, so the link is load-bearing', () => {
    // If dashboard.css ever imports search.css again, the checks above would
    // stop catching a missing <link> — the popup would silently look right
    // thanks to the import while the page-level wiring rotted.
    const dashboard = read('src/styles/dashboard.css');
    expect(dashboard).not.toMatch(/@import[^;]*search\.css/);
    expect(dashboard).not.toMatch(/^\.search-/m);
  });

  it('ships the stylesheet as a static asset in the build', () => {
    // A page linking a file the build never copies is just as broken.
    expect(read('scripts/build.mjs')).toContain("['styles/search.css', 'styles/search.css']");
  });
});
