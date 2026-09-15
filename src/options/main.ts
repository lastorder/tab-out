/**
 * options/main.ts — settings page entry point.
 *
 * Holds the draft in memory, re-renders the three tables when its shape
 * changes, and writes to storage only when the user clicks Save. Typing does
 * not re-render — it updates the draft in place, so the caret never jumps.
 */

import type { DraftRow, DraftState, SectionName } from './draft';
import { SettingsStore } from '../config/store';
import { createChromeStore } from '../platform/storage';
import { createDefaultSettings, DEFAULT_DISPOSABLE_RULES, DEFAULT_SEARCH_SHORTCUT } from '../config/defaults';
import { parseSettingsJson, stringifySettings } from '../config/schema';
import { TabHistoryService } from '../services/tab-history';
import { comboFromEvent, formatShortcut } from '../core/shortcut';
import {
  addRow,
  addSuggestedDisposableRules,
  draftToSettings,
  EMPTY_DISPOSABLE_ROW,
  EMPTY_PINNED_ROW,
  moveRow,
  removeRow,
  settingsToDraft,
} from './draft';
import { renderIssues, renderSection } from './render';
import manifest from '../manifest.json';

const store = new SettingsStore(createChromeStore('sync'));
const historyService = new TabHistoryService(createChromeStore('local'));

/** Whether to render the shortcut using Mac symbols (⌘) or Win-style text (Ctrl+). */
const IS_MAC = /mac/i.test(navigator.platform || navigator.userAgent || '');

/** Container element for each table. */
const CONTAINERS: Record<SectionName, string> = {
  pinned: 'pinnedRows',
  disposable: 'disposableRows',
};

/** Panel element id + the draft field that enables it, for the dimming effect. */
const TOGGLEABLE_PANELS: readonly { panelId: string; field: 'pinnedEnabled' | 'disposableEnabled' }[] = [
  { panelId: 'pinnedPanel', field: 'pinnedEnabled' },
  { panelId: 'disposablePanel', field: 'disposableEnabled' },
];

let draft: DraftState = settingsToDraft(createDefaultSettings());
/** The last saved state, used by Revert and the dirty indicator. */
let savedSnapshot = JSON.stringify(draft);

/**
 * The chords the manifest declares for the two global commands.
 *
 * Read straight out of the manifest rather than re-typed here: Chrome owns the
 * binding (rebinding happens in `chrome://extensions/shortcuts`), so
 * `src/manifest.json` is the single source of truth and this page only shows
 * what it says. `suggestedKeyFor()` turns Chrome's chord syntax into the same
 * label style the in-page shortcut recorder uses.
 */
const GLOBAL_SHORTCUT_FIELDS = [
  'globalSearchShortcutEnabled',
  'globalDashboardShortcutEnabled',
] as const;

/** Chrome's key syntax looks like `Command+Shift+F`; we want `⌘⇧F`. */
function suggestedKeyFor(command: 'global-search' | 'global-dashboard'): string {
  const commandDef = (manifest.commands as Record<string, { suggested_key?: Record<string, string> }>)[
    command
  ];
  const raw = commandDef?.suggested_key?.[IS_MAC ? 'mac' : 'default'] ?? '';
  return raw
    .split('+')
    .map((part) => {
      const token = part.trim().toLowerCase();
      if (IS_MAC) {
        if (token === 'command' || token === 'cmd' || token === 'meta') return '\u2318';
        if (token === 'shift') return '\u21e7';
        if (token === 'alt' || token === 'option') return '\u2325';
        if (token === 'ctrl' || token === 'control') return '\u2303';
      } else {
        if (token === 'ctrl' || token === 'control') return 'Ctrl';
        if (token === 'shift') return 'Shift';
        if (token === 'alt' || token === 'option') return 'Alt';
        if (token === 'command' || token === 'cmd' || token === 'meta') return 'Win';
      }
      return part.trim().toUpperCase();
    })
    .join(IS_MAC ? '' : '+');
}

const GLOBAL_SEARCH_SHORTCUT_LABEL = suggestedKeyFor('global-search');
const GLOBAL_DASHBOARD_SHORTCUT_LABEL = suggestedKeyFor('global-dashboard');

function byId<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function isDirty(): boolean {
  return JSON.stringify(draft) !== savedSnapshot;
}

