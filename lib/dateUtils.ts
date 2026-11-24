import { APP_TIMEZONE, diffISODaysSigned, isISODate, shiftISODate, todayISO } from './dates';

export function getLocalISODate(date = new Date()): string {
  return todayISO(date, APP_TIMEZONE);
}

export function getYesterdayLocalISODate(): string {
  return shiftISODate(todayISO(new Date(), APP_TIMEZONE), -1);
}

export function calculateCurrentWeek(
  startDateOrCreatedAt?: Date | string | null,
  durationWeeks = 4,
  referenceDateISO?: string
): number {
  if (!startDateOrCreatedAt) return 1;

  let startISO: string;
  if (typeof startDateOrCreatedAt === 'string' && isISODate(startDateOrCreatedAt)) {
    startISO = startDateOrCreatedAt;
  } else {
    const parsed = new Date(startDateOrCreatedAt);
    if (isNaN(parsed.getTime())) return 1;
    startISO = todayISO(parsed, APP_TIMEZONE);
  }

  const refISO =
    referenceDateISO && isISODate(referenceDateISO)
      ? referenceDateISO
      : todayISO(new Date(), APP_TIMEZONE);

  const daysSinceStart = diffISODaysSigned(refISO, startISO);
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
