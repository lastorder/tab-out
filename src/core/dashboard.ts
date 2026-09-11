/**
 * core/dashboard.ts — identifying which open tab (if any) is Tab Out itself.
 *
 * Shared by two independent rules that both need the same definition of
 * "this URL is a Tab Out page": the "only one dashboard" rule
 * (`newtab/singleton.ts`) and the "always keep the dashboard at the end of
 * the tab bar" rule (`core/position.ts`, driven from the background worker).
 */

/**
 * Every URL that means "a Tab Out dashboard".
 *
 * Chrome reports an overridden new tab either as the extension page URL or,
 * depending on how it was opened, as `chrome://newtab/` — so both count.
 */
export function dashboardUrls(extensionId: string): string[] {
  return [
    `chrome-extension://${extensionId}/index.html`,
    `chrome-extension://${extensionId}/index.html#`,
    'chrome://newtab/',
  ];
}
