import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { todayISO, shiftISODate, dayOfWeekName, isISODate } from '@/lib/dates';
import { calculateCrossTrainingCalories, resolveAthleteWeightKg } from '@/lib/calories';

export interface RecurringCrossTrainingRule {
  id: string;
  activityType: 'crossfit' | 'swimming' | 'cycling' | 'yoga' | 'martial_arts' | 'other' | string;
  title: string;
  daysOfWeek: string[]; // e.g. ['monday', 'wednesday'] or ['segunda', 'quarta']
  durationMinutes: number;
  sessionRpe?: number;
  muscleGroups?: string[];
  colorCode?: string;
}

const CANONICAL_DAY_MAP: Record<string, string> = {
  seg: 'monday',
  segunda: 'monday',
  'segunda-feira': 'monday',
  mon: 'monday',
  monday: 'monday',
  ter: 'tuesday',
  terca: 'tuesday',
  terça: 'tuesday',
  'terca-feira': 'tuesday',
  'terça-feira': 'tuesday',
  tue: 'tuesday',
  tuesday: 'tuesday',
  qua: 'wednesday',
  quarta: 'wednesday',
  'quarta-feira': 'wednesday',
  wed: 'wednesday',
  wednesday: 'wednesday',
  qui: 'thursday',
  quinta: 'thursday',
  'quinta-feira': 'thursday',
  thu: 'thursday',
  thursday: 'thursday',
  sex: 'friday',
  sexta: 'friday',
  'sexta-feira': 'friday',
  fri: 'friday',
  friday: 'friday',
  sab: 'saturday',
  sabado: 'saturday',
  sábado: 'saturday',
  sat: 'saturday',
  saturday: 'saturday',
  dom: 'sunday',
  domingo: 'sunday',
  sun: 'sunday',
  sunday: 'sunday',
};

export function normalizeDayOfWeek(day: string): string {
  const clean = (day || '').trim().toLowerCase();
  return CANONICAL_DAY_MAP[clean] || clean;
}

export const SPORT_COLOR_MAP: Record<string, string> = {
  crossfit: '#f59e0b',
  swimming: '#06b6d4',
  cycling: '#10b981',
  yoga: '#f43f5e',
  martial_arts: '#ef4444',
  other: '#8b5cf6',
};

/**
 * Extracts a valid ISO date ("YYYY-MM-DD") from `originalDate`, ignoring strategy sentinels
 * like "skip_only" or extracting the trailing date from "skip_only::2026-10-26".
 */
export function extractOriginalISODate(originalDate?: string | null): string | null {
  if (!originalDate) return null;
  if (isISODate(originalDate as unknown)) return originalDate;
  if (originalDate.includes('::')) {
    const parts = originalDate.split('::');
    const candidate = parts[parts.length - 1];
    if (isISODate(candidate as unknown)) return candidate;
  }
  return null;
}

/**
 * Determines whether a planned cross-training event should be pruned.
 * If the event was individually moved to another date by the user (originalDate !== date),
 * it is an intentional individual override and must NEVER be pruned.
 */
export function shouldPruneRecurringEvent(
  event: { date: string; eventType: string; originalDate?: string | null },
  rules: RecurringCrossTrainingRule[]
): boolean {
  const originIso = extractOriginalISODate(event.originalDate);
  // If the user individually moved this occurrence to another date, NEVER prune it!
  if (originIso && originIso !== event.date) {
    return false;
  }

  const weekday = dayOfWeekName(event.date);
  return !rules.some((r) => {
    const normDays = (r.daysOfWeek || []).map(normalizeDayOfWeek);
    return (
      normDays.includes(weekday) &&
      r.activityType.toLowerCase() === event.eventType.toLowerCase()
    );
  });
}

/**
 * Builds a set of occupied schedule slot keys ("YYYY-MM-DD::activityType" and "YYYY-MM-DD::title").
 * For events that were moved from an originalDate, marks both the new date and the originalDate
 * as occupied so that recurring generation will not resurrect the workout on the original day.
 */
