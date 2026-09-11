/**
 * newtab/main.ts — dashboard entry point.
 *
 * Composition root: builds the concrete adapters, wires the services together,
 * and starts the render loop. Every other module receives its dependencies, so
 * this is the only file that knows about real Chrome APIs.
 */

import { SettingsStore } from '../config/store';
import { dashboardUrls } from '../core/dashboard';
import { createChromeBrowserTabs } from '../platform/browser';
import { createChromeStore } from '../platform/storage';
import { SavedTabsService } from '../services/saved-tabs';
import { TabActions } from '../services/tab-actions';
import { TabHistoryService } from '../services/tab-history';
import { Dashboard } from './dashboard';
import { attachController, RenderScheduler } from './controller';
import { enforceSingleDashboard } from './singleton';
import { installFaviconFallback } from '../ui/favicon';

async function bootstrap(): Promise<void> {
  const browser = createChromeBrowserTabs();
  const tabActions = new TabActions(browser);
  const savedTabs = new SavedTabsService(createChromeStore('local'));
  const settingsStore = new SettingsStore(createChromeStore('sync'));
  const historyService = new TabHistoryService(createChromeStore('local'));

  installFaviconFallback();

  // Enforce the single-dashboard rule before the first paint, so the tab
  // counts we render already exclude the pages we are about to close.
  await enforceSingleDashboard(browser, tabActions, chrome.runtime.id);

  // Then take up position at the end of the tab bar — any page opened after
  // this one should land to its left, never to its right.
  await tabActions.moveDashboardToEnd(dashboardUrls(chrome.runtime.id));

  const dashboard = new Dashboard({ browser, tabActions, savedTabs, settingsStore, historyService });
  const scheduler = new RenderScheduler(() => dashboard.render());

  attachController(dashboard, scheduler);

  // Repaint when tabs change, or when settings are saved in the options page.
  browser.onChanged(() => scheduler.schedule());
  settingsStore.onChanged(() => void dashboard.render());

  // The History panel reacts to its own storage key directly, rather than
  // waiting for the next full repaint: closing a tab records the closure
  // from the *background* worker, asynchronously, so without this the panel
  // would only pick it up once some unrelated tab event triggered a repaint
  // (or the page was refreshed).
  historyService.onChanged(() => void dashboard.renderHistoryPanel(dashboard.currentHistoryQuery()));

  await dashboard.render();
}

void bootstrap().catch((err) => {
  console.error('[tab-out] Failed to start dashboard:', err);
});
