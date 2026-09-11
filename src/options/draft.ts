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

import type { LandingPattern, TabOutSettings } from '../types';
import type { NormalizeResult } from '../config/schema';
import { normalizeSettings } from '../config/schema';
import { SETTINGS_VERSION } from '../config/defaults';

/** One row of the "Pinned sites" table. */
export interface PinnedRow {
  url: string;
  label: string;
}

/** One row of the "Homepage rules" table. */
export interface LandingRow {
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
  pinned: PinnedRow[];
  landing: LandingRow[];
  custom: CustomRow[];
  /** "Keep last N closed tabs" — a plain field, not a row table. */
  maxHistoryItems: string;
  /** "Automatically sort tabs to match the dashboard" — a checkbox, not a row table. */
  autoSortTabs: boolean;
}

/** Which row-table a row belongs to. `maxHistoryItems` is not a table. */
export type SectionName = 'pinned' | 'landing' | 'custom';

/** Any one of the three row shapes. */
export type DraftRow = PinnedRow | LandingRow | CustomRow;

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

/** Converts stored settings into editable form rows. */
export function settingsToDraft(settings: TabOutSettings): DraftState {
  return {
    pinned: settings.pinnedSites.map((site) => ({
      url: site.url,
      label: site.label ?? '',
    })),
    landing: settings.landingPatterns.map((pattern) => ({
      hostname: hostnameToField(pattern),
      pathPrefix: pattern.pathPrefix ?? '',
      pathExact: joinList(pattern.pathExact),
      urlNotContains: joinList(pattern.urlNotContains),
    })),
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

  const landingPatterns = draft.landing
    .filter((row) => isRowFilled(row))
    .map((row) => {
      const pattern: LandingPattern = { ...hostnameFromField(row.hostname) };
      if (row.pathPrefix.trim()) pattern.pathPrefix = row.pathPrefix.trim();
      const exact = splitList(row.pathExact);
      if (exact.length > 0) pattern.pathExact = exact;
      const veto = splitList(row.urlNotContains);
      if (veto.length > 0) pattern.urlNotContains = veto;
      return pattern;
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
    pinnedSites,
    landingPatterns,
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

/** A blank row for each table. */
export const EMPTY_PINNED_ROW: PinnedRow = { url: '', label: '' };
export const EMPTY_LANDING_ROW: LandingRow = {
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
