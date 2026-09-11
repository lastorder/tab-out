/**
 * ui/html.ts — safe HTML construction helpers.
 *
 * Tab titles and URLs are attacker-influenced strings (any page can set its own
 * title), and the renderers build markup with template literals. Everything
 * interpolated into that markup must pass through {@link escapeHtml} or
 * {@link attr} first.
 */

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapes text for interpolation into element content. */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/** Escapes a value for interpolation into a double-quoted attribute. */
export function attr(value: unknown): string {
  return escapeHtml(value);
}

/** Joins rendered fragments, dropping empty ones. */
export function join(parts: readonly (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join('');
}

/** Renders `count` with the right plural suffix: `1 tab` / `2 tabs`. */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** Google's favicon service URL for a hostname. Empty string when unknown. */
export function faviconUrl(hostname: string, size = 16): string {
  if (!hostname) return '';
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=${size}`;
}
