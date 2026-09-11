import { describe, expect, it } from 'vitest';
import { enforceSingleDashboard } from '@/newtab/singleton';
import { TabActions } from '@/services/tab-actions';
import { createFakeBrowser } from '../helpers/fake-browser';
import { tab } from '../helpers/factories';

const EXT_ID = 'abcdef';
const DASHBOARD = `chrome-extension://${EXT_ID}/index.html`;

describe('enforceSingleDashboard', () => {
  it('closes every other Tab Out page, keeping the current one', async () => {
    const browser = createFakeBrowser(
      [
        tab(DASHBOARD, { id: 1 }),
        tab(DASHBOARD, { id: 2 }),
        tab('chrome://newtab/', { id: 3 }),
        tab('https://example.com/', { id: 4 }),
      ],
      { currentTabId: 2 },
    );

    const closed = await enforceSingleDashboard(browser, new TabActions(browser), EXT_ID);

    expect(closed).toBe(2);
    expect(browser.tabs.map((t) => t.id)).toEqual([2, 4]);
  });

  it('never closes ordinary pages', async () => {
    const browser = createFakeBrowser(
      [tab(DASHBOARD, { id: 1 }), tab('https://example.com/', { id: 2 })],
      { currentTabId: 1 },
    );

    await enforceSingleDashboard(browser, new TabActions(browser), EXT_ID);
    expect(browser.tabs.map((t) => t.id)).toEqual([1, 2]);
  });

  it('does nothing when the current tab id is unknown', async () => {
    const browser = createFakeBrowser([tab(DASHBOARD, { id: 1 }), tab(DASHBOARD, { id: 2 })], {
      currentTabId: -1,
    });

    expect(await enforceSingleDashboard(browser, new TabActions(browser), EXT_ID)).toBe(0);
    expect(browser.closed).toEqual([]);
  });

  it('swallows browser errors so the dashboard still renders', async () => {
    const browser = createFakeBrowser([], { currentTabId: 1 });
    browser.currentTabId = () => Promise.reject(new Error('no tab'));

    expect(await enforceSingleDashboard(browser, new TabActions(browser), EXT_ID)).toBe(0);
  });
});
