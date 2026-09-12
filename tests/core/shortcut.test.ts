import { describe, expect, it } from 'vitest';
import {
  comboFromEvent,
  defaultSearchShortcut,
  formatShortcut,
  matchesShortcut,
} from '@/core/shortcut';

describe('defaultSearchShortcut', () => {
  it('uses Cmd+F on Mac and Ctrl+F elsewhere', () => {
    expect(defaultSearchShortcut(true)).toEqual({ key: 'f', ctrl: false, meta: true, alt: false, shift: false });
    expect(defaultSearchShortcut(false)).toEqual({ key: 'f', ctrl: true, meta: false, alt: false, shift: false });
  });
});

describe('matchesShortcut', () => {
  const combo = { key: 'f', ctrl: false, meta: true, alt: false, shift: false };

  it('matches when key and every modifier line up exactly', () => {
    expect(matchesShortcut({ key: 'f', ctrlKey: false, metaKey: true, altKey: false, shiftKey: false }, combo)).toBe(
      true,
    );
  });

  it('is case-insensitive on the key', () => {
    expect(matchesShortcut({ key: 'F', ctrlKey: false, metaKey: true, altKey: false, shiftKey: false }, combo)).toBe(
      true,
    );
  });

  it('rejects a modifier mismatch, even with the right key', () => {
    expect(matchesShortcut({ key: 'f', ctrlKey: true, metaKey: true, altKey: false, shiftKey: false }, combo)).toBe(
      false,
    );
    expect(matchesShortcut({ key: 'f', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }, combo)).toBe(
      false,
    );
  });

  it('rejects a different key entirely', () => {
    expect(matchesShortcut({ key: 'g', ctrlKey: false, metaKey: true, altKey: false, shiftKey: false }, combo)).toBe(
      false,
    );
  });
});

describe('comboFromEvent', () => {
  it('builds a combo from a real key press', () => {
    expect(
      comboFromEvent({ key: 'k', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }),
    ).toEqual({ key: 'k', ctrl: true, meta: false, alt: false, shift: false });
  });

  it('returns null for a bare modifier key press', () => {
    for (const key of ['Control', 'Meta', 'Alt', 'Shift']) {
      expect(comboFromEvent({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false })).toBeNull();
    }
  });

  it('lower-cases the key', () => {
    expect(
      comboFromEvent({ key: 'F', ctrlKey: false, metaKey: true, altKey: false, shiftKey: false }),
    ).toEqual({ key: 'f', ctrl: false, meta: true, alt: false, shift: false });
  });
});

describe('formatShortcut', () => {
  it('renders Mac symbols in the conventional order', () => {
    expect(formatShortcut({ key: 'f', ctrl: false, meta: true, alt: false, shift: false }, true)).toBe('\u2318F');
    expect(
      formatShortcut({ key: 'k', ctrl: true, meta: true, alt: true, shift: true }, true),
    ).toBe('\u2303\u2325\u21e7\u2318K');
  });

  it('renders Windows/Linux style text joined with +', () => {
    expect(formatShortcut({ key: 'f', ctrl: true, meta: false, alt: false, shift: false }, false)).toBe('Ctrl+F');
    expect(
      formatShortcut({ key: 'k', ctrl: true, meta: false, alt: false, shift: true }, false),
    ).toBe('Ctrl+Shift+K');
  });

  it('special-cases the space key', () => {
    expect(formatShortcut({ key: ' ', ctrl: false, meta: true, alt: false, shift: false }, true)).toBe('\u2318Space');
  });
});