export function buildOccupiedScheduleSlots(
  events: Array<{ date: string; eventType: string; title: string; originalDate?: string | null }>
): Set<string> {
  const set = new Set<string>();
  for (const ev of events) {
    set.add(`${ev.date}::${ev.eventType.toLowerCase()}`);
    set.add(`${ev.date}::${ev.title.trim().toLowerCase()}`);

    // If this event was moved from a valid ISO originalDate, mark originalDate as also occupied/overridden
    // so recurring sync will NOT recreate it on the original day!
    const originIso = extractOriginalISODate(ev.originalDate);
    if (originIso) {
      set.add(`${originIso}::${ev.eventType.toLowerCase()}`);
      set.add(`${originIso}::${ev.title.trim().toLowerCase()}`);
    }
  }
  return set;
}

/**
 * Synchronizes planned recurring cross-training events (e.g. CrossFit every Mon & Wed)
 * into CalendarEvent and CrossTrainingActivity records for the upcoming weeks.
 *
 * STRICT FORWARD-ONLY RULE:
 * - Only schedules into dates >= todayISO(). Past dates (< todayISO()) are immutable.
 * - If rules are removed, only deletes planned events in the future (>= todayISO()).
 *
 * @param athleteProfileId - ID of athlete profile (default 'singleton')
 * @param weeksAhead - Number of weeks ahead to project (default 4)
 */