/** Repaints all three tables and the save bar. */
function render(): void {
  for (const [section, containerId] of Object.entries(CONTAINERS)) {
    const container = byId(containerId);
    if (container) container.innerHTML = renderSection(section as SectionName, draft);
  }

  const historyInput = byId<HTMLInputElement>('maxHistoryItems');
  if (historyInput && historyInput.value !== draft.maxHistoryItems) {
    historyInput.value = draft.maxHistoryItems;
  }

  const autoSortInput = byId<HTMLInputElement>('autoSortTabs');
  if (autoSortInput && autoSortInput.checked !== draft.autoSortTabs) {
    autoSortInput.checked = draft.autoSortTabs;
  }

  const shortcutInput = byId<HTMLInputElement>('searchShortcut');
  if (shortcutInput) {
    shortcutInput.value = formatShortcut(draft.searchShortcut, IS_MAC);
  }

  // The two global shortcuts. Their chords live in the manifest (Chrome owns
  // rebinding), so this page only ever shows them — and shows them from the
  // same default constants the manifest was written to match, so the two
  // can't drift silently.
  const globalSearchKeys = byId('globalSearchShortcutKeys');
  if (globalSearchKeys) globalSearchKeys.textContent = GLOBAL_SEARCH_SHORTCUT_LABEL;
  const globalDashboardKeys = byId('globalDashboardShortcutKeys');
  if (globalDashboardKeys) globalDashboardKeys.textContent = GLOBAL_DASHBOARD_SHORTCUT_LABEL;

  for (const field of GLOBAL_SHORTCUT_FIELDS) {
    const checkbox = byId<HTMLInputElement>(field);
    if (checkbox && checkbox.checked !== draft[field]) checkbox.checked = draft[field];
  }

  // The two "apply this section at all" toggles: sync the checkbox, and dim
  // the rows underneath (still editable — turning it off doesn't lock the
  // list, just stops applying it).
  for (const { panelId, field } of TOGGLEABLE_PANELS) {
    const enabled = draft[field];
    const checkbox = byId<HTMLInputElement>(field);
    if (checkbox && checkbox.checked !== enabled) checkbox.checked = enabled;
    byId(panelId)?.classList.toggle('panel-off', !enabled);
  }

  updateStatus();
}

function updateStatus(message?: string, tone?: 'dirty' | 'saved'): void {
  const status = byId('saveStatus');
  const saveBtn = byId<HTMLButtonElement>('saveBtn');
  const revertBtn = byId<HTMLButtonElement>('revertBtn');
  const dirty = isDirty();

  if (status) {
    status.textContent = message ?? (dirty ? 'Unsaved changes' : 'All changes saved');
    status.className = `save-status ${tone ?? (dirty ? 'dirty' : '')}`.trim();
  }
  if (saveBtn) saveBtn.disabled = !dirty;
  if (revertBtn) revertBtn.disabled = !dirty;
}

function showIssues(issues: readonly { path: string; message: string }[]): void {
  const panel = byId('issues');
  if (!panel) return;
  if (issues.length === 0) {
    panel.hidden = true;
    panel.innerHTML = '';
    return;
  }
  panel.innerHTML = renderIssues(issues);
  panel.hidden = false;
}

/* ---------------------------------------------------------------
   Draft mutations

   The three tables hold different row shapes but share the same
   add/remove/reorder behaviour, so mutations funnel through one helper that
   works on the row union. The cast is confined here.
   --------------------------------------------------------------- */

function mutateSection(
  section: SectionName,
  transform: (rows: DraftRow[]) => DraftRow[],
): void {
  const next = transform([...draft[section]]);
  draft = { ...draft, [section]: next } as DraftState;
}

/* ---------------------------------------------------------------
   Event wiring
   --------------------------------------------------------------- */

/** Typing: update the draft in place, no re-render. */
document.addEventListener('input', (event) => {
  const input = event.target as HTMLInputElement | null;
  if (!input || input.tagName !== 'INPUT') return;

  // The single "keep last N closed tabs" field isn't part of a row table.
  if (input.id === 'maxHistoryItems') {
    draft = { ...draft, maxHistoryItems: input.value };
    updateStatus();
    return;
  }

  // Plain booleans, not row tables.
  if (input.id === 'autoSortTabs') {
    draft = { ...draft, autoSortTabs: input.checked };
    updateStatus();
    return;
  }
  if (input.id === 'pinnedEnabled') {
    draft = { ...draft, pinnedEnabled: input.checked };
    render();
    return;
  }
  if (input.id === 'disposableEnabled') {
    draft = { ...draft, disposableEnabled: input.checked };
    render();
    return;
  }
  if (input.id === 'globalSearchShortcutEnabled') {
    draft = { ...draft, globalSearchShortcutEnabled: input.checked };
    updateStatus();
    return;
  }
  if (input.id === 'globalDashboardShortcutEnabled') {
    draft = { ...draft, globalDashboardShortcutEnabled: input.checked };
    updateStatus();
    return;
  }

  const section = input.dataset['section'] as SectionName | undefined;
  const field = input.dataset['field'];
  const index = Number(input.dataset['index'] ?? -1);
  if (!section || !field || index < 0) return;

  mutateSection(section, (rows) => {
    const row = rows[index] as Record<string, string> | undefined;
    if (!row) return rows;
    const next = [...rows];
    next[index] = { ...row, [field]: input.value } as unknown as DraftRow;
    return next;
  });
  updateStatus();
});

