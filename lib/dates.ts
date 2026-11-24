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

/**
 * Signed difference in whole days (`targetDate - startDate`).
 */
export function diffISODaysSigned(targetDate: string, startDate: string): number {
  const [ty, tm, td] = targetDate.split('-').map(Number);
  const [sy, sm, sd] = startDate.split('-').map(Number);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(sy, sm - 1, sd)) / 86_400_000
  );
}

/**
 * Returns the ISO weekday index (0 = Monday ... 6 = Sunday) for an ISO date string.
 */
export function dayOfWeekMon0(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const utcDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return utcDay === 0 ? 6 : utcDay - 1;
}

/**
 * Resolves a Date, ISO string, or nullish value into an ISO date string ("YYYY-MM-DD")
 * in the configured athlete timezone without UTC midnight shift.
 */
export function resolveISODate(
  input?: Date | string | null,
  timeZone: string = APP_TIMEZONE
): string {
  if (!input) {
    return todayISO(new Date(), timeZone);
  }
  if (isISODate(input)) {
    return input;
  }
  const parsed = new Date(input);
  if (isNaN(parsed.getTime())) {
    return todayISO(new Date(), timeZone);
  }
  return todayISO(parsed, timeZone);
}

/**
 * Returns the Monday ISO date ("YYYY-MM-DD") of the ISO week containing `dateStr`.
 */
export function mondayOfISODate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const day = utc.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
  const diffToMonday = day === 0 ? -6 : 1 - day;
  utc.setUTCDate(utc.getUTCDate() + diffToMonday);
  return utc.toISOString().slice(0, 10);
}

/**
 * Returns Monday (`startOfWeek`) and Sunday (`endOfWeek`) ISO dates for the week of `dateStr`.
 */
export function weekRangeOfISODate(dateStr: string): { startOfWeek: string; endOfWeek: string } {
  const startOfWeek = mondayOfISODate(dateStr);
  const endOfWeek = shiftISODate(startOfWeek, 6);
  return { startOfWeek, endOfWeek };
}
