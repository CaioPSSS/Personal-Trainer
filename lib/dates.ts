/**
 * Timezone-safe ISO date helpers ("YYYY-MM-DD").
 *
 * The server runs in UTC on Vercel while the athlete lives in America/Sao_Paulo (UTC-3).
 * Using `new Date().toISOString().split('T')[0]` after 21:00 local time yields *tomorrow*.
 * These helpers resolve "today" in the athlete's timezone and perform pure calendar math
 * on date strings without any timezone drift.
 */

export const APP_TIMEZONE = process.env.APP_TIMEZONE || 'America/Sao_Paulo';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(value: unknown): value is string {
  return typeof value === 'string' && ISO_DATE_RE.test(value);
}

/**
 * Returns the current calendar date (YYYY-MM-DD) in the athlete's timezone.
 */
export function todayISO(now: Date = new Date(), timeZone: string = APP_TIMEZONE): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Adds (or subtracts) whole days to an ISO date string using UTC arithmetic (no DST drift).
 */
export function shiftISODate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

/**
 * Returns the lowercase English weekday name for an ISO date ("monday", ...).
 */
export function dayOfWeekName(date: string): (typeof DAY_NAMES)[number] {
  const [y, m, d] = date.split('-').map(Number);
  return DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/**
 * Absolute difference in whole days between two ISO dates.
 */
export function diffISODays(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round(
    Math.abs(Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86_400_000
  );
}
