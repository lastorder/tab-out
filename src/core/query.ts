/**
 * core/query.ts — how a typed search query is turned into terms, and how a
 * record's text is tested against them.
 *
 * Every search box in Tab Out shares these rules, so "type two words to
 * narrow" behaves identically in the dashboard overlay, the browser-global
 * popup, the History panel and the saved-tabs archive. Pure: no `chrome.*`,
 * no DOM.
 */

/**
 * Splits a raw query into lower-cased terms on whitespace.
 *
 * A space-separated query *narrows* rather than widens: `"tab doc"` is
 * everything matching `"tab"`, filtered down to those also matching `"doc"` —
 * exactly what you'd get by searching for one term and refining with the next.
 * A blank query yields no terms, which {@link matchesQueryTerms} treats as
 * "match everything".
 */
export function tokenizeQuery(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 0);
}

/**
 * Case-insensitive substring match of every term against at least one field.
 *
 * Terms are independent: one may match the title and another the URL. An empty
 * term list (a blank query) matches everything.
 */
export function matchesQueryTerms(terms: readonly string[], fields: readonly string[]): boolean {
  if (terms.length === 0) return true;
  const haystack = fields.map((field) => field.toLowerCase());
  return terms.every((term) => haystack.some((field) => field.includes(term)));
}
