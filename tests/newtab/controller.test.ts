// @vitest-environment jsdom

/**
 * Tests for RenderScheduler — the debounce/mute layer between browser tab
 * events and a full dashboard repaint.
 *
 * The subtle requirement is that muting must be a *delay*, not a *drop*.
 * Closing a tab from the dashboard suppresses repaints so the confetti and
 * fade-out animations aren't cut short — but the state that changed during
 * that window (a pinned site losing its last tab and reverting to a
 * click-to-open placeholder, say) still has to be reconciled afterwards,
 * without the user having to refresh the page.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RenderScheduler } from '@/newtab/controller';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('RenderScheduler.schedule', () => {
  it('debounces bursts of events into a single render', () => {
    const render = vi.fn().mockResolvedValue(undefined);
    const scheduler = new RenderScheduler(render, 300);

    scheduler.schedule();
    scheduler.schedule();
    scheduler.schedule();

    expect(render).not.toHaveBeenCalled();
    vi.advanceTimersByTime(350);
    expect(render).toHaveBeenCalledTimes(1);
  });
});

describe('RenderScheduler.suppress', () => {
  it('does not repaint during the muted window, so animations can finish', () => {
    const render = vi.fn().mockResolvedValue(undefined);
    const scheduler = new RenderScheduler(render, 300);

    scheduler.suppress(800);
    scheduler.schedule();

    vi.advanceTimersByTime(400);
    expect(render).not.toHaveBeenCalled();
  });

  it('still repaints once after the window expires, reconciling anything missed', () => {
    const render = vi.fn().mockResolvedValue(undefined);
    const scheduler = new RenderScheduler(render, 300);

    scheduler.suppress(800);
    scheduler.schedule();

    vi.advanceTimersByTime(1000);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('catches up even when no event arrived during the window', () => {
    // The dashboard mutates the DOM itself when closing a tab, so the
    // catch-up render is what restores true state regardless of whether a
    // browser event happened to fire.
    const render = vi.fn().mockResolvedValue(undefined);
    const scheduler = new RenderScheduler(render, 300);

    scheduler.suppress(800);

    vi.advanceTimersByTime(1000);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('collapses overlapping suppressions into one catch-up render', () => {
    const render = vi.fn().mockResolvedValue(undefined);
    const scheduler = new RenderScheduler(render, 300);

    scheduler.suppress(800);
    vi.advanceTimersByTime(100);
    scheduler.suppress(800);

    vi.advanceTimersByTime(1000);
    expect(render).toHaveBeenCalledTimes(1);
  });
});
