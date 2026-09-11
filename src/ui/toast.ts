/**
 * ui/toast.ts — the brief confirmation popup at the bottom of the screen.
 */

const TOAST_DURATION_MS = 2500;

let hideTimer: number | null = null;

/** Shows a transient message. Repeated calls restart the timer. */
export function showToast(message: string): void {
  const toast = document.getElementById('toast');
  const text = document.getElementById('toastText');
  if (!toast || !text) return;

  text.textContent = message;
  toast.classList.add('visible');

  if (hideTimer !== null) window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    toast.classList.remove('visible');
    hideTimer = null;
  }, TOAST_DURATION_MS);
}
