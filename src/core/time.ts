/**
 * core/time.ts — date formatting helpers.
 *
 * Every function takes an explicit "now" so tests are deterministic and do not
 * need fake timers.
 */

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/**
 * Converts an ISO timestamp into a friendly relative string.
 *
 *   timeAgo('2026-04-04T10:00:00Z', new Date('2026-04-04T12:00:00Z')) → '2 hrs ago'
 */
export function timeAgo(dateStr: string | undefined | null, now: Date = new Date()): string {
  if (!dateStr) return '';
  const then = new Date(dateStr);
  if (Number.isNaN(then.getTime())) return '';

  const delta = now.getTime() - then.getTime();
  const minutes = Math.floor(delta / MINUTE);
  const hours = Math.floor(delta / HOUR);
  const days = Math.floor(delta / DAY);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours} hr${hours !== 1 ? 's' : ''} ago`;
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

/** "Good morning" / "Good afternoon" / "Good evening". */
export function getGreeting(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** "Friday, April 4, 2026". */
export function getDateDisplay(now: Date = new Date(), locale = 'en-US'): string {
  return now.toLocaleDateString(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
