/**
 * tests/setup.ts — global test setup.
 *
 * Deliberately almost empty: the production code reaches the browser only
 * through the `BrowserTabs` and `KeyValueStore` seams, so tests inject fakes
 * instead of patching globals. If a test ever needs `globalThis.chrome`, that
 * is a hint the module under test should take a dependency instead.
 */

export {};
