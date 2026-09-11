/**
 * core/matching.ts — evaluating the user's declarative grouping rules.
 *
 * Both landing-page patterns and custom-group rules are plain data objects
 * (see `src/types`), which means they can be stored in `chrome.storage` and
 * edited from the options page. This module is the single place that knows
 * how to interpret them.
 */

import type { CustomGroupRule, LandingPattern } from '../types';
import { parseUrl } from './url';

/**
 * Shared hostname test for both rule kinds.
 *
 * `hostname` wins when present; otherwise `hostnameEndsWith` does a suffix
 * match. A rule with neither never matches — that is deliberate, so a
 * half-filled form in the options page cannot accidentally capture every tab.
 */
function hostnameMatches(
  rule: { hostname?: string; hostnameEndsWith?: string },
  hostname: string,
): boolean {
  if (rule.hostname) return hostname === rule.hostname;
  if (rule.hostnameEndsWith) return hostname.endsWith(rule.hostnameEndsWith);
  return false;
}

/**
 * Tests one landing-page pattern against a URL.
 *
 * Path constraints are checked in priority order — `pathPrefix`, then
 * `pathExact` — and when neither is given the rule only matches the site root.
 * `urlNotContains` runs last and can veto an otherwise successful match; it is
 * how "the Gmail inbox is a homepage, but an individual thread is not" is
 * expressed without any code.
 */
export function matchesLandingPattern(pattern: LandingPattern, url: string): boolean {
  const parsed = parseUrl(url);
  if (!parsed) return false;
  if (!hostnameMatches(pattern, parsed.hostname)) return false;

  if (pattern.urlNotContains?.some((needle) => needle && url.includes(needle))) {
    return false;
  }

  if (pattern.pathPrefix) return parsed.pathname.startsWith(pattern.pathPrefix);
  if (pattern.pathExact?.length) return pattern.pathExact.includes(parsed.pathname);
  return parsed.pathname === '/';
}

/** True when any pattern considers this URL a homepage. */
export function isLandingPage(url: string, patterns: readonly LandingPattern[]): boolean {
  return patterns.some((pattern) => matchesLandingPattern(pattern, url));
}

/** Tests one custom-group rule against a URL. */
export function matchesCustomGroup(rule: CustomGroupRule, url: string): boolean {
  const parsed = parseUrl(url);
  if (!parsed) return false;
  if (!hostnameMatches(rule, parsed.hostname)) return false;
  if (rule.pathPrefix) return parsed.pathname.startsWith(rule.pathPrefix);
  return true;
}

/**
 * Returns the first custom-group rule matching this URL, or `null`.
 * Order matters: earlier rules win, so the options page lets users reorder.
 */
export function findCustomGroup(
  url: string,
  rules: readonly CustomGroupRule[],
): CustomGroupRule | null {
  return rules.find((rule) => matchesCustomGroup(rule, url)) ?? null;
}

/**
 * Hostnames that landing patterns care about. Used to bump those domains'
 * cards toward the top of the dashboard even when the specific tab isn't a
 * homepage (e.g. a GitHub issue still sorts near the GitHub homepage).
 */
export function isLandingDomain(
  domain: string,
  patterns: readonly LandingPattern[],
): boolean {
  return patterns.some((pattern) => {
    if (pattern.hostname) return pattern.hostname === domain;
    if (pattern.hostnameEndsWith) return domain.endsWith(pattern.hostnameEndsWith);
    return false;
  });
}
