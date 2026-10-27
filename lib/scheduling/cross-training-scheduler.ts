import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { todayISO, shiftISODate, dayOfWeekName } from '@/lib/dates';
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
 * Determines whether a planned cross-training event should be pruned.
 * If the event was individually moved to another date by the user (originalDate !== date),
 * it is an intentional individual override and must NEVER be pruned.
 */
export function shouldPruneRecurringEvent(
  event: { date: string; eventType: string; originalDate?: string | null },
  rules: RecurringCrossTrainingRule[]
): boolean {
  // If the user individually moved this occurrence to another date, NEVER prune it!
  if (event.originalDate && event.originalDate !== event.date) {
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

    // If this event was moved from originalDate, mark originalDate as also occupied/overridden
    // so recurring sync will NOT recreate it on the original day!
    if (ev.originalDate) {
      set.add(`${ev.originalDate}::${ev.eventType.toLowerCase()}`);
      set.add(`${ev.originalDate}::${ev.title.trim().toLowerCase()}`);
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

  // 1. If no rules exist, remove any future planned recurring cross-training events
  if (rules.length === 0) {
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

  for (const ev of existingFuturePlanned) {
    if (shouldPruneRecurringEvent(ev, rules)) {
      if (ev.referenceId) {
        await prisma.crossTrainingActivity.deleteMany({
          where: { id: ev.referenceId, status: 'planned' },
        });
      }
      await prisma.calendarEvent.delete({ where: { id: ev.id } });
      cleanedCount++;
    }
  }

  // 2. Pre-index existing events for the target date range to avoid redundant queries
  const horizonDays = weeksAhead * 7;
  const maxHorizonDate = shiftISODate(today, horizonDays);

  const existingEvents = await prisma.calendarEvent.findMany({
    where: {
      athleteProfileId,
      OR: [
        { date: { gte: today, lte: maxHorizonDate } },
        { originalDate: { gte: today, lte: maxHorizonDate } },
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

  // 3. Project recurring workouts forward across each day
  for (let offset = 0; offset <= horizonDays; offset++) {
    const targetDate = shiftISODate(today, offset);
    // Strict forward-only safety
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

      // Calculate estimated calories
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

      // Create CrossTrainingActivity with status 'planned'
      const activity = await prisma.crossTrainingActivity.create({
        data: {
          athleteProfileId,
          date: targetDate,
          activityType: actType,
          title: rule.title || 'CrossFit WOD',
          durationMinutes: durationMin,
          sessionRpe: rpe,
          caloriesBurned: calResult.totalCalories,
          muscleGroups: muscleGroups as unknown as Prisma.InputJsonValue,
          status: 'planned',
        },
      });

      // Create matching planned CalendarEvent
      await prisma.calendarEvent.create({
        data: {
          athleteProfileId,
          date: targetDate,
          eventType: actType,
          referenceId: activity.id,
          referenceModel: 'CrossTrainingActivity',
          title: rule.title || 'CrossFit WOD',
          status: 'planned',
          colorCode,
          caloriesBurned: calResult.totalCalories,
          sortOrder: 1,
        },
      });

      existingSet.add(ruleKey);
      existingSet.add(titleKey);
      createdCount++;
    }
  }

  return { createdCount, cleanedCount };
}
