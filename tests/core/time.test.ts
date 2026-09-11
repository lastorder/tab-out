import { describe, expect, it } from 'vitest';
import { getDateDisplay, getGreeting, timeAgo } from '@/core/time';

describe('timeAgo', () => {
  const now = new Date('2026-04-04T12:00:00.000Z');

  it.each([
    ['2026-04-04T11:59:30.000Z', 'just now'],
    ['2026-04-04T11:45:00.000Z', '15 min ago'],
    ['2026-04-04T11:00:00.000Z', '1 hr ago'],
    ['2026-04-04T09:00:00.000Z', '3 hrs ago'],
    ['2026-04-03T09:00:00.000Z', 'yesterday'],
    ['2026-03-30T12:00:00.000Z', '5 days ago'],
  ])('renders %s as "%s"', (input, expected) => {
    expect(timeAgo(input, now)).toBe(expected);
  });

  it('returns an empty string for missing or invalid input', () => {
    expect(timeAgo('', now)).toBe('');
    expect(timeAgo(undefined, now)).toBe('');
    expect(timeAgo('not a date', now)).toBe('');
  });
});

describe('getGreeting', () => {
  const at = (hour: number): Date => new Date(2026, 3, 4, hour, 0, 0);

  it.each([
    [0, 'Good morning'],
    [11, 'Good morning'],
    [12, 'Good afternoon'],
    [16, 'Good afternoon'],
    [17, 'Good evening'],
    [23, 'Good evening'],
  ])('at %i:00 says "%s"', (hour, expected) => {
    expect(getGreeting(at(hour))).toBe(expected);
  });
});

describe('getDateDisplay', () => {
  it('renders a long, human-readable date', () => {
    expect(getDateDisplay(new Date(2026, 3, 4), 'en-US')).toBe('Saturday, April 4, 2026');
  });
});