export async function syncPlannedCrossTraining(
  athleteProfileId: string = 'singleton',
  weeksAhead: number = 4
): Promise<{ createdCount: number; cleanedCount: number }> {
  const athlete = await prisma.athleteProfile.findUnique({
    where: { id: athleteProfileId },
    select: { recurringCrossTraining: true },
  });

  const today = todayISO();
  const rawRules = athlete?.recurringCrossTraining;
  const rules: RecurringCrossTrainingRule[] = Array.isArray(rawRules)
    ? (rawRules as unknown as RecurringCrossTrainingRule[])
    : [];

  let createdCount = 0;
  let cleanedCount = 0;

  // 1. If no rules exist, remove any future planned recurring cross-training events and their activities
  if (rules.length === 0) {
    const futureEvents = await prisma.calendarEvent.findMany({
      where: {
        athleteProfileId,
        date: { gte: today },
        status: 'planned',
        referenceModel: 'CrossTrainingActivity',
      },
      select: { id: true, referenceId: true },
    });

    const refIds = futureEvents
      .map((e) => e.referenceId)
      .filter((id): id is string => Boolean(id));

    if (refIds.length > 0) {
      await prisma.crossTrainingActivity.deleteMany({
        where: {
          id: { in: refIds },
          status: 'planned',
        },
      });
    }

    const deletedFuture = await prisma.calendarEvent.deleteMany({
      where: {
        athleteProfileId,
        date: { gte: today },
        status: 'planned',
        referenceModel: 'CrossTrainingActivity',
      },
    });
    return { createdCount: 0, cleanedCount: deletedFuture.count };
  }

  // Prune any future planned events whose day or rule was removed, UNLESS individually moved by user
  const existingFuturePlanned = await prisma.calendarEvent.findMany({
    where: {
      athleteProfileId,
      date: { gte: today },
      status: 'planned',
      referenceModel: 'CrossTrainingActivity',
    },
    select: { id: true, date: true, eventType: true, title: true, referenceId: true, originalDate: true },
  });

  const pruneEventIds: string[] = [];
  const pruneActivityIds: string[] = [];

  for (const ev of existingFuturePlanned) {
    if (shouldPruneRecurringEvent(ev, rules)) {
      pruneEventIds.push(ev.id);
      if (ev.referenceId) {
        pruneActivityIds.push(ev.referenceId);
      }
    }
  }

  if (pruneEventIds.length > 0) {
    await prisma.$transaction(async (tx) => {
      if (pruneActivityIds.length > 0) {
        await tx.crossTrainingActivity.deleteMany({
          where: { id: { in: pruneActivityIds }, status: 'planned' },
        });
      }
      await tx.calendarEvent.deleteMany({
        where: { id: { in: pruneEventIds } },
      });
    });
    cleanedCount = pruneEventIds.length;
  }

  // 2. Pre-index existing events for the target date range to avoid redundant queries
  const horizonDays = weeksAhead * 7;
  const maxHorizonDate = shiftISODate(today, horizonDays);

  const existingEvents = await prisma.calendarEvent.findMany({
    where: {
      athleteProfileId,
      OR: [
        { date: { gte: today, lte: maxHorizonDate } },
        { originalDate: { not: null } },
      ],
    },
    select: {
      id: true,
      date: true,
      eventType: true,
      title: true,
      status: true,
      referenceModel: true,
      originalDate: true,
    },
  });

  // Map of existing and overridden event slots
  const existingSet = buildOccupiedScheduleSlots(existingEvents);

  // Pre-fetch weight for calorie calculation
  const athleteWeightKg = await resolveAthleteWeightKg(athleteProfileId, today);

  // 3. Project recurring workouts forward across each day and persist atomically
  const toCreate: Array<{
    date: string;
    activityType: string;
    title: string;
    durationMinutes: number;
    sessionRpe: number;
    caloriesBurned: number;
    muscleGroups: string[];
    colorCode: string;
  }> = [];

  for (let offset = 0; offset <= horizonDays; offset++) {
    const targetDate = shiftISODate(today, offset);
    if (targetDate < today) continue;

    const weekday = dayOfWeekName(targetDate);

    for (const rule of rules) {
      const normalizedDays = (rule.daysOfWeek || []).map(normalizeDayOfWeek);
      if (!normalizedDays.includes(weekday)) continue;

      const actType = (rule.activityType || 'crossfit').toLowerCase();
      const ruleKey = `${targetDate}::${actType}`;
      const titleKey = `${targetDate}::${(rule.title || '').trim().toLowerCase()}`;

      if (existingSet.has(ruleKey) || existingSet.has(titleKey)) {
        continue;
      }

      const durationMin = rule.durationMinutes || 60;
      const rpe = rule.sessionRpe ?? 7.5;
      const calResult = calculateCrossTrainingCalories({
        athleteWeightKg,
        durationMinutes: durationMin,
        activityType: actType,
        sessionRpe: rpe,
      });

      const colorCode = rule.colorCode || SPORT_COLOR_MAP[actType] || '#f59e0b';
      const muscleGroups =
        rule.muscleGroups && rule.muscleGroups.length > 0
          ? rule.muscleGroups
          : actType === 'crossfit'
          ? ['Pernas', 'Core', 'Full Body']
          : ['Core'];

      toCreate.push({
        date: targetDate,
        activityType: actType,
        title: rule.title || 'CrossFit WOD',
        durationMinutes: durationMin,
        sessionRpe: rpe,
        caloriesBurned: calResult.totalCalories,
        muscleGroups,
        colorCode,
      });

      existingSet.add(ruleKey);
      existingSet.add(titleKey);
    }
  }

  if (toCreate.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const item of toCreate) {
        const activity = await tx.crossTrainingActivity.create({
          data: {
            athleteProfileId,
            date: item.date,
            activityType: item.activityType,
            title: item.title,
            durationMinutes: item.durationMinutes,
            sessionRpe: item.sessionRpe,
            caloriesBurned: item.caloriesBurned,
            muscleGroups: item.muscleGroups as unknown as Prisma.InputJsonValue,
            status: 'planned',
          },
        });

        await tx.calendarEvent.create({
          data: {
            athleteProfileId,
            date: item.date,
            eventType: item.activityType,
            referenceId: activity.id,
            referenceModel: 'CrossTrainingActivity',
            title: item.title,
            status: 'planned',
            colorCode: item.colorCode,
            caloriesBurned: item.caloriesBurned,
            sortOrder: 1,
          },
        });
      }
    });
    createdCount = toCreate.length;
  }

  return { createdCount, cleanedCount };
}
