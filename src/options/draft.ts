/**
 * options/draft.ts — the settings form's editing model.
 *
 * The options page edits a *draft*: a flat, all-strings mirror of the settings
 * that maps one-to-one onto form fields. Nothing is persisted until the user
 * saves, which means half-typed input can never corrupt stored settings.
 *
 * Every function here is pure, so the whole form — adding rows, reordering,
 * converting back to settings — is unit tested without a DOM.
 */

import type { DisposableRule, KeyCombo, TabOutSettings } from '../types';
import type { NormalizeResult } from '../config/schema';
import { normalizeSettings } from '../config/schema';
import { SETTINGS_VERSION } from '../config/defaults';

/** One row of the "Pinned sites" table. */
export interface PinnedRow {
  url: string;
  label: string;
}

/** One row of the "Disposable tabs" table. */
export interface DisposableRow {
  /**
   * A single glob pattern matched against the tab's whole URL. `*` matches
   * any characters, including `/`, e.g. `https://github.com/*`. See
   * {@link DisposableRule}.
   */
  pattern: string;
}

/** The complete form state. */
export interface DraftState {
  /** Whether pinned sites are applied at all — a checkbox, not a row table. */
  pinnedEnabled: boolean;
  pinned: PinnedRow[];
  /** Whether disposable rules are applied at all — a checkbox, not a row table. */
  disposableEnabled: boolean;
  disposable: DisposableRow[];
  /** "Keep last N closed tabs" — a plain field, not a row table. */
  maxHistoryItems: string;
  /** "Automatically sort tabs to match the dashboard" — a checkbox, not a row table. */
  autoSortTabs: boolean;
  /** The Search overlay's keyboard shortcut — a recorder widget, not a row table. */
  searchShortcut: KeyCombo;
}

/** Which row-table a row belongs to. Scalar fields are not tables. */
export type SectionName = 'pinned' | 'disposable';

/** Any one of the row shapes. */
export type DraftRow = PinnedRow | DisposableRow;

/** Splits a comma-separated form field into trimmed, non-empty parts. */
export function splitList(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** Joins a list back into a comma-separated form field. */
export function joinList(values: readonly string[] | undefined): string {
  return (values ?? []).join(', ');
}

/** Converts one disposable rule into its editable row form. */
function disposableRuleToRow(rule: DisposableRule): DisposableRow {
  return { pattern: rule.pattern };
}

/** Converts stored settings into editable form rows. */
export function settingsToDraft(settings: TabOutSettings): DraftState {
  return {
    pinnedEnabled: settings.pinnedEnabled,
    pinned: settings.pinnedSites.map((site) => ({
      url: site.url,
      label: site.label ?? '',
    })),
    disposableEnabled: settings.disposableEnabled,
    disposable: settings.disposableRules.map(disposableRuleToRow),
    maxHistoryItems: String(settings.maxHistoryItems),
    autoSortTabs: settings.autoSortTabs,
    searchShortcut: { ...settings.searchShortcut },
  };
}

/**
 * Converts form rows back into settings, running them through the same
 * validator used for stored data and JSON imports.
 *
 * Entirely blank rows are dropped silently — they are just an "add row" the
 * user never filled in, not an error worth reporting.
 */
export function draftToSettings(draft: DraftState): NormalizeResult {
  const pinnedSites = draft.pinned
    .filter((row) => row.url.trim() || row.label.trim())
    .map((row) => ({ url: row.url.trim(), label: row.label.trim() }));

  const disposableRules = draft.disposable
    .filter((row) => isRowFilled(row))
    .map((row) => ({ pattern: row.pattern.trim() }));

  return normalizeSettings({
    version: SETTINGS_VERSION,
    pinnedEnabled: draft.pinnedEnabled,
    pinnedSites,
    disposableEnabled: draft.disposableEnabled,
    disposableRules,
    maxHistoryItems: draft.maxHistoryItems,
    autoSortTabs: draft.autoSortTabs,
    searchShortcut: draft.searchShortcut,
  });
}

/** True when any field of a row has content. */
export function isRowFilled(row: object): boolean {
  return Object.values(row).some(
    (value) => typeof value === 'string' && value.trim().length > 0,
  );
}

/** Returns a copy of `rows` with `row` appended. */
export function addRow<T>(rows: readonly T[], row: T): T[] {
  return [...rows, row];
}

/** Returns a copy of `rows` without the entry at `index`. */
export function removeRow<T>(rows: readonly T[], index: number): T[] {
  if (index < 0 || index >= rows.length) return [...rows];
  return rows.filter((_, i) => i !== index);
}

/**
 * Moves a row by `delta` positions, clamped to the list bounds.
 * Order is meaningful: pinned sites render in order.
 */
export function moveRow<T>(rows: readonly T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (index < 0 || index >= rows.length) return [...rows];
  if (target < 0 || target >= rows.length) return [...rows];

  const next = [...rows];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item!);
  return next;
}

/**
 * Appends any shipped default disposable rule not already present in `rows`,
 * so an upgrading user can pick up a new or corrected default (e.g. a fixed
 * path, or a newly added rule) with one click instead of re-typing it.
 * Existing rows — including ones the user has since edited — are left
 * completely untouched; nothing is ever removed or overwritten.
 */
export function addSuggestedDisposableRules(
  rows: readonly DisposableRow[],
  suggestions: readonly DisposableRule[],
): DisposableRow[] {
  const existing = new Set(rows.map((row) => JSON.stringify(row)));
  const toAdd = suggestions
    .map(disposableRuleToRow)
    .filter((row) => !existing.has(JSON.stringify(row)));
  return [...rows, ...toAdd];
}

/** A blank row for each table. */
export const EMPTY_PINNED_ROW: PinnedRow = { url: '', label: '' };
export const EMPTY_DISPOSABLE_ROW: DisposableRow = { pattern: '' };
