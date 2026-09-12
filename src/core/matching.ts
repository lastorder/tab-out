/**
 * core/matching.ts — evaluating the user's declarative disposable-tab rules.
 *
 * Disposable rules are plain data objects (see `src/types`), which means they
 * can be stored in `chrome.storage` and edited from the options page. This
 * module is the single place that knows how to interpret them.
 */

import type { DisposableRule } from '../types';
import { parseUrl, registrableDomainOf } from './url';

/**
 * Shared hostname test.
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

/**
 * Registrable domains that disposable rules care about. Used to bump those
 * domains' cards toward the top of the dashboard even when the specific tab
 * isn't disposable itself (e.g. a GitHub issue still sorts near the GitHub
 * homepage).
 *
 * `domain` is already a registrable domain (see `core/url.ts`'s
 * `groupKeyOf`/`registrableDomainOf`), so a rule's exact `hostname` is
 * reduced to its own registrable domain before comparing, and a
 * `hostnameEndsWith` suffix is compared both as given (for a domain that
 * still has subdomain labels, e.g. matching won't normally see one — this
 * only exists for a corner case) and with its leading dot stripped, since
 * `.zoom.us`'s registrable domain is `zoom.us` itself, which doesn't end
 * with the dotted suffix.
 */
export function isDisposableDomain(
  domain: string,
  rules: readonly DisposableRule[],
): boolean {
  return rules.some((rule) => {
    if (rule.hostname) return registrableDomainOf(rule.hostname) === domain;
    if (rule.hostnameEndsWith) {
      const bare = rule.hostnameEndsWith.replace(/^\./, '');
      return domain === bare || domain.endsWith(rule.hostnameEndsWith);
    }
    return false;
  });
}
