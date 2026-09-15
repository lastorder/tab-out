import { beforeEach, describe, expect, it } from 'vitest';
import {
  GLOBAL_DASHBOARD_COMMAND,
  GLOBAL_SEARCH_COMMAND,
  planGlobalCommand,
  type GlobalCommandContext,
} from '@/core/global-commands';
import { resetTabIds, tab } from '../helpers/factories';

beforeEach(() => resetTabIds());

const DASHBOARD = 'chrome-extension://abc/index.html';
const DASHBOARD_PAGE = 'chrome-extension://abc/index.html';

function context(overrides: Partial<GlobalCommandContext> = {}): GlobalCommandContext {
  return {
    settings: { globalSearchShortcutEnabled: false, globalDashboardShortcutEnabled: false },
    tabs: [],
    dashboardUrls: [DASHBOARD, 'chrome://newtab/'],
    dashboardPageUrl: DASHBOARD_PAGE,
    ...overrides,
  };
}

describe('planGlobalCommand — off by default', () => {
  // The whole point of the feature: a fresh install must not act on either
  // shortcut until the user arms it, even though Chrome has already reserved
  // the chord.
  it('does nothing for either command when its feature is switched off', () => {
    expect(planGlobalCommand(GLOBAL_SEARCH_COMMAND, context())).toBeNull();
    expect(planGlobalCommand(GLOBAL_DASHBOARD_COMMAND, context())).toBeNull();
  });

  it('ignores a command name it does not know', () => {
    expect(planGlobalCommand('not-a-command', context())).toBeNull();
  });

  it('arms each shortcut independently', () => {
    const searchOnly = context({
      settings: { globalSearchShortcutEnabled: true, globalDashboardShortcutEnabled: false },
    });
    expect(planGlobalCommand(GLOBAL_SEARCH_COMMAND, searchOnly)).toEqual({
      kind: 'open-search-popup',
    });
    expect(planGlobalCommand(GLOBAL_DASHBOARD_COMMAND, searchOnly)).toBeNull();
  });
});

describe('planGlobalCommand — dashboard', () => {
  const armed = context({
    settings: { globalSearchShortcutEnabled: false, globalDashboardShortcutEnabled: true },
  });

  it('opens the dashboard page when none is open — the "not my new tab page" case', () => {
    expect(planGlobalCommand(GLOBAL_DASHBOARD_COMMAND, armed)).toEqual({
      kind: 'open-dashboard',
      url: DASHBOARD_PAGE,
    });
  });

  it('focuses an open dashboard instead of opening a second one', () => {
    const withDashboard = {
      ...armed,
      tabs: [tab('https://a.com/'), tab(DASHBOARD, { id: 7, windowId: 3 })],
    };
    expect(planGlobalCommand(GLOBAL_DASHBOARD_COMMAND, withDashboard)).toEqual({
      kind: 'focus-dashboard',
      tabId: 7,
      windowId: 3,
    });
  });

  it('does nothing when the dashboard is already the active tab', () => {
    // Common when Tab Out *is* the new tab page: pressing the shortcut there
    // must not spawn a duplicate dashboard.
    const activeDashboard = {
      ...armed,
      tabs: [tab(DASHBOARD, { id: 4, active: true })],
    };
    expect(planGlobalCommand(GLOBAL_DASHBOARD_COMMAND, activeDashboard)).toBeNull();
  });

  it('focuses the open dashboard when a different tab is focused', () => {
    // Both dashboards exist, neither is focused — the active-preference only
    // matters once something needs to be activated.
    const twoDashboards = {
      ...armed,
      tabs: [
        tab(DASHBOARD, { id: 1, windowId: 1 }),
        tab(DASHBOARD, { id: 2, windowId: 2 }),
      ],
    };
    expect(planGlobalCommand(GLOBAL_DASHBOARD_COMMAND, twoDashboards)).toEqual({
      kind: 'focus-dashboard',
      tabId: 1,
      windowId: 1,
    });
  });

  it('treats chrome://newtab/ as the dashboard too', () => {
    const asNewtab = { ...armed, tabs: [tab('chrome://newtab/', { id: 9, windowId: 1 })] };
    expect(planGlobalCommand(GLOBAL_DASHBOARD_COMMAND, asNewtab)).toEqual({
      kind: 'focus-dashboard',
      tabId: 9,
      windowId: 1,
    });
  });
});
