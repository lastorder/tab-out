// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { showToast } from '@/ui/toast';
import { installFaviconFallback } from '@/ui/favicon';

describe('showToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <div class="toast" id="toast"><span id="toastText"></span></div>`;
  });

  afterEach(() => vi.useRealTimers());

  it('shows a message and hides it again', () => {
    const toast = document.getElementById('toast')!;

    showToast('Tab closed');
    expect(document.getElementById('toastText')!.textContent).toBe('Tab closed');
    expect(toast.classList.contains('visible')).toBe(true);

    vi.advanceTimersByTime(2600);
    expect(toast.classList.contains('visible')).toBe(false);
  });

  it('restarts the timer when called again, so the second message is not cut short', () => {
    const toast = document.getElementById('toast')!;

    showToast('First');
    vi.advanceTimersByTime(2000);
    showToast('Second');

    // The original 2.5s deadline passes, but the new one has not.
    vi.advanceTimersByTime(1000);
    expect(toast.classList.contains('visible')).toBe(true);
    expect(document.getElementById('toastText')!.textContent).toBe('Second');

    vi.advanceTimersByTime(2000);
    expect(toast.classList.contains('visible')).toBe(false);
  });

  it('does nothing when the toast element is absent', () => {
    document.body.innerHTML = '';
    expect(() => showToast('nope')).not.toThrow();
  });
});

describe('installFaviconFallback', () => {
  // The listener is attached to the shared `document`, so each test must
  // remove its own; otherwise a leaked listener makes the teardown case pass
  // for the wrong reason.
  let teardown: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = '<img id="fav" src="https://example.com/missing.png">';
  });

  afterEach(() => {
    teardown?.();
    teardown = null;
  });

  it('hides an image that fails to load', () => {
    teardown = installFaviconFallback(document);
    const img = document.getElementById('fav')!;

    img.dispatchEvent(new Event('error'));
    expect(img.classList.contains('favicon-failed')).toBe(true);
  });

  it('ignores error events from non-image elements', () => {
    teardown = installFaviconFallback(document);
    const div = document.createElement('div');
    document.body.appendChild(div);

    expect(() => div.dispatchEvent(new Event('error'))).not.toThrow();
    expect(div.classList.contains('favicon-failed')).toBe(false);
  });

  it('stops listening after teardown', () => {
    installFaviconFallback(document)();

    const img = document.getElementById('fav')!;
    img.dispatchEvent(new Event('error'));
    expect(img.classList.contains('favicon-failed')).toBe(false);
  });
});
