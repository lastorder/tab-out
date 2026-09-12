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

import type { DisposableRule, TabOutSettings } from '../types';
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
  /** Hostname. A leading dot means "match any subdomain": `.example.com`. */
  hostname: string;
  pathPrefix: string;
  /** Comma-separated list of exact paths. */
  pathExact: string;
  /** Comma-separated list of substrings that veto a match. */
  urlNotContains: string;
}

/** One row of the "Custom groups" table. */
export interface CustomRow {
  groupKey: string;
  groupLabel: string;
  /** Hostname. A leading dot means "match any subdomain". */
  hostname: string;
  pathPrefix: string;
}

/** The complete form state. */
export interface DraftState {
  /** Whether pinned sites are applied at all — a checkbox, not a row table. */
  pinnedEnabled: boolean;
  pinned: PinnedRow[];
  /** Whether disposable rules are applied at all — a checkbox, not a row table. */
  disposableEnabled: boolean;
  disposable: DisposableRow[];
  custom: CustomRow[];
  /** "Keep last N closed tabs" — a plain field, not a row table. */
  maxHistoryItems: string;
  /** "Automatically sort tabs to match the dashboard" — a checkbox, not a row table. */
  autoSortTabs: boolean;
}

/** Which row-table a row belongs to. Scalar fields are not tables. */
export type SectionName = 'pinned' | 'disposable' | 'custom';

/** Any one of the three row shapes. */
export type DraftRow = PinnedRow | DisposableRow | CustomRow;

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

/**
 * Renders a hostname constraint as a single form value.
 * Suffix rules are shown with a leading dot, which is how users type them.
 */
export function hostnameToField(rule: {
  hostname?: string;
  hostnameEndsWith?: string;
}): string {
  if (rule.hostname) return rule.hostname;
  if (rule.hostnameEndsWith) {
    return rule.hostnameEndsWith.startsWith('.')
      ? rule.hostnameEndsWith
      : `.${rule.hostnameEndsWith}`;
  }
  return '';
}

/** Parses the hostname form field back into the exact/suffix pair. */
export function hostnameFromField(value: string): {
  hostname?: string;
  hostnameEndsWith?: string;
} {
  const trimmed = value.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!trimmed) return {};
  if (trimmed.startsWith('.')) return { hostnameEndsWith: trimmed };
  return { hostname: trimmed };
}

/** Converts one disposable rule into its editable row form. */
function disposableRuleToRow(rule: DisposableRule): DisposableRow {
  return {
    hostname: hostnameToField(rule),
    pathPrefix: rule.pathPrefix ?? '',
    pathExact: joinList(rule.pathExact),
    urlNotContains: joinList(rule.urlNotContains),
  };
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
    custom: settings.customGroups.map((rule) => ({
      groupKey: rule.groupKey,
      groupLabel: rule.groupLabel,
      hostname: hostnameToField(rule),
      pathPrefix: rule.pathPrefix ?? '',
    })),
    maxHistoryItems: String(settings.maxHistoryItems),
    autoSortTabs: settings.autoSortTabs,
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
    .map((row) => {
      const rule: DisposableRule = { ...hostnameFromField(row.hostname) };
      if (row.pathPrefix.trim()) rule.pathPrefix = row.pathPrefix.trim();
      const exact = splitList(row.pathExact);
      if (exact.length > 0) rule.pathExact = exact;
      const veto = splitList(row.urlNotContains);
      if (veto.length > 0) rule.urlNotContains = veto;
      return rule;
    });

  const customGroups = draft.custom
    .filter((row) => isRowFilled(row))
    .map((row) => ({
      groupKey: row.groupKey.trim(),
      groupLabel: row.groupLabel.trim(),
      ...hostnameFromField(row.hostname),
      ...(row.pathPrefix.trim() ? { pathPrefix: row.pathPrefix.trim() } : {}),
    }));

  return normalizeSettings({
    version: SETTINGS_VERSION,
    pinnedEnabled: draft.pinnedEnabled,
    pinnedSites,
    disposableEnabled: draft.disposableEnabled,
    disposableRules,
    customGroups,
    maxHistoryItems: draft.maxHistoryItems,
    autoSortTabs: draft.autoSortTabs,
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
 * Order is meaningful: pinned sites render in order, and custom group rules
 * are matched first-wins.
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
export const EMPTY_DISPOSABLE_ROW: DisposableRow = {
  hostname: '',
  pathPrefix: '',
  pathExact: '',
  urlNotContains: '',
};
export const EMPTY_CUSTOM_ROW: CustomRow = {
  groupKey: '',
  groupLabel: '',
  hostname: '',
  pathPrefix: '',
};
