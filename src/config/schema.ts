/**
 * config/schema.ts — validation and normalisation of settings.
 *
 * Settings can arrive from three untrusted places: `chrome.storage` written by
 * an older version, the options-page forms, and a user-supplied JSON import.
 * Everything funnels through `normalizeSettings`, which never throws — it
 * repairs what it can and drops what it cannot, so a corrupt value can never
 * break the new tab page.
 */

import type {
  DisposableRule,
  KeyCombo,
  PinnedSite,
  TabOutSettings,
} from '../types';
import {
  createDefaultSettings,
  SETTINGS_VERSION,
  DEFAULT_MAX_HISTORY_ITEMS,
  DEFAULT_AUTO_SORT_TABS,
  DEFAULT_AUTO_GROUP_ENABLED,
  DEFAULT_PINNED_ENABLED,
  DEFAULT_DISPOSABLE_ENABLED,
  DEFAULT_SEARCH_SHORTCUT,
} from './defaults';
import { normalizeUrlInput } from '../core/url';

/** Bounds enforced on the "keep last N closed tabs" setting. */
export const MIN_HISTORY_ITEMS = 1;
export const MAX_HISTORY_ITEMS = 1000;

/** A human-readable problem found while validating. */
export interface ValidationIssue {
  path: string;
  message: string;
}

