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
import { createDefaultSettings, DEFAULT_DISPOSABLE_RULES } from '../config/defaults';
import { parseSettingsJson, stringifySettings } from '../config/schema';
import { TabHistoryService } from '../services/tab-history';
import {
  addRow,
  addSuggestedDisposableRules,
  draftToSettings,
  EMPTY_CUSTOM_ROW,
  EMPTY_DISPOSABLE_ROW,
  EMPTY_PINNED_ROW,
  moveRow,
  removeRow,
  settingsToDraft,
} from './draft';
import { renderIssues, renderSection } from './render';

const store = new SettingsStore(createChromeStore('sync'));
const historyService = new TabHistoryService(createChromeStore('local'));

/** Container element for each table. */
const CONTAINERS: Record<SectionName, string> = {
  pinned: 'pinnedRows',
  disposable: 'disposableRows',
  custom: 'customRows',
};

/** Panel element id + the draft field that enables it, for the dimming effect. */
const TOGGLEABLE_PANELS: readonly { panelId: string; field: 'pinnedEnabled' | 'disposableEnabled' }[] = [
  { panelId: 'pinnedPanel', field: 'pinnedEnabled' },
  { panelId: 'disposablePanel', field: 'disposableEnabled' },
];

let draft: DraftState = settingsToDraft(createDefaultSettings());
/** The last saved state, used by Revert and the dirty indicator. */
let savedSnapshot = JSON.stringify(draft);

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
    case 'add-custom':
      draft = { ...draft, custom: addRow(draft.custom, { ...EMPTY_CUSTOM_ROW }) };
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
    if (!window.confirm('Reset all Tab Out settings to their defaults?')) return;
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

/* ---------------------------------------------------------------
   Boot
   --------------------------------------------------------------- */

void (async () => {
  draft = settingsToDraft(await store.load());
  savedSnapshot = JSON.stringify(draft);
  render();
})();
