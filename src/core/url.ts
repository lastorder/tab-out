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

/**
 * Returns the grouping key for a tab URL.
 *
 * `file://` URLs collapse into a single "Local Files" bucket; everything else
 * groups by hostname.
 */
export function groupKeyOf(url: string | undefined | null): string {
  if (url && url.startsWith('file://')) return LOCAL_FILES_KEY;
  return hostnameOf(url);
}

/** True when the URL points at a browser-internal or extension page. */
export function isInternalUrl(url: string | undefined | null): boolean {
  if (!url) return true;
  return (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('about:') ||
    url.startsWith('edge://') ||
    url.startsWith('brave://') ||
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
