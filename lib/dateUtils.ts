import { APP_TIMEZONE, todayISO, shiftISODate } from './dates';

export function getLocalISODate(date = new Date()): string {
  return todayISO(date, APP_TIMEZONE);
}

export function getYesterdayLocalISODate(): string {
  return shiftISODate(todayISO(new Date(), APP_TIMEZONE), -1);
}

export function calculateCurrentWeek(createdAt?: Date | string | null, durationWeeks = 4): number {
  if (!createdAt) return 1;
  const createdTime = new Date(createdAt).getTime();
  if (isNaN(createdTime)) return 1;
  const daysSinceStart = Math.max(0, Math.floor((Date.now() - createdTime) / (1000 * 60 * 60 * 24)));
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
