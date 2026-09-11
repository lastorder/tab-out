import { beforeEach, describe, expect, it } from 'vitest';
import { findDashboardTabNeedingMove } from '@/core/position';
import { resetTabIds, tab } from '../helpers/factories';

beforeEach(() => resetTabIds());

const DASHBOARD = 'chrome-extension://abc/index.html';
const URLS = [DASHBOARD, 'chrome://newtab/'];

describe('findDashboardTabNeedingMove', () => {
  it('returns null when there is no dashboard tab open', () => {
    const tabs = [tab('https://a.com/', { id: 1, windowId: 1, index: 0 })];
    expect(findDashboardTabNeedingMove(tabs, URLS)).toBeNull();
  });

  it('returns null when the dashboard is already the last tab in its window', () => {
    const tabs = [
      tab('https://a.com/', { id: 1, windowId: 1, index: 0 }),
      tab(DASHBOARD, { id: 2, windowId: 1, index: 1 }),
    ];
    expect(findDashboardTabNeedingMove(tabs, URLS)).toBeNull();
  });

  it('returns the dashboard tab id when something sits after it', () => {
    const tabs = [
      tab(DASHBOARD, { id: 1, windowId: 1, index: 0 }),
      tab('https://a.com/', { id: 2, windowId: 1, index: 1 }),
    ];
    expect(findDashboardTabNeedingMove(tabs, URLS)).toBe(1);
  });

  it('recognises chrome://newtab/ as the dashboard too', () => {
    const tabs = [
      tab('chrome://newtab/', { id: 1, windowId: 1, index: 0 }),
      tab('https://a.com/', { id: 2, windowId: 1, index: 1 }),
    ];
    expect(findDashboardTabNeedingMove(tabs, URLS)).toBe(1);
  });

  it('only considers tabs in the dashboard\u2019s own window', () => {
    const tabs = [
      tab(DASHBOARD, { id: 1, windowId: 1, index: 0 }),
      tab('https://a.com/', { id: 2, windowId: 1, index: 1 }),
      // A "later" tab in a different window must not affect this window's
      // dashboard — tab-bar order is per-window.
      tab('https://b.com/', { id: 3, windowId: 2, index: 5 }),
    ];
    expect(findDashboardTabNeedingMove(tabs, URLS)).toBe(1);
  });

  it('is a no-op when the dashboard is the only tab in its window', () => {
    const tabs = [tab(DASHBOARD, { id: 1, windowId: 1, index: 0 })];
    expect(findDashboardTabNeedingMove(tabs, URLS)).toBeNull();
  });
});
