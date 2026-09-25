/**
 * core/matching.ts — evaluating the user's declarative disposable-tab rules.
 *
 * Disposable rules are plain data objects (see `src/types`), which means they
 * can be stored in `chrome.storage` and edited from the options page. This
 * module is the single place that knows how to interpret them.
 *
 * A rule is a single glob-style `pattern` string matched against the tab's
 * full URL, scheme included. `*` matches any run of characters — including
 * `/` — so a rule isn't split into separate hostname/path fields any more:
 * `https://x.com/*` matches every page on that site, `https://github.com/*`
 * matches every page under any GitHub path, `file:///Users/me/notes/*`
 * matches every local file under that folder, and a bare `*` matches every
 * URL on the internet (or on disk). Everything else in the pattern is
 * matched literally.
 */

import type { DisposableRule } from '../types';

/** Cache of compiled patterns, since the same rules are tested repeatedly. */
const compiledCache = new Map<string, RegExp>();

/**
 * Compiles a glob pattern into a `RegExp` that matches a whole string.
 * `*` becomes `.*` (any characters, including `/`); every other character is
 * escaped so it's matched literally.
 */
function compilePattern(pattern: string): RegExp {
  const cached = compiledCache.get(pattern);
  if (cached) return cached;

  const escaped = pattern
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  const regex = new RegExp(`^${escaped}$`);

  compiledCache.set(pattern, regex);
  return regex;
}

/**
 * Tests one disposable rule against a URL. The rule's `pattern` is matched
 * against the whole URL — including the scheme, so `file:///Users/…` or
 * `chrome://…` patterns work exactly like `https://…` ones — which is why a
 * bare `*` legitimately matches everything, and an empty pattern never
 * matches (see {@link isDisposable}'s callers, and `config/schema.ts`'s
 * validation).
 */
export function matchesDisposableRule(rule: DisposableRule, url: string): boolean {
  if (!rule.pattern) return false;
  return compilePattern(rule.pattern).test(url);
}

/** True when any rule considers this URL disposable. */
export function isDisposable(url: string, rules: readonly DisposableRule[]): boolean {
  return rules.some((rule) => matchesDisposableRule(rule, url));
}
