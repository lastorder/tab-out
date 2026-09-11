/**
 * ui/html.ts — safe HTML construction helpers.
 *
 * Tab titles and URLs are attacker-influenced strings (any page can set its
 * own title), and the renderers build markup with template literals, so
 * everything interpolated into that markup must pass through
 * {@link escapeHtml} first — in element content and attribute values alike.
 */

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapes a value for interpolation into markup. */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
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
