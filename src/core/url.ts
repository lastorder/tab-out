/**
 * core/url.ts — small, dependency-free URL helpers.
 *
 * Every function here is total: malformed input yields a sensible fallback
 * instead of throwing, because tab URLs are frequently exotic
 * (`chrome://`, `file://`, `about:blank`, extension pages…).
 */

/** Key used to group `file://` tabs, which have no hostname. */
export const LOCAL_FILES_KEY = 'local-files';

/** Parses a URL, returning `null` instead of throwing on malformed input. */
export function parseUrl(url: string | undefined | null): URL | null {
  if (!url) return null;
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** Returns the hostname of a URL, or `''` when it cannot be parsed. */
export function hostnameOf(url: string | undefined | null): string {
  return parseUrl(url)?.hostname ?? '';
}

/** Returns the pathname of a URL, or `''` when it cannot be parsed. */
export function pathnameOf(url: string | undefined | null): string {
  return parseUrl(url)?.pathname ?? '';
}

/**
 * Second-level public-suffix-style labels under which the *third* label from
 * the end is still part of the registrable domain (`acme.co.uk`, not
 * `co.uk`). Not an exhaustive public-suffix-list implementation — just the
 * common real-world cases — since Tab Out only needs "close enough" grouping,
 * not exact registrability.
 */
const KNOWN_SECOND_LEVEL_SUFFIXES: ReadonlySet<string> = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'net.uk', 'sch.uk',
  'com.cn', 'net.cn', 'org.cn', 'gov.cn',
  'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
  'co.nz', 'net.nz', 'org.nz',
  'co.in', 'net.in', 'org.in', 'gov.in', 'firm.in',
  'co.kr', 'or.kr',
  'com.br', 'net.br', 'org.br',
  'com.mx',
  'co.za',
  'com.tw', 'org.tw',
  'com.sg', 'net.sg', 'org.sg',
  'com.hk', 'org.hk', 'net.hk',
]);

/**
 * Returns the registrable domain (colloquially the "second-level domain") of
 * a hostname: the site's identity, ignoring which subdomain a particular
 * page lives on. `mail.google.com` and `calendar.google.com` both become
 * `google.com`, so they land in the same dashboard card without needing a
 * merge rule.
 *
 * Hosts with two labels or fewer (`example.com`, `localhost`) are returned
 * unchanged, as are bare IPv4/IPv6 addresses — there is nothing to strip.
 */
export function registrableDomainOf(hostname: string): string {
  if (!hostname) return '';
  if (/^[0-9.]+$/.test(hostname)) return hostname; // IPv4
  if (hostname.includes(':')) return hostname; // IPv6, already bracket-free from URL parsing

  const labels = hostname.split('.');
  if (labels.length <= 2) return hostname;

  const lastTwo = labels.slice(-2).join('.');
  if (labels.length >= 3 && KNOWN_SECOND_LEVEL_SUFFIXES.has(lastTwo)) {
    return labels.slice(-3).join('.');
  }
  return lastTwo;
}

/**
 * Returns the grouping key for a tab URL.
 *
 * `file://` URLs collapse into a single "Local Files" bucket; everything else
 * groups by registrable domain, so subdomains of the same site share a card.
 */
export function groupKeyOf(url: string | undefined | null): string {
  if (url && url.startsWith('file://')) return LOCAL_FILES_KEY;
  return registrableDomainOf(hostnameOf(url));
}

/**
 * True when the URL should be treated as "not a real tab" — never grouped,
 * counted, closed by "close all", or recorded into history.
 *
 * This is deliberately narrow. Browser system pages (`chrome://extensions`,
 * `chrome://settings`, `edge://...`, `brave://...`) are real tabs the user
 * opens and closes on purpose, so they group and behave like any other page.
 * What stays excluded:
 *   - `chrome://newtab/` — this is how Chrome sometimes reports the
 *     extension's own overridden new tab page; treating it as a normal tab
 *     would let a duplicate dashboard get grouped as a "newtab.com" card.
 *   - `chrome-extension://` — any extension's UI pages, not just this one's.
 *   - `about:` — `about:blank` is a transient placeholder while a tab is
 *     still loading, not a page the user is looking at.
 *   - `devtools://` — not a content tab.
 */
export function isInternalUrl(url: string | undefined | null): boolean {
  if (!url) return true;
  if (url === 'chrome://newtab/') return true;
  return (
    url.startsWith('chrome-extension://') ||
    url.startsWith('about:') ||
    url.startsWith('devtools://')
  );
}

/** Strips a leading `www.` from a hostname. */
export function stripWww(hostname: string): string {
  return hostname.replace(/^www\./, '');
}

/**
 * Normalises user input from the options page into a valid absolute URL.
 * Bare hosts like `example.com` become `https://example.com`.
 * Returns `''` when the input cannot be salvaged.
 */
export function normalizeUrlInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  const parsed = parseUrl(candidate);
  if (!parsed) return '';
  if (!parsed.hostname) return '';
  return parsed.toString();
}
