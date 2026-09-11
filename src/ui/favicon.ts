/**
 * ui/favicon.ts — hiding favicons that fail to load.
 *
 * The old markup used inline `onerror="this.style.display='none'"` handlers.
 * Manifest V3's content security policy blocks inline JavaScript, so instead a
 * single capture-phase listener watches for image load failures and tags them
 * with a class the stylesheet hides.
 */

const FAILED_CLASS = 'favicon-failed';

/** Installs the global favicon error handler. Returns a teardown function. */
export function installFaviconFallback(root: Document = document): () => void {
  const handler = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLImageElement)) return;
    target.classList.add(FAILED_CLASS);
  };

  // `error` does not bubble, so listen during the capture phase.
  root.addEventListener('error', handler, true);
  return () => root.removeEventListener('error', handler, true);
}