/** Row and panel buttons. */
document.addEventListener('click', (event) => {
  const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-action]');
  if (!target) return;

  const action = target.dataset['action'];
  const section = target.dataset['section'] as SectionName | undefined;
  const index = Number(target.dataset['index'] ?? -1);

  switch (action) {
    case 'add-pinned':
      draft = { ...draft, pinned: addRow(draft.pinned, { ...EMPTY_PINNED_ROW }) };
      break;
    case 'add-disposable':
      draft = { ...draft, disposable: addRow(draft.disposable, { ...EMPTY_DISPOSABLE_ROW }) };
      break;
    case 'add-suggested-disposable':
      draft = {
        ...draft,
        disposable: addSuggestedDisposableRules(draft.disposable, DEFAULT_DISPOSABLE_RULES),
      };
      break;
    case 'remove':
      if (!section || index < 0) return;
      mutateSection(section, (rows) => removeRow(rows, index));
      break;
    case 'move-up':
      if (!section || index < 0) return;
      mutateSection(section, (rows) => moveRow(rows, index, -1));
      break;
    case 'move-down':
      if (!section || index < 0) return;
      mutateSection(section, (rows) => moveRow(rows, index, 1));
      break;
    default:
      return;
  }

  render();
});

/** Save — validate, persist, then re-render from what was actually stored. */
byId('saveBtn')?.addEventListener('click', () => {
  void (async () => {
    const { settings, issues } = draftToSettings(draft);
    const stored = await store.save(settings);
    // Apply a lowered history limit immediately, rather than waiting for the
    // next tab close to trim the stored list down to size.
    await historyService.trimTo(stored.maxHistoryItems);
    draft = settingsToDraft(stored);
    savedSnapshot = JSON.stringify(draft);
    render();
    showIssues(issues);
    updateStatus('Saved', 'saved');
  })();
});

/** Revert — throw the draft away and reload from storage. */
byId('revertBtn')?.addEventListener('click', () => {
  void (async () => {
    draft = settingsToDraft(await store.load());
    savedSnapshot = JSON.stringify(draft);
    render();
    showIssues([]);
  })();
});

/** Reset — restore the built-in defaults. */
byId('resetBtn')?.addEventListener('click', () => {
  void (async () => {
    if (!window.confirm('Reset all Tab Out 2 settings to their defaults?')) return;
    const stored = await store.reset();
    draft = settingsToDraft(stored);
    savedSnapshot = JSON.stringify(draft);
    render();
    showIssues([]);
    updateStatus('Reset to defaults', 'saved');
  })();
});

/** Export — download the current draft as JSON. */
byId('exportBtn')?.addEventListener('click', () => {
  const { settings } = draftToSettings(draft);
  const blob = new Blob([stringifySettings(settings)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'tab-out-settings.json';
  link.click();
  URL.revokeObjectURL(url);
});

/** Import — load a JSON file into the draft (still requires Save). */
byId('importBtn')?.addEventListener('click', () => {
  byId<HTMLInputElement>('importFile')?.click();
});

byId('importFile')?.addEventListener('change', (event) => {
  void (async () => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const { settings, issues, ok } = parseSettingsJson(await file.text());
    input.value = '';

    if (!ok) {
      showIssues(issues);
      updateStatus('Import failed — not valid JSON', 'dirty');
      return;
    }

    draft = settingsToDraft(settings);
    render();
    showIssues(issues);
    updateStatus('Imported — review, then Save', 'dirty');
  })();
});

/** Warn before navigating away with unsaved edits. */
window.addEventListener('beforeunload', (event) => {
  if (!isDirty()) return;
  event.preventDefault();
  event.returnValue = '';
});

/**
 * The shortcut recorder: focus the field, press a combo, it's captured.
 * Typing normally is disabled (`readonly` in the markup) so the only way to
 * change the value is to press the actual keys you want bound.
 */
byId<HTMLInputElement>('searchShortcut')?.addEventListener('keydown', (event) => {
  event.preventDefault();
  const combo = comboFromEvent(event);
  if (!combo) return; // a bare modifier key — wait for the real key press
  draft = { ...draft, searchShortcut: combo };
  render();
});

byId('resetShortcutBtn')?.addEventListener('click', () => {
  draft = { ...draft, searchShortcut: { ...DEFAULT_SEARCH_SHORTCUT } };
  render();
});

/**
 * Jumps to Chrome's own shortcut editor.
 *
 * A link would be blocked (extension pages can't navigate to `chrome://` via
 * `<a href>`), so this goes through `chrome.tabs.create`. Chrome only allows
 * the extension to *open* the page, not to rewrite a binding — which is why
 * this button hands off instead of offering a recorder like the in-page
 * shortcut above.
 */
byId('openChromeShortcutsBtn')?.addEventListener('click', () => {
  void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

/* ---------------------------------------------------------------
   Boot
   --------------------------------------------------------------- */

void (async () => {
  draft = settingsToDraft(await store.load());
  savedSnapshot = JSON.stringify(draft);
  render();
})();
