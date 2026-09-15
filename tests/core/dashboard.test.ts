import { beforeEach, describe, expect, it } from 'vitest';
import { dashboardUrls, findDashboardTab, findDashboardTabNeedingMove } from '@/core/dashboard';
import { resetTabIds, tab } from '../helpers/factories';

beforeEach(() => resetTabIds());

const DASHBOARD = 'chrome-extension://abc/index.html';
const URLS = [DASHBOARD, 'chrome://newtab/'];

describe('dashboardUrls', () => {
  it('covers both forms Chrome reports for an overridden new tab', () => {
    const urls = dashboardUrls('abcdef');
    expect(urls).toContain('chrome-extension://abcdef/index.html');
    expect(urls).toContain('chrome://newtab/');
  });
});

describe('findDashboardTabNeedingMove', () => {
  it('reports the dashboard when something sits after it', () => {
    const tabs = [
      tab(DASHBOARD, { id: 1, windowId: 1, index: 0 }),
      tab('https://a.com/', { id: 2, windowId: 1, index: 1 }),
    ];
    expect(findDashboardTabNeedingMove(tabs, URLS)).toBe(1);
  });

  it('does nothing when the dashboard is already last, alone, or absent', () => {
    const last = [
      tab('https://a.com/', { id: 1, windowId: 1, index: 0 }),
      tab(DASHBOARD, { id: 2, windowId: 1, index: 1 }),
    ];
    expect(findDashboardTabNeedingMove(last, URLS)).toBeNull();
    expect(findDashboardTabNeedingMove([tab(DASHBOARD, { id: 1, index: 0 })], URLS)).toBeNull();
    expect(findDashboardTabNeedingMove([tab('https://a.com/', { id: 1 })], URLS)).toBeNull();
  });

  it('only considers the dashboard\u2019s own window — tab order is per-window', () => {
    const tabs = [
      tab(DASHBOARD, { id: 1, windowId: 1, index: 0 }),
      tab('https://a.com/', { id: 2, windowId: 1, index: 1 }),
      tab('https://b.com/', { id: 3, windowId: 2, index: 5 }),
    ];
    expect(findDashboardTabNeedingMove(tabs, URLS)).toBe(1);
  });
});

describe('findDashboardTab', () => {
  it('returns null when no dashboard is open', () => {
    expect(findDashboardTab([tab('https://a.com/')], URLS)).toBeNull();
  });

  it('prefers the active dashboard so the user lands where they left off', () => {
    const tabs = [
      tab(DASHBOARD, { id: 1, windowId: 1 }),
      tab(DASHBOARD, { id: 2, windowId: 2, active: true }),
    ];
    expect(findDashboardTab(tabs, URLS)?.id).toBe(2);
  });

  it('falls back to any dashboard when none is active', () => {
    const tabs = [tab('https://a.com/'), tab('chrome://newtab/', { id: 5 })];
    expect(findDashboardTab(tabs, URLS)?.id).toBe(5);
  });
});
