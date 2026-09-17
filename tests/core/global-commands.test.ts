import { beforeEach, describe, expect, it } from 'vitest';
import {
  GLOBAL_DASHBOARD_COMMAND,
  planGlobalCommand,
  type GlobalCommandContext,
} from '@/core/global-commands';
import { resetTabIds, tab } from '../helpers/factories';

beforeEach(() => resetTabIds());

const DASHBOARD = 'chrome-extension://abc/index.html';
const DASHBOARD_PAGE = 'chrome-extension://abc/index.html';

function context(overrides: Partial<GlobalCommandContext> = {}): GlobalCommandContext {
  return {
    tabs: [],
    dashboardUrls: [DASHBOARD, 'chrome://newtab/'],
    dashboardPageUrl: DASHBOARD_PAGE,
    ...overrides,
  };
}

describe('planGlobalCommand — unknown commands', () => {
  it('ignores a command name it does not know', () => {
    expect(planGlobalCommand('not-a-command', context())).toBeNull();
  });

  // Note there is no equivalent test for opening the Search box: that's
  // Chrome's own `_execute_action` command (see `manifest.json`), which
  // never reaches `chrome.commands.onCommand` at all, so `planGlobalCommand`
  // has nothing to decide for it. There is likewise no "off by default" test
  // for `global-dashboard` any more — it has no settings flag gating it,
  // see the doc comment in `core/global-commands.ts`.
});

describe('planGlobalCommand — dashboard', () => {
  it('opens the dashboard page when none is open — the "not my new tab page" case', () => {
    expect(planGlobalCommand(GLOBAL_DASHBOARD_COMMAND, context())).toEqual({
      kind: 'open-dashboard',
      url: DASHBOARD_PAGE,
    });
  });

  it('focuses an open dashboard instead of opening a second one', () => {
    const withDashboard = context({
      tabs: [tab('https://a.com/'), tab(DASHBOARD, { id: 7, windowId: 3 })],
    });
    expect(planGlobalCommand(GLOBAL_DASHBOARD_COMMAND, withDashboard)).toEqual({
      kind: 'focus-dashboard',
      tabId: 7,
      windowId: 3,
    });
  });

  it('does nothing when the dashboard is already the active tab', () => {
    // Common when Tab Out *is* the new tab page: pressing the shortcut there
    // must not spawn a duplicate dashboard.
    const activeDashboard = context({
      tabs: [tab(DASHBOARD, { id: 4, active: true })],
    });
    expect(planGlobalCommand(GLOBAL_DASHBOARD_COMMAND, activeDashboard)).toBeNull();
  });

  it('focuses the open dashboard when a different tab is focused', () => {
    // Both dashboards exist, neither is focused — the active-preference only
    // matters once something needs to be activated.
    const twoDashboards = context({
      tabs: [
        tab(DASHBOARD, { id: 1, windowId: 1 }),
        tab(DASHBOARD, { id: 2, windowId: 2 }),
      ],
    });
    expect(planGlobalCommand(GLOBAL_DASHBOARD_COMMAND, twoDashboards)).toEqual({
      kind: 'focus-dashboard',
      tabId: 1,
      windowId: 1,
    });
  });

  it('treats chrome://newtab/ as the dashboard too', () => {
    const asNewtab = context({ tabs: [tab('chrome://newtab/', { id: 9, windowId: 1 })] });
    expect(planGlobalCommand(GLOBAL_DASHBOARD_COMMAND, asNewtab)).toEqual({
      kind: 'focus-dashboard',
      tabId: 9,
      windowId: 1,
    });
  });
});
