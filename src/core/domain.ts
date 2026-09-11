/**
 * core/domain.ts — turning hostnames into readable labels.
 */

import { FRIENDLY_DOMAINS } from './friendly-domains';

/** Uppercases the first character of a string. */
export function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const TLD_PATTERN =
  /\.(com|org|net|io|co|ai|dev|app|so|me|xyz|info|us|uk|co\.uk|co\.jp)$/;

/**
 * Converts a hostname into the nicest label we can manage.
 *
 *   `mail.google.com`      → `Gmail`        (known brand)
 *   `zara.substack.com`    → `Zara's Substack`
 *   `foo.github.io`        → `Foo (GitHub Pages)`
 *   `my-startup.dev`       → `My-startup`
 */
export function friendlyDomain(hostname: string | undefined | null): string {
  if (!hostname) return '';

  const known = FRIENDLY_DOMAINS[hostname];
  if (known) return known;

  if (hostname.endsWith('.substack.com') && hostname !== 'substack.com') {
    return `${capitalize(hostname.replace('.substack.com', ''))}'s Substack`;
  }
  if (hostname.endsWith('.github.io')) {
    return `${capitalize(hostname.replace('.github.io', ''))} (GitHub Pages)`;
  }

  const clean = hostname.replace(/^www\./, '').replace(TLD_PATTERN, '');
  return clean.split('.').map(capitalize).join(' ');
}
