/**
 * core/matching.ts — evaluating the user's declarative grouping rules.
 *
 * Both disposable rules and custom-group rules are plain data objects (see
 * `src/types`), which means they can be stored in `chrome.storage` and edited
 * from the options page. This module is the single place that knows how to
 * interpret them.
 */

import type { CustomGroupRule, DisposableRule } from '../types';
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
 * Tests one disposable rule against a URL.
 *
 * Path constraints are checked in priority order — `pathPrefix`, then
 * `pathExact` — and when neither is given the rule only matches the site root.
 * `urlNotContains` runs last and can veto an otherwise successful match; it is
 * how "the Gmail inbox is disposable, but an individual thread is not" is
 * expressed without any code.
 */
export function matchesDisposableRule(rule: DisposableRule, url: string): boolean {
  const parsed = parseUrl(url);
  if (!parsed) return false;
  if (!hostnameMatches(rule, parsed.hostname)) return false;

  if (rule.urlNotContains?.some((needle) => needle && url.includes(needle))) {
    return false;
  }

  if (rule.pathPrefix) return parsed.pathname.startsWith(rule.pathPrefix);
  if (rule.pathExact?.length) return rule.pathExact.includes(parsed.pathname);
  return parsed.pathname === '/';
}

/** True when any rule considers this URL disposable. */
export function isDisposable(url: string, rules: readonly DisposableRule[]): boolean {
  return rules.some((rule) => matchesDisposableRule(rule, url));
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
 * Hostnames that disposable rules care about. Used to bump those domains'
 * cards toward the top of the dashboard even when the specific tab isn't
 * disposable itself (e.g. a GitHub issue still sorts near the GitHub
 * homepage).
 */
export function isDisposableDomain(
  domain: string,
  rules: readonly DisposableRule[],
): boolean {
  return rules.some((rule) => {
    if (rule.hostname) return rule.hostname === domain;
    if (rule.hostnameEndsWith) return domain.endsWith(rule.hostnameEndsWith);
    return false;
  });
}
