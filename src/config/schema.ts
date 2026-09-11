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
  CustomGroupRule,
  LandingPattern,
  PinnedSite,
  TabOutSettings,
} from '../types';
import { createDefaultSettings, SETTINGS_VERSION, DEFAULT_MAX_HISTORY_ITEMS } from './defaults';
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

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(asTrimmedString).filter((item) => item.length > 0);
}

/** Ensures a path constraint looks like a path (`/foo`), not a bare word. */
function asPath(value: unknown): string {
  const str = asTrimmedString(value);
  if (!str) return '';
  return str.startsWith('/') ? str : `/${str}`;
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
 * A landing pattern must constrain the hostname somehow. Without that it would
 * match every tab on the internet, which is never what the user meant.
 */
export function normalizeLandingPattern(
  raw: unknown,
  path: string,
  issues: ValidationIssue[],
): LandingPattern | null {
  if (!isObject(raw)) {
    issues.push({ path, message: 'Expected a rule object.' });
    return null;
  }

  const hostname = asTrimmedString(raw['hostname']).replace(/^https?:\/\//, '');
  const hostnameEndsWith = asTrimmedString(raw['hostnameEndsWith']);
  if (!hostname && !hostnameEndsWith) {
    issues.push({ path, message: 'Needs either "hostname" or "hostnameEndsWith".' });
    return null;
  }

  const pattern: LandingPattern = {};
  if (hostname) pattern.hostname = hostname;
  else pattern.hostnameEndsWith = hostnameEndsWith;

  const pathPrefix = asPath(raw['pathPrefix']);
  if (pathPrefix) pattern.pathPrefix = pathPrefix;

  const pathExact = asStringArray(raw['pathExact']).map((p) => (p.startsWith('/') ? p : `/${p}`));
  if (pathExact.length > 0) pattern.pathExact = pathExact;

  const urlNotContains = asStringArray(raw['urlNotContains']);
  if (urlNotContains.length > 0) pattern.urlNotContains = urlNotContains;

  return pattern;
}

/**
 * A custom group needs a key (used as the group identity) and a hostname
 * constraint. The label falls back to the key so a card is never nameless.
 */
export function normalizeCustomGroup(
  raw: unknown,
  path: string,
  issues: ValidationIssue[],
): CustomGroupRule | null {
  if (!isObject(raw)) {
    issues.push({ path, message: 'Expected a rule object.' });
    return null;
  }

  const groupKey = asTrimmedString(raw['groupKey']);
  if (!groupKey) {
    issues.push({ path, message: 'Missing "groupKey".' });
    return null;
  }

  const hostname = asTrimmedString(raw['hostname']).replace(/^https?:\/\//, '');
  const hostnameEndsWith = asTrimmedString(raw['hostnameEndsWith']);
  if (!hostname && !hostnameEndsWith) {
    issues.push({ path, message: 'Needs either "hostname" or "hostnameEndsWith".' });
    return null;
  }

  const rule: CustomGroupRule = {
    groupKey,
    groupLabel: asTrimmedString(raw['groupLabel']) || groupKey,
  };
  if (hostname) rule.hostname = hostname;
  else rule.hostnameEndsWith = hostnameEndsWith;

  const pathPrefix = asPath(raw['pathPrefix']);
  if (pathPrefix) rule.pathPrefix = pathPrefix;

  return rule;
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

  const landingPatterns = Array.isArray(raw['landingPatterns'])
    ? (raw['landingPatterns'] as unknown[])
        .map((item, i) => normalizeLandingPattern(item, `landingPatterns[${i}]`, issues))
        .filter((item): item is LandingPattern => item !== null)
    : defaults.landingPatterns;

  const customGroups = Array.isArray(raw['customGroups'])
    ? dedupeBy(
        (raw['customGroups'] as unknown[])
          .map((item, i) => normalizeCustomGroup(item, `customGroups[${i}]`, issues))
          .filter((item): item is CustomGroupRule => item !== null),
        (rule) => rule.groupKey,
        'customGroups',
        issues,
      )
    : defaults.customGroups;

  const version =
    typeof raw['version'] === 'number' && Number.isFinite(raw['version'])
      ? raw['version']
      : SETTINGS_VERSION;

  const maxHistoryItems = normalizeMaxHistoryItems(raw['maxHistoryItems'], issues);

  return {
    settings: { version, pinnedSites, landingPatterns, customGroups, maxHistoryItems },
    issues,
  };
}

/**
 * Upgrades settings written by an older version of Tab Out.
 *
 * There is only one version so far, so this simply stamps the current version
 * number — but the hook exists so future shape changes have an obvious home.
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
