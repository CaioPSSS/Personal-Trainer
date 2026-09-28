export function getLocalISODate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getYesterdayLocalISODate(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return getLocalISODate(yesterday);
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
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);
}

