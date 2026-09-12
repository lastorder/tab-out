/**
 * core/shortcut.ts — the configurable "open search" keyboard shortcut.
 *
 * A shortcut is stored as a small, serialisable object (not a string you'd
 * have to re-parse, and not a function — settings must stay JSON-safe, see
 * `TabOutSettings`). `matchesShortcut` is the only thing that needs to know
 * how a `KeyboardEvent` maps onto it, so the options page's recorder and the
 * dashboard's listener share one definition of "does this event fire it".
 */

import type { KeyCombo } from '../types';

export type { KeyCombo };

/** The shape `matchesShortcut` needs from a real `KeyboardEvent` — kept minimal so tests don't need a DOM. */
export interface KeyEventLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/**
 * The default search shortcut, per platform. Mac uses Cmd+F (`meta`);
 * everywhere else uses Ctrl+F, since that's the muscle-memory equivalent and
 * Windows/Linux keyboards have no Cmd key.
 */
export function defaultSearchShortcut(isMac: boolean): KeyCombo {
  return { key: 'f', ctrl: !isMac, meta: isMac, alt: false, shift: false };
}

/** True when the event's key + modifiers exactly match the combo. Case-insensitive on the key. */
export function matchesShortcut(event: KeyEventLike, combo: KeyCombo): boolean {
  if (event.key.toLowerCase() !== combo.key.toLowerCase()) return false;
  return (
    event.ctrlKey === combo.ctrl &&
    event.metaKey === combo.meta &&
    event.altKey === combo.alt &&
    event.shiftKey === combo.shift
  );
}

/** Keys that are pure modifiers — never valid as the combo's main key. */
const MODIFIER_KEYS = new Set(['control', 'meta', 'alt', 'shift', 'os']);

/** Builds a combo from a live keydown event, or `null` if only modifiers were pressed so far. */
export function comboFromEvent(event: KeyEventLike): KeyCombo | null {
  const key = event.key.toLowerCase();
  if (MODIFIER_KEYS.has(key)) return null;
  return {
    key,
    ctrl: event.ctrlKey,
    meta: event.metaKey,
    alt: event.altKey,
    shift: event.shiftKey,
  };
}

/** Human-readable label for a combo, e.g. "⌘F" on Mac or "Ctrl+F" elsewhere. */
export function formatShortcut(combo: KeyCombo, isMac: boolean): string {
  const parts: string[] = [];
  if (isMac) {
    if (combo.ctrl) parts.push('\u2303');
    if (combo.alt) parts.push('\u2325');
    if (combo.shift) parts.push('\u21e7');
    if (combo.meta) parts.push('\u2318');
    parts.push(displayKey(combo.key));
    return parts.join('');
  }
  if (combo.ctrl) parts.push('Ctrl');
  if (combo.meta) parts.push('Win');
  if (combo.alt) parts.push('Alt');
  if (combo.shift) parts.push('Shift');
  parts.push(displayKey(combo.key));
  return parts.join('+');
}

function displayKey(key: string): string {
  if (key === ' ') return 'Space';
  if (key.length === 1) return key.toUpperCase();
  return key.charAt(0).toUpperCase() + key.slice(1);
}
