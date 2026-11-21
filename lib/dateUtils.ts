import { APP_TIMEZONE, isISODate, signedDiffISODays, todayISO, shiftISODate } from './dates';

export function getLocalISODate(date = new Date()): string {
  return todayISO(date, APP_TIMEZONE);
}

export function getYesterdayLocalISODate(): string {
  return shiftISODate(todayISO(new Date(), APP_TIMEZONE), -1);
}

export function calculateCurrentWeek(
  startOrCreatedAt?: Date | string | null,
  durationWeeks = 4,
  todayStr: string = todayISO()
): number {
  if (!startOrCreatedAt) return 1;

  let startISO: string;
  if (typeof startOrCreatedAt === 'string' && isISODate(startOrCreatedAt)) {
    startISO = startOrCreatedAt;
  } else {
    const parsed = new Date(startOrCreatedAt);
    if (isNaN(parsed.getTime())) return 1;
    startISO = todayISO(parsed, APP_TIMEZONE);
  }

  const daysSinceStart = signedDiffISODays(startISO, todayStr);
  if (daysSinceStart < 0) return 1;
  return Math.min(durationWeeks, Math.max(1, Math.floor(daysSinceStart / 7) + 1));
}

export function formatDateLongPTBR(date = new Date()): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: APP_TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);
}