export interface NormalizeResult {
  settings: TabOutSettings;
  issues: ValidationIssue[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Coerces a settings field to a boolean, falling back to `defaultValue` and
 * reporting why whenever the raw value isn't actually a boolean. Shared by
 * every scalar on/off setting (`autoSortTabs`, `pinnedEnabled`,
 * `disposableEnabled`) so the fallback-and-report behaviour can't drift
 * between them.
 */
function normalizeBoolean(
  raw: unknown,
  path: string,
  defaultValue: boolean,
  issues: ValidationIssue[],
): boolean {
  if (raw === undefined) return defaultValue;
  if (typeof raw === 'boolean') return raw;
  issues.push({ path, message: 'Not a boolean; using the default.' });
  return defaultValue;
}

/**
 * A pinned site needs a resolvable URL; the label is optional and falls back
 * to a friendly hostname at render time.
 */
export function normalizePinnedSite(raw: unknown, path: string, issues: ValidationIssue[]): PinnedSite | null {
  if (!isObject(raw)) {
    issues.push({ path, message: 'Expected an object with a "url" field.' });
    return null;
  }
  const url = normalizeUrlInput(asTrimmedString(raw['url']));
  if (!url) {
    issues.push({ path, message: 'Missing or invalid URL.' });
    return null;
  }
  const label = asTrimmedString(raw['label']);
  return label ? { url, label } : { url };
}

/**
 * A disposable rule is a single glob `pattern` string. Empty/missing means
 * the rule would match every tab on the internet, which is never what a
 * half-filled form meant, so it's dropped instead.
 */
export function normalizeDisposableRule(
  raw: unknown,
  path: string,
  issues: ValidationIssue[],
): DisposableRule | null {
  if (!isObject(raw)) {
    issues.push({ path, message: 'Expected a rule object.' });
    return null;
  }

  const pattern = asTrimmedString(raw['pattern']);
  if (!pattern) {
    issues.push({ path, message: 'Needs a non-empty "pattern".' });
    return null;
  }

  return { pattern };
}

/**
 * Coerces the "keep last N closed tabs" field to a whole number within
 * [MIN_HISTORY_ITEMS, MAX_HISTORY_ITEMS], falling back to the default and
 * reporting why whenever the raw value cannot be trusted.
 */
export function normalizeMaxHistoryItems(raw: unknown, issues: ValidationIssue[]): number {
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (raw === undefined) return DEFAULT_MAX_HISTORY_ITEMS;
  if (!Number.isFinite(num)) {
    issues.push({ path: 'maxHistoryItems', message: 'Not a number; using the default.' });
    return DEFAULT_MAX_HISTORY_ITEMS;
  }
  const rounded = Math.round(num);
  if (rounded < MIN_HISTORY_ITEMS) {
    issues.push({ path: 'maxHistoryItems', message: `Below the minimum of ${MIN_HISTORY_ITEMS}; clamped.` });
    return MIN_HISTORY_ITEMS;
  }
  if (rounded > MAX_HISTORY_ITEMS) {
    issues.push({ path: 'maxHistoryItems', message: `Above the maximum of ${MAX_HISTORY_ITEMS}; clamped.` });
    return MAX_HISTORY_ITEMS;
  }
  return rounded;
}

/** Coerces the "auto-sort tabs" field to a boolean, defaulting to on. */
export function normalizeAutoSortTabs(raw: unknown, issues: ValidationIssue[]): boolean {
  return normalizeBoolean(raw, 'autoSortTabs', DEFAULT_AUTO_SORT_TABS, issues);
}

/** Coerces the "auto-group tabs" field to a boolean, defaulting to off. */
export function normalizeAutoGroupEnabled(raw: unknown, issues: ValidationIssue[]): boolean {
  return normalizeBoolean(raw, 'autoGroupEnabled', DEFAULT_AUTO_GROUP_ENABLED, issues);
}

/** Coerces the "pinned sites enabled" field to a boolean, defaulting to on. */
export function normalizePinnedEnabled(raw: unknown, issues: ValidationIssue[]): boolean {
  return normalizeBoolean(raw, 'pinnedEnabled', DEFAULT_PINNED_ENABLED, issues);
}

/** Coerces the "disposable rules enabled" field to a boolean, defaulting to on. */
export function normalizeDisposableEnabled(raw: unknown, issues: ValidationIssue[]): boolean {
  return normalizeBoolean(raw, 'disposableEnabled', DEFAULT_DISPOSABLE_ENABLED, issues);
}

/**
 * Coerces the Search-overlay shortcut to a valid {@link KeyCombo}, falling
 * back to the platform default whenever the raw value can't be trusted —
 * missing key, non-boolean modifier, or not an object at all.
 */
export function normalizeSearchShortcut(raw: unknown, issues: ValidationIssue[]): KeyCombo {
  if (!isObject(raw)) {
    if (raw !== undefined) {
      issues.push({ path: 'searchShortcut', message: 'Expected an object; using the default.' });
    }
    return { ...DEFAULT_SEARCH_SHORTCUT };
  }

  const key = asTrimmedString(raw['key']);
  if (!key) {
    issues.push({ path: 'searchShortcut', message: 'Missing "key"; using the default.' });
    return { ...DEFAULT_SEARCH_SHORTCUT };
  }

  const asBool = (value: unknown): boolean => value === true;

  return {
    key: key.toLowerCase(),
    ctrl: asBool(raw['ctrl']),
    meta: asBool(raw['meta']),
    alt: asBool(raw['alt']),
    shift: asBool(raw['shift']),
  };
}

/** Drops later entries that reuse an earlier entry's identity. */
function dedupeBy<T>(items: T[], keyOf: (item: T) => string, path: string, issues: ValidationIssue[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  items.forEach((item, index) => {
    const key = keyOf(item);
    if (seen.has(key)) {
      issues.push({ path: `${path}[${index}]`, message: `Duplicate entry "${key}" ignored.` });
      return;
    }
    seen.add(key);
    out.push(item);
  });
  return out;
}

/**
 * Coerces arbitrary input into valid settings.
 *
 * Missing sections fall back to defaults; invalid individual entries are
 * dropped and reported in `issues` so the options page can tell the user what
 * it had to throw away.
 */
export function normalizeSettings(raw: unknown): NormalizeResult {
  const issues: ValidationIssue[] = [];
  const defaults = createDefaultSettings();

  if (!isObject(raw)) {
    return { settings: defaults, issues };
  }

  const pinnedSites = Array.isArray(raw['pinnedSites'])
    ? dedupeBy(
        (raw['pinnedSites'] as unknown[])
          .map((item, i) => normalizePinnedSite(item, `pinnedSites[${i}]`, issues))
          .filter((item): item is PinnedSite => item !== null),
        (site) => site.url,
        'pinnedSites',
        issues,
      )
    : defaults.pinnedSites;

  // `disposableRules` is the current key. `landingPatterns` is read as a
  // fallback so settings saved by an older version of Tab Out — in
  // `chrome.storage`, or a previously-exported JSON file — keep their rules
  // instead of silently reverting to the defaults on first load.
  const rawDisposableRules = Array.isArray(raw['disposableRules'])
    ? (raw['disposableRules'] as unknown[])
    : Array.isArray(raw['landingPatterns'])
      ? (raw['landingPatterns'] as unknown[])
      : null;

  const disposableRules = rawDisposableRules
    ? rawDisposableRules
        .map((item, i) => normalizeDisposableRule(item, `disposableRules[${i}]`, issues))
        .filter((item): item is DisposableRule => item !== null)
    : defaults.disposableRules;

  const version =
    typeof raw['version'] === 'number' && Number.isFinite(raw['version'])
      ? raw['version']
      : SETTINGS_VERSION;

  const pinnedEnabled = normalizePinnedEnabled(raw['pinnedEnabled'], issues);
  const disposableEnabled = normalizeDisposableEnabled(raw['disposableEnabled'], issues);
  const maxHistoryItems = normalizeMaxHistoryItems(raw['maxHistoryItems'], issues);
  const autoSortTabs = normalizeAutoSortTabs(raw['autoSortTabs'], issues);
  const autoGroupEnabled = normalizeAutoGroupEnabled(raw['autoGroupEnabled'], issues);
  const searchShortcut = normalizeSearchShortcut(raw['searchShortcut'], issues);

  return {
    settings: {
      version,
      pinnedEnabled,
      pinnedSites,
      disposableEnabled,
      disposableRules,
      maxHistoryItems,
      autoSortTabs,
      autoGroupEnabled,
      searchShortcut,
    },
    issues,
  };
}

/**
 * Upgrades settings written by an older version of Tab Out.
 *
 * v1 → v2 is handled by `normalizeSettings` itself (the `disposableRules` /
 * `landingPatterns` key fallback, and `pinnedEnabled` / `disposableEnabled`
 * defaulting to `true` when absent) since normalisation runs *before*
 * migration and would otherwise see a renamed field as simply missing. v3
 * drops `customGroupsEnabled` / `customGroups` entirely — `normalizeSettings`
 * simply no longer reads them, so old stored values are silently ignored
 * rather than needing an explicit migration step. v4 added a global-shortcut
 * flag (`globalDashboardShortcutEnabled`, plus a short-lived
 * `globalSearchShortcutEnabled`), each defaulting to `false` when absent so
 * an upgrading user was never handed a browser-wide keybinding they didn't
 * ask for. v5 removes both flags entirely: the chords they gated are wholly
 * owned by Chrome (`chrome://extensions/shortcuts`) regardless of the flag,
 * so the checkbox only risked showing a shortcut as "configured" on the
 * options page while the handler silently ignored it. `normalizeSettings`
 * simply no longer reads either field, so old stored `true`/`false` values
 * are dropped without needing an explicit migration step — the commands
 * they used to gate (`core/global-commands.ts`'s `global-dashboard`, and
 * `manifest.json`'s native `_execute_action`) are just always on now. This
 * function only stamps the version number — but the hook exists so a future
 * shape change that isn't just "renamed/dropped and defaulted" has an
 * obvious home. v6 adds `autoGroupEnabled`, defaulting to `false` when
 * absent (same "don't hand an upgrading user new automatic behaviour"
 * reasoning as v4) — handled entirely by `normalizeAutoGroupEnabled`, no
 * migration step needed.
 */
export function migrateSettings(settings: TabOutSettings): TabOutSettings {
  if (settings.version === SETTINGS_VERSION) return settings;
  return { ...settings, version: SETTINGS_VERSION };
}

/** Parses a JSON export string back into settings. Never throws. */
export function parseSettingsJson(json: string): NormalizeResult & { ok: boolean } {
  try {
    const parsed: unknown = JSON.parse(json);
    const result = normalizeSettings(parsed);
    return { ...result, ok: true };
  } catch (err) {
    return {
      settings: createDefaultSettings(),
      issues: [{ path: 'root', message: `Invalid JSON: ${(err as Error).message}` }],
      ok: false,
    };
  }
}

/** Serialises settings for the export button. */
export function stringifySettings(settings: TabOutSettings): string {
  return `${JSON.stringify(settings, null, 2)}\n`;
}
