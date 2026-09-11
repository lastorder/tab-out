/**
 * core/title.ts — making tab titles readable.
 *
 * Browser tab titles are noisy: notification counts, site-name suffixes,
 * leaked email addresses. These pure functions clean them up. They compose:
 *
 *   stripTitleNoise → smartTitle → cleanTitle
 */

import { friendlyDomain } from './domain';
import { parseUrl } from './url';

/**
 * Removes cosmetic noise from a raw tab title.
 *
 *   `(3) Inbox (16,359) - me@example.com` → `Inbox`
 *   `Zara on X: "hello"`                  → `Zara: "hello"`
 */
export function stripTitleNoise(title: string | undefined | null): string {
  if (!title) return '';
  let out = title;
  // Leading notification count: "(2) Title" / "(9+) Title"
  out = out.replace(/^\(\d+\+?\)\s*/, '');
  // Inline counts: "Inbox (16,359)"
  out = out.replace(/\s*\([\d,]+\+?\)\s*/g, ' ');
  // Email addresses, with or without a leading dash (privacy + noise)
  out = out.replace(
    /\s*[-\u2010-\u2015]\s*[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    '',
  );
  out = out.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '');
  // X/Twitter formatting
  out = out.replace(/\s+on X:\s*/, ': ');
  out = out.replace(/\s*\/\s*X\s*$/, '');
  return out.trim();
}

const TITLE_SEPARATORS = [' - ', ' | ', ' — ', ' · ', ' – '];

/** The shortest a cleaned title may be before we keep the original instead. */
const MIN_CLEANED_LENGTH = 5;

/**
 * Drops a redundant site-name suffix from a title.
 *
 *   cleanTitle('Some Article - Medium', 'medium.com') → 'Some Article'
 *
 * The suffix is only removed when it clearly names the site, and never when
 * doing so would leave a uselessly short title.
 */
export function cleanTitle(
  title: string | undefined | null,
  hostname: string | undefined | null,
): string {
  if (!title || !hostname) return title || '';

  const friendly = friendlyDomain(hostname).toLowerCase();
  const domain = hostname.replace(/^www\./, '').toLowerCase();
  const domainNoTld = domain.replace(/\.\w+$/, '');

  for (const sep of TITLE_SEPARATORS) {
    const idx = title.lastIndexOf(sep);
    if (idx === -1) continue;

    const suffix = title.slice(idx + sep.length).trim().toLowerCase();
    if (!suffix) continue;

    const looksLikeSiteName =
      suffix === domain ||
      suffix === friendly ||
      suffix === domainNoTld ||
      domain.includes(suffix) ||
      (friendly.length > 0 && friendly.includes(suffix));

    if (!looksLikeSiteName) continue;

    const cleaned = title.slice(0, idx).trim();
    if (cleaned.length >= MIN_CLEANED_LENGTH) return cleaned;
  }

  return title;
}

/**
 * Derives a better title from the URL when the tab's own title is unhelpful
 * (still loading, or literally the URL).
 *
 *   smartTitle('', 'https://github.com/a/b/pull/7') → 'a/b PR #7'
 */
export function smartTitle(
  title: string | undefined | null,
  url: string | undefined | null,
): string {
  if (!url) return title || '';
  const parsed = parseUrl(url);
  if (!parsed) return title || '';

  const { pathname, hostname } = parsed;
  const titleIsUrl =
    !title ||
    title === url ||
    title.startsWith(hostname) ||
    title.startsWith('http');

  // X / Twitter posts
  if (
    (hostname === 'x.com' || hostname === 'www.x.com' || hostname === 'twitter.com') &&
    pathname.includes('/status/')
  ) {
    const username = pathname.split('/')[1];
    if (username) return titleIsUrl ? `Post by @${username}` : (title as string);
  }

  // GitHub issues, PRs, and file views
  if (hostname === 'github.com' || hostname === 'www.github.com') {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length >= 2) {
      const [owner, repo, ...rest] = parts;
      if (rest[0] === 'issues' && rest[1]) return `${owner}/${repo} Issue #${rest[1]}`;
      if (rest[0] === 'pull' && rest[1]) return `${owner}/${repo} PR #${rest[1]}`;
      if (rest[0] === 'blob' || rest[0] === 'tree') {
        return `${owner}/${repo} — ${rest.slice(2).join('/')}`;
      }
      if (titleIsUrl) return `${owner}/${repo}`;
    }
  }

  // YouTube videos
  if (
    (hostname === 'youtube.com' || hostname === 'www.youtube.com') &&
    pathname === '/watch' &&
    titleIsUrl
  ) {
    return 'YouTube Video';
  }

  // Reddit comment threads
  if (
    (hostname === 'reddit.com' ||
      hostname === 'www.reddit.com' ||
      hostname === 'old.reddit.com') &&
    pathname.includes('/comments/')
  ) {
    const parts = pathname.split('/').filter(Boolean);
    const subIdx = parts.indexOf('r');
    const sub = subIdx !== -1 ? parts[subIdx + 1] : undefined;
    if (sub && titleIsUrl) return `r/${sub} post`;
  }

  return title || url;
}

/**
 * The full pipeline used for chip labels: strip noise, infer from the URL,
 * then drop the redundant site-name suffix.
 */
export function displayTitle(
  title: string | undefined | null,
  url: string | undefined | null,
  hostname?: string,
): string {
  const stripped = stripTitleNoise(title);
  const smart = smartTitle(stripped, url);
  return cleanTitle(smart, hostname ?? '');
}

/**
 * Prefixes localhost titles with their port so multiple dev servers are
 * distinguishable: `3000 My App`.
 */
export function withLocalhostPort(label: string, url: string): string {
  const parsed = parseUrl(url);
  if (!parsed) return label;
  if (parsed.hostname === 'localhost' && parsed.port) {
    return `${parsed.port} ${label}`;
  }
  return label;
}
