import { prisma } from '@/lib/prisma';
import {
  todayISO,
  shiftISODate,
  isISODate,
  mondayOfISODate,
  weekRangeOfISODate,
  dayOfWeekMon0,
  resolveISODate,
} from '@/lib/dates';

/**
 * Returns Monday (start of week) at 00:00:00 UTC for a given date.
 */
export function getMondayOfDate(d: Date): Date {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay(); // 0 is Sunday, 1 is Monday...
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}
export const getMondayOfWeek = getMondayOfDate;

/**
 * Formats a Date object as YYYY-MM-DD.
 */
export function formatISODate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
export const formatDateISO = formatISODate;

/**
 * Parses user-configured available days into standard Monday=0 to Sunday=6 numbers.
 * Supports numbers (0..6), Portuguese day abbreviations ("seg", "ter", etc.), and English day names.
 */
export function parseAvailableDayIndices(availableDays: unknown): number[] {
  if (!availableDays) {
    return [0, 1, 2, 3, 4]; // Default: Mon to Fri
  }

  const rawList = Array.isArray(availableDays) ? availableDays : [availableDays];
  const parsed = new Set<number>();

  const DAY_MAP: Record<string, number> = {
    // Portuguese
    seg: 0,
    segunda: 0,
    'segunda-feira': 0,
    ter: 1,
    terca: 1,
    terça: 1,
    'terca-feira': 1,
    'terça-feira': 1,
    qua: 2,
    quarta: 2,
    'quarta-feira': 2,
    qui: 3,
    quinta: 3,
    'quinta-feira': 3,
    sex: 4,
    sexta: 4,
    'sexta-feira': 4,
    sab: 5,
    sabado: 5,
    sábado: 5,
    dom: 6,
    domingo: 6,
    // English
    mon: 0,
    monday: 0,
    tue: 1,
    tuesday: 1,
    wed: 2,
    wednesday: 2,
    thu: 3,
    thursday: 3,
    fri: 4,
    friday: 4,
    sat: 5,
    saturday: 5,
    sun: 6,
    sunday: 6,
  };

  for (const item of rawList) {
    if (typeof item === 'number' && item >= 0 && item <= 6) {
      parsed.add(item);
    } else if (typeof item === 'string') {
      const clean = item.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (DAY_MAP[clean] !== undefined) {
        parsed.add(DAY_MAP[clean]);
      } else if (!isNaN(Number(clean)) && Number(clean) >= 0 && Number(clean) <= 6) {
        parsed.add(Number(clean));
      }
    }
  }

  const result = Array.from(parsed).sort((a, b) => a - b);
  return result.length > 0 ? result : [0, 1, 2, 3, 4];
}

/**
 * Detects if a strength workout involves lower body (legs, quads, glutes, hamstrings, calves).
 */
export function isLowerBodyWorkout(workout: {
  title?: string | null;
  label?: string | null;
  prescriptions?: Array<{ movementPattern?: string | null; exerciseName?: string | null }>;
}): boolean {
  const text = `${workout.title || ''} ${workout.label || ''}`.toLowerCase();
  const lowerPatterns = /(leg|perna|inferior|lower|quad|gl[uú]teo|coxa|panturrilha|squat|agachamento|stiff|terra|afundo)/i;

  if (lowerPatterns.test(text)) {
    return true;
  }

  if (workout.prescriptions && workout.prescriptions.length > 0) {
    const lowerMovementPatterns = new Set([
      'squat',
      'hinge',
      'lunge',
      'knee_extension',
      'knee_flexion',
      'quad_isolation',
      'hamstring_isolation',
      'calf',
      'calf_raise',
      'hip_thrust',
      'glute',
      'glute_isolation',
      'adductor',
      'abductor',
    ]);
    return workout.prescriptions.some((p) => {
      const mp = (p.movementPattern || '').toLowerCase();
      const ex = (p.exerciseName || '').toLowerCase();
      return lowerMovementPatterns.has(mp) || lowerPatterns.test(ex);
    });
  }

  return false;
}

/**
 * Detects if a strength workout involves upper body (push, pull, chest, back, shoulders, arms).
 */
export function isUpperBodyWorkout(workout: {
  title?: string | null;
  label?: string | null;
}): boolean {
  const text = `${workout.title || ''} ${workout.label || ''}`.toLowerCase();
  const upperPatterns = /(upper|superior|push|pull|empurrar|puxar|peito|costas|ombro|bra[çc]o|biceps|triceps)/i;
  return upperPatterns.test(text);
}

export interface CalendarEventScheduleContext {
  id?: string;
  date: string; // YYYY-MM-DD
  dayIndex: number; // 0..6 (Mon..Sun)
  eventType: string; // 'strength' | 'running' | 'crossfit' | 'swimming' | 'cycling' | string
  status?: string; // 'completed' | 'planned' | 'skipped'
  title?: string;
  referenceModel?: string | null;
  runningSessionType?: string; // 'long_run', 'intervals', 'tempo', 'easy', etc.
  muscleGroups?: string[];
  sessionRpe?: number | null;
}

/**
 * Assesses the physiological fatigue and impact of a running session.
 */
export function getRunningFatigue(event: CalendarEventScheduleContext): {
  isLongRun: boolean;
  isSpeedWork: boolean;
  isHighImpact: boolean;
} {
  const type = (event.runningSessionType || '').toLowerCase();
  const title = (event.title || '').toLowerCase();

  const isLongRun = type === 'long_run' || /longo|long\s*run/i.test(title);
  const isSpeedWork =
    ['intervals', 'tempo', 'hill_repeats', 'fartlek', 'race_pace'].includes(type) ||
    /tiro|interval|ritmo|subida|limiar|pace/i.test(title);

  return {
    isLongRun,
    isSpeedWork,
    isHighImpact: isLongRun || isSpeedWork,
  };
}

/**
 * Assesses the physiological demand and muscle groups of a cross-training activity (e.g. CrossFit).
 */
export function getCrossTrainingFatigue(event: CalendarEventScheduleContext): {
  isCrossFit: boolean;
  hasLegs: boolean;
  hasUpper: boolean;
  isHighIntensity: boolean;
} {
  const type = (event.eventType || '').toLowerCase();
  const title = (event.title || '').toLowerCase();
  const isCrossFit = type === 'crossfit' || /crossfit/i.test(title);

  const muscles = (event.muscleGroups || []).map((m) => m.toLowerCase());
  const rpe = event.sessionRpe ?? 7;

  // CrossFit standardly taxes lower body unless explicitly isolated
  const hasLegs =
    muscles.some((m) =>
      /(perna|leg|quad|gl[uú]teo|inferior|coxa|posterior|full_body)/i.test(m)
    ) ||
    isCrossFit ||
    type === 'cycling';

  const hasUpper =
    muscles.some((m) =>
      /(peito|costas|ombro|bra[çc]o|upper|superior|pull|push|full_body)/i.test(m)
    ) ||
    isCrossFit ||
    type === 'swimming';

  return {
    isCrossFit,
    hasLegs,
    hasUpper,
    isHighIntensity: rpe >= 7,
  };
}

/**
 * Classical default offsets for simple single-sport week distribution.
 */
export function getSplitDayOffsets(daysCount: number): number[] {
  switch (daysCount) {
    case 1:
      return [2]; // Wednesday
    case 2:
      return [1, 3]; // Tuesday, Thursday
    case 3:
      return [0, 2, 4]; // Monday, Wednesday, Friday
    case 4:
      return [0, 1, 3, 4]; // Monday, Tuesday, Thursday, Friday (Upper/Lower)
    case 5:
      return [0, 1, 2, 4, 5]; // Mon, Tue, Wed, Fri, Sat
    case 6:
      return [0, 1, 2, 3, 4, 5]; // Mon to Sat
    case 7:
    default:
      return Array.from({ length: Math.min(daysCount, 7) }, (_, i) => i);
  }
}
export const getDayOffsetsForSplit = getSplitDayOffsets;

export interface StrengthWorkoutToSchedule {
  id: string; // CalendarEvent ID or Template ID
  title: string;
  isLower: boolean;
  sortOrder?: number;
}

/**
 * Calculates the physiological penalty score for scheduling a specific strength workout on a specific day index (0..6),
 * taking into account available days, running interference, and cross-training fatigue.
 */
export function calculateWorkoutDayPenalty(
  dayIndex: number,
  workout: StrengthWorkoutToSchedule,
  availableDays: number[],
  fixedWeekEvents: CalendarEventScheduleContext[]
): number {
  let penalty = 0;

  // 1. Availability penalty
  if (!availableDays.includes(dayIndex)) {
    penalty += 50000;
  }

  // 2. Collision with completed strength workout
  const completedStrength = fixedWeekEvents.some(
    (e) => e.dayIndex === dayIndex && e.eventType === 'strength' && e.status === 'completed'
  );
  if (completedStrength) {
    penalty += 25000;
  }

  // 3. Multi-Sport Interference with Running
  for (const event of fixedWeekEvents) {
    if (event.eventType === 'running') {
      const fatigue = getRunningFatigue(event);
      const diff = dayIndex - event.dayIndex; // e.g. dayIndex=2 (Wed), event=1 (Tue) => diff = 1

      if (workout.isLower) {
        if (diff === 0) {
          // Same day as run
          if (fatigue.isLongRun) penalty += 12000;
          else if (fatigue.isSpeedWork) penalty += 9000;
          else penalty += 1500;
        } else if (diff === -1) {
          // Day BEFORE run (Pre-fatigue danger!)
          if (fatigue.isLongRun) penalty += 6000; // Heavy legs on Long Run = high injury risk
          else if (fatigue.isSpeedWork) penalty += 4000;
          else penalty += 500;
        } else if (diff === 1) {
          // Day AFTER run (Eccentric damage & DOMS)
          if (fatigue.isLongRun) penalty += 4500;
          else if (fatigue.isSpeedWork) penalty += 3000;
          else penalty += 300;
        }
      } else {
        // Upper body workout
        if (diff === 0) {
          if (fatigue.isLongRun) penalty += 600;
          else if (fatigue.isSpeedWork) penalty += 400;
        }
      }
    }

    // 4. Multi-Sport Interference with Cross-Training (CrossFit, Swimming, Cycling)
    if (['crossfit', 'swimming', 'cycling', 'martial_arts', 'other'].includes(event.eventType)) {
      const ctFatigue = getCrossTrainingFatigue(event);
      const diff = dayIndex - event.dayIndex;

      if (ctFatigue.isCrossFit) {
        if (workout.isLower) {
          if (diff === 0) penalty += 9500; // Same day as CrossFit + Leg day
          else if (diff === -1) penalty += 3500;
          else if (diff === 1) penalty += 4500; // High rep thrusters/squats DOMS
        } else {
          if (diff === 0) penalty += 2000;
          else if (diff === 1 || diff === -1) penalty += 500;
        }
      } else if (event.eventType === 'cycling' && workout.isLower) {
        if (diff === 0) penalty += 3500;
        else if (diff === 1) penalty += 1500;
      } else if (event.eventType === 'swimming' && !workout.isLower) {
        if (diff === 0) penalty += 2000; // Shoulder fatigue
      }
    }
  }

  return penalty;
}

/**
 * Calculates global interaction penalties across all assigned strength days
 * (e.g. minimum 48h spacing between two Leg Days, even distribution, consecutive days).
 */
export function calculateScheduleInteractionPenalty(
  assignment: Array<{ dayIndex: number; workout: StrengthWorkoutToSchedule }>
): number {
  let penalty = 0;

  // Collision penalty: multiple strength workouts on the exact same day
  const dayCounts = new Map<number, number>();
  for (const item of assignment) {
    dayCounts.set(item.dayIndex, (dayCounts.get(item.dayIndex) || 0) + 1);
  }
  for (const count of dayCounts.values()) {
    if (count > 1) {
      penalty += (count - 1) * 30000;
    }
  }

  // Inter-workout distance
  for (let i = 0; i < assignment.length; i++) {
    for (let j = i + 1; j < assignment.length; j++) {
      const w1 = assignment[i];
      const w2 = assignment[j];
      const dist = Math.abs(w1.dayIndex - w2.dayIndex);

      // Two Lower Body workouts in the same week
      if (w1.workout.isLower && w2.workout.isLower) {
        if (dist === 0) penalty += 10000;
        else if (dist === 1) penalty += 5000; // Consecutive leg days
        else if (dist === 2) penalty += 1000; // 48h separation preferred (dist >= 3)
      }

      // Consecutive strength sessions
      if (dist === 1) {
        if (w1.workout.isLower === w2.workout.isLower) {
          penalty += 3500; // Back-to-back same muscle group
        } else {
          penalty += 250; // Minor fatigue penalty for consecutive training
        }
      }
    }
  }

  // Distribution balance (avoid clustering all workouts into 2 days leaving 5 days empty)
  const sortedDays = assignment.map((a) => a.dayIndex).sort((a, b) => a - b);
  for (let i = 0; i < sortedDays.length - 1; i++) {
    const gap = sortedDays[i + 1] - sortedDays[i];
    if (gap > 4) {
      penalty += (gap - 4) * 200;
    }
  }

  return penalty;
}

export interface SolvedScheduleDay {
  workoutId: string;
  title: string;
  dayIndex: number;
  dateStr: string;
  isLower: boolean;
  score: number;
}

/**
 * Deterministically evaluates all valid permutations and finds the optimal weekly day distribution
 * with mathematical guarantee of minimal fatigue interference.
 */
export function solveOptimalWeeklyStrengthDistribution(params: {
  weekMonday: Date;
  availableDays: number[];
  workouts: StrengthWorkoutToSchedule[];
  fixedEvents: CalendarEventScheduleContext[];
}): { assignment: SolvedScheduleDay[]; totalPenalty: number } {
  const { weekMonday, availableDays, workouts, fixedEvents } = params;

  if (workouts.length === 0) {
    return { assignment: [], totalPenalty: 0 };
  }

  // Fallback to all days if availableDays is empty or fewer than workouts
  const validCandidateDays =
    availableDays.length >= workouts.length
      ? availableDays
      : Array.from(new Set([...availableDays, 0, 1, 2, 3, 4, 5, 6])).slice(0, 7);

  // Generate all combinations of length K from candidate days
  function getCombinations<T>(array: T[], size: number): T[][] {
    function backtrack(start: number, current: T[]): T[][] {
      if (current.length === size) return [current];
      const res: T[][] = [];
      for (let i = start; i < array.length; i++) {
        res.push(...backtrack(i + 1, [...current, array[i]]));
      }
      return res;
    }
    return backtrack(0, []);
  }

  // Generate all permutations of an array
  function getPermutations<T>(array: T[]): T[][] {
    if (array.length <= 1) return [array];
    const res: T[][] = [];
    for (let i = 0; i < array.length; i++) {
      const current = array[i];
      const remaining = array.slice(0, i).concat(array.slice(i + 1));
      const remainingPerms = getPermutations(remaining);
      for (const p of remainingPerms) {
        res.push([current, ...p]);
      }
    }
    return res;
  }

  const k = workouts.length;
  const dayCombinations = getCombinations(validCandidateDays, k);

  let bestCost = Infinity;
  let bestAssignment: Array<{ dayIndex: number; workout: StrengthWorkoutToSchedule }> = [];

  for (const dayCombo of dayCombinations) {
    // Generate permutations of matching workouts to chosen days
    const dayPermutations = getPermutations(dayCombo);

    for (const perm of dayPermutations) {
      const candidate = workouts.map((w, idx) => ({
        dayIndex: perm[idx],
        workout: w,
      }));

      // Calculate total cost
      let cost = calculateScheduleInteractionPenalty(candidate);
      for (const item of candidate) {
        cost += calculateWorkoutDayPenalty(
          item.dayIndex,
          item.workout,
          availableDays,
          fixedEvents
        );
      }

      if (cost < bestCost) {
        bestCost = cost;
        bestAssignment = candidate;
      }
    }
  }

  // Convert bestAssignment to SolvedScheduleDay
  const result: SolvedScheduleDay[] = bestAssignment.map((item) => {
    const d = new Date(weekMonday);
    d.setDate(weekMonday.getDate() + item.dayIndex);
    const dateStr = formatISODate(d);
    return {
      workoutId: item.workout.id,
      title: item.workout.title,
      dayIndex: item.dayIndex,
      dateStr,
      isLower: item.workout.isLower,
      score: bestCost,
    };
  });

  return { assignment: result, totalPenalty: bestCost };
}

interface RawCalendarEventRef {
  id: string;
  date: string;
  eventType: string;
  status: string;
  title: string;
  referenceId: string | null;
  referenceModel: string | null;
}

/**
 * Shared batch enrichment helper for calendar events: eliminates N+1 queries and enriches
 * RunningSession.sessionType + CrossTrainingActivity metadata uniformly across all schedulers.
 */
async function enrichFixedEventsBatch(
  events: RawCalendarEventRef[]
): Promise<CalendarEventScheduleContext[]> {
  const runExecIds = events
    .filter((ev) => ev.eventType === 'running' && ev.referenceId && ev.referenceModel === 'RunningExecution')
    .map((ev) => ev.referenceId!);
  const runSessionIds = events
    .filter((ev) => ev.eventType === 'running' && ev.referenceId && ev.referenceModel !== 'RunningExecution')
    .map((ev) => ev.referenceId!);
  const ctIds = events
    .filter(
      (ev) =>
        ['crossfit', 'swimming', 'cycling', 'martial_arts', 'other'].includes(ev.eventType) &&
        ev.referenceId
    )
    .map((ev) => ev.referenceId!);

  const [runExecs, runSessions, ctActivities] = await Promise.all([
    runExecIds.length > 0
      ? prisma.runningExecution.findMany({
          where: { id: { in: runExecIds } },
          select: { id: true, runningSession: { select: { sessionType: true } } },
        })
      : Promise.resolve([]),
    runSessionIds.length > 0
      ? prisma.runningSession.findMany({
          where: { id: { in: runSessionIds } },
          select: { id: true, sessionType: true },
        })
      : Promise.resolve([]),
    ctIds.length > 0
      ? prisma.crossTrainingActivity.findMany({
          where: { id: { in: ctIds } },
          select: { id: true, muscleGroups: true, sessionRpe: true },
        })
      : Promise.resolve([]),
  ]);

  const runExecMap = new Map(runExecs.map((r) => [r.id, r.runningSession?.sessionType]));
  const runSessionMap = new Map(runSessions.map((s) => [s.id, s.sessionType]));
  const ctMap = new Map(ctActivities.map((c) => [c.id, c]));

  return events.map((ev) => {
    let runningSessionType: string | undefined;
    let muscleGroups: string[] | undefined;
    let sessionRpe: number | null | undefined;

    if (ev.eventType === 'running' && ev.referenceId) {
      runningSessionType =
        ev.referenceModel === 'RunningExecution'
          ? runExecMap.get(ev.referenceId)
          : runSessionMap.get(ev.referenceId);
    }

    if (
      ['crossfit', 'swimming', 'cycling', 'martial_arts', 'other'].includes(ev.eventType) &&
      ev.referenceId
    ) {
      const ct = ctMap.get(ev.referenceId);
      if (ct?.muscleGroups && Array.isArray(ct.muscleGroups)) {
        muscleGroups = ct.muscleGroups as string[];
      }
      sessionRpe = ct?.sessionRpe;
    }

    return {
      id: ev.id,
      date: ev.date,
      dayIndex: dayOfWeekMon0(ev.date),
      eventType: ev.eventType,
      status: ev.status,
      title: ev.title,
      referenceModel: ev.referenceModel,
      runningSessionType,
      muscleGroups,
      sessionRpe,
    };
  });
}

/**
 * Rebalances a given calendar week dynamically.
 * Reads fixed events (completed strength, running, CrossFit), gathers planned strength workouts,
 * solves the optimal assignment avoiding leg interference with long runs and CrossFit,
 * and updates CalendarEvent records in the database.
 */
export async function rebalanceWeekSchedule(
  athleteProfileId: string = 'singleton',
  anchorDate?: Date | string
): Promise<{
  success: boolean;
  weekStart: string;
  rebalancedCount: number;
  events: Array<{ id: string; title: string; oldDate: string; newDate: string }>;
}> {
  const anchorISO = resolveISODate(anchorDate);
  const { startOfWeek: startStr, endOfWeek: endStr } = weekRangeOfISODate(anchorISO);
  const [startYear, startMonth, startDay] = startStr.split('-').map(Number);
  const weekMonday = new Date(startYear, startMonth - 1, startDay);

  // 1. Fetch athlete profile preferences, active mesocycle prescriptions, and week events in parallel
  const [athlete, activePlan, weekEvents] = await Promise.all([
    prisma.athleteProfile.findUnique({
      where: { id: athleteProfileId },
    }),
    prisma.mesocyclePlan.findFirst({
      where: { athleteProfileId, status: 'active' },
      include: {
        workoutDays: {
          include: {
            prescriptions: {
              select: { movementPattern: true, exerciseName: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.calendarEvent.findMany({
      where: {
        athleteProfileId,
        date: { gte: startStr, lte: endStr },
      },
      orderBy: { date: 'asc' },
    }),
  ]);

  const availableDays = parseAvailableDayIndices(athlete?.availableDays);
  const weeklyWorkoutsTarget = athlete?.weeklyWorkoutsTarget ?? null;
  const templateById = new Map((activePlan?.workoutDays ?? []).map((t) => [t.id, t]));
  const templateByLabel = new Map(
    (activePlan?.workoutDays ?? []).map((t) => [t.label.trim().toLowerCase(), t])
  );

  const today = todayISO();

  // Separate fixed events from planned strength events
  const plannedStrengthEvents: typeof weekEvents = [];
  const nonPlannedRaw: typeof weekEvents = [];

  for (const ev of weekEvents) {
    // STRICT FORWARD-ONLY RULE:
    // Only future planned events (date >= today) are candidates to be rescheduled.
    if (ev.eventType === 'strength' && ev.status === 'planned' && ev.date >= today) {
      plannedStrengthEvents.push(ev);
    } else {
      nonPlannedRaw.push(ev);
    }
  }

  const fixedScheduleEvents = await enrichFixedEventsBatch(nonPlannedRaw);

  // Filter available days: only days >= today can receive workouts
  const forwardAvailableDays = availableDays.filter((dIdx) => {
    const dayDate = shiftISODate(startStr, dIdx);
    return dayDate >= today;
  });

  if (plannedStrengthEvents.length === 0 || forwardAvailableDays.length === 0) {
    return {
      success: true,
      weekStart: startStr,
      rebalancedCount: 0,
      events: [],
    };
  }

  const completedStrengthInWeek = fixedScheduleEvents.filter(
    (e) => e.eventType === 'strength' && e.status === 'completed'
  ).length;
  const remainingTargetForWeek = weeklyWorkoutsTarget
    ? Math.max(0, weeklyWorkoutsTarget - completedStrengthInWeek)
    : plannedStrengthEvents.length;

  const targetCount = Math.min(remainingTargetForWeek, plannedStrengthEvents.length);
  const excessEvents = plannedStrengthEvents.slice(targetCount);

  const workoutsToSchedule: StrengthWorkoutToSchedule[] = plannedStrengthEvents
    .slice(0, targetCount)
    .map((ev) => {
      const tpl =
        (ev.referenceModel === 'WorkoutDayTemplate' && ev.referenceId
          ? templateById.get(ev.referenceId)
          : undefined) || templateByLabel.get(ev.title.trim().toLowerCase());
      return {
        id: ev.id,
        title: ev.title,
        isLower: isLowerBodyWorkout({
          title: ev.title,
          label: tpl?.label ?? ev.title,
          prescriptions: tpl?.prescriptions,
        }),
        sortOrder: ev.sortOrder,
      };
    });

  const { assignment } = solveOptimalWeeklyStrengthDistribution({
    weekMonday,
    availableDays: forwardAvailableDays,
    workouts: workoutsToSchedule,
    fixedEvents: fixedScheduleEvents,
  });

  const changes: Array<{ id: string; title: string; oldDate: string; newDate: string }> = [];

  await prisma.$transaction(async (tx) => {
    if (excessEvents.length > 0) {
      await tx.calendarEvent.deleteMany({
        where: { id: { in: excessEvents.map((e) => e.id) } },
      });
    }

    for (const sol of assignment) {
      if (sol.dateStr < today) continue;
      const originalEvent = plannedStrengthEvents.find((e) => e.id === sol.workoutId);
      if (originalEvent && originalEvent.date !== sol.dateStr) {
        await tx.calendarEvent.update({
          where: { id: sol.workoutId },
          data: {
            date: sol.dateStr,
            originalDate: originalEvent.originalDate || originalEvent.date,
          },
        });
        changes.push({
          id: sol.workoutId,
          title: sol.title,
          oldDate: originalEvent.date,
          newDate: sol.dateStr,
        });
      }
    }
  });

  console.log(
    `[Scheduler] Rebalanceamento da semana ${startStr} concluído: ${changes.length} treinos reorganizados.`
  );

  return {
    success: true,
    weekStart: startStr,
    rebalancedCount: changes.length,
    events: changes,
  };
}

/**
 * Deterministically schedules workout days across the active mesocycle into CalendarEvent records.
 * Uses smart multi-sport solver taking into account availableDays and running/cross-training interference.
 *
 * @param athleteProfileId - ID of the athlete profile (e.g. 'singleton')
 * @param startDate - Optional start date. Defaults to mesocycle startDate or current week Monday.
 */
export async function scheduleMesocycleWorkouts(
  athleteProfileId: string,
  startDate?: Date
): Promise<void> {
  const activePlan = await prisma.mesocyclePlan.findFirst({
    where: {
      athleteProfileId,
      status: 'active',
    },
    include: {
      workoutDays: {
        orderBy: { dayOrder: 'asc' },
        include: { prescriptions: true },
      },
      weeks: {
        orderBy: { weekNumber: 'asc' },
      },
    },
  });

  if (!activePlan || activePlan.workoutDays.length === 0) {
    return;
  }

  let athlete = await prisma.athleteProfile.findUnique({
    where: { id: athleteProfileId },
  });
  if (!athlete) {
    athlete = await prisma.athleteProfile.create({
      data: { id: athleteProfileId },
    });
  }

  const availableDays = parseAvailableDayIndices(athlete.availableDays);
  const targetWorkoutsPerWeek = athlete.weeklyWorkoutsTarget ?? activePlan.workoutDays.length;

  const baseISO = startDate
    ? resolveISODate(startDate)
    : activePlan.startDate && isISODate(activePlan.startDate)
      ? activePlan.startDate
      : todayISO();

  const baseMondayISO = mondayOfISODate(baseISO);
  const dayTemplates = activePlan.workoutDays;
  const numWeeks = activePlan.durationWeeks || (activePlan.weeks.length > 0 ? activePlan.weeks.length : 4);
  const today = todayISO();

  const horizonEndISO = shiftISODate(baseMondayISO, numWeeks * 7);
  const allHorizonEvents = await prisma.calendarEvent.findMany({
    where: {
      athleteProfileId,
      date: { gte: baseMondayISO, lte: horizonEndISO },
    },
  });

  // Batch-enrich running sessionType and cross-training muscleGroups/RPE across the full horizon
  const enrichedHorizon = await enrichFixedEventsBatch(allHorizonEvents);

  const createsToPersist: Array<{
    athleteProfileId: string;
    date: string;
    eventType: string;
    referenceModel: string;
    referenceId: string;
    title: string;
    status: 'planned';
    sortOrder: number;
  }> = [];

  for (let weekIndex = 0; weekIndex < numWeeks; weekIndex++) {
    const weekStartStr = shiftISODate(baseMondayISO, weekIndex * 7);
    const weekEndStr = shiftISODate(weekStartStr, 6);
    const [wsYear, wsMonth, wsDay] = weekStartStr.split('-').map(Number);
    const weekStart = new Date(wsYear, wsMonth - 1, wsDay);

    const fixedEvents = enrichedHorizon.filter(
      (ev) => ev.date >= weekStartStr && ev.date <= weekEndStr
    );
    const existingRawWeekEvents = allHorizonEvents.filter(
      (ev) => ev.date >= weekStartStr && ev.date <= weekEndStr
    );

    const countToSchedule = Math.min(targetWorkoutsPerWeek, dayTemplates.length);
    const templatesForWeek = Array.from({ length: countToSchedule }, (_, i) => {
      const templateIdx = (weekIndex * countToSchedule + i) % dayTemplates.length;
      return dayTemplates[templateIdx];
    });

    const workoutsToSchedule: StrengthWorkoutToSchedule[] = templatesForWeek.map((t) => ({
      id: t.id,
      title: t.label,
      isLower: isLowerBodyWorkout({
        title: t.label,
        label: t.label,
        prescriptions: t.prescriptions,
      }),
      sortOrder: t.dayOrder,
    }));

    const { assignment } = solveOptimalWeeklyStrengthDistribution({
      weekMonday: weekStart,
      availableDays,
      workouts: workoutsToSchedule,
      fixedEvents,
    });

    for (let tIdx = 0; tIdx < assignment.length; tIdx++) {
      const sol = assignment[tIdx];
      if (sol.dateStr < today) {
        continue;
      }

      const template = templatesForWeek.find((t) => t.id === sol.workoutId) || templatesForWeek[tIdx];

      const alreadyExists = existingRawWeekEvents.some(
        (ev) =>
          ev.date === sol.dateStr &&
          ev.eventType === 'strength' &&
          (ev.referenceId === template.id ||
            ev.title === template.label ||
            ev.referenceModel === 'WorkoutExecution')
      );

      if (!alreadyExists) {
        createsToPersist.push({
          athleteProfileId,
          date: sol.dateStr,
          eventType: 'strength',
          referenceModel: 'WorkoutDayTemplate',
          referenceId: template.id,
          title: template.label,
          status: 'planned',
          sortOrder: tIdx,
        });
      }
    }
  }

  if (createsToPersist.length > 0) {
    await prisma.$transaction(async (tx) => {
      await tx.calendarEvent.createMany({ data: createsToPersist });
    });
  }

  // Ensure no duplicates exist after scheduling
  await cleanupDuplicateStrengthEvents(athleteProfileId);
}

/**
 * Removes duplicate planned strength events on the same date with the same title,
 * keeping only the earliest created event for each date/title combination.
 */
export async function cleanupDuplicateStrengthEvents(athleteProfileId: string): Promise<number> {
  const plannedEvents = await prisma.calendarEvent.findMany({
    where: {
      athleteProfileId,
      eventType: 'strength',
      status: 'planned',
    },
    orderBy: { createdAt: 'asc' },
  });

  const seen = new Set<string>();
  const duplicateIds: string[] = [];

  for (const ev of plannedEvents) {
    const key = `${ev.date}::${ev.title.trim().toLowerCase()}`;
    if (seen.has(key)) {
      duplicateIds.push(ev.id);
    } else {
      seen.add(key);
    }
  }

  if (duplicateIds.length > 0) {
    await prisma.calendarEvent.deleteMany({
      where: { id: { in: duplicateIds } },
    });
    console.log(`[Scheduler] Removidos ${duplicateIds.length} eventos de força duplicados.`);
  }

  return duplicateIds.length;
}

/**
 * Ensures planned strength workout events exist in CalendarEvent for the current active mesocycle.
 * Cleans up any duplicate events, and if none exist for the athlete, triggers scheduleMesocycleWorkouts.
 *
 * @param athleteProfileId - ID of the athlete profile (e.g. 'singleton')
 */
export async function syncPlannedCalendarEvents(athleteProfileId: string): Promise<void> {
  await cleanupDuplicateStrengthEvents(athleteProfileId);

  const activePlan = await prisma.mesocyclePlan.findFirst({
    where: {
      athleteProfileId,
      status: 'active',
    },
    include: {
      workoutDays: true,
      weeks: true,
    },
  });

  if (!activePlan || activePlan.workoutDays.length === 0) {
    return;
  }

  const existingEventsCount = await prisma.calendarEvent.count({
    where: {
      athleteProfileId,
      eventType: 'strength',
      referenceModel: { in: ['WorkoutDayTemplate', 'WorkoutExecution'] },
    },
  });

  if (existingEventsCount === 0) {
    await scheduleMesocycleWorkouts(athleteProfileId);
  }
}

/**
 * Applies a manual workout template selection for a specific date in the strength hub,
 * updates the CalendarEvent for that date, and deterministically reorganizes the remaining
 * planned workouts of the week following the AI split sequence and respecting running/cross-training recovery.
 */
export async function applyWorkoutTemplateSelectionAndRebalance(params: {
  athleteProfileId?: string;
  date: string; // YYYY-MM-DD
  templateId: string;
}): Promise<{
  success: boolean;
  selectedTemplate: { id: string; label: string; dayOrder: number };
  rebalancedCount: number;
  message: string;
}> {
  const athleteProfileId = params.athleteProfileId || 'singleton';
  const today = todayISO();

  if (params.date < today) {
    throw new Error('Não é permitido reagendar ou selecionar templates para datas passadas.');
  }

  const activePlan = await prisma.mesocyclePlan.findFirst({
    where: {
      athleteProfileId,
      status: 'active',
    },
    include: {
      workoutDays: {
        orderBy: { dayOrder: 'asc' },
        include: { prescriptions: true },
      },
    },
  });

  if (!activePlan || activePlan.workoutDays.length === 0) {
    throw new Error('Nenhum mesociclo ativo com templates encontrado.');
  }

  const chosenTemplate = activePlan.workoutDays.find((t) => t.id === params.templateId);
  if (!chosenTemplate) {
    throw new Error(`Template com ID "${params.templateId}" não encontrado no mesociclo ativo.`);
  }

  const targetDayIndex = dayOfWeekMon0(params.date);
  const { startOfWeek: startStr, endOfWeek: endStr } = weekRangeOfISODate(params.date);
  const [wmYear, wmMonth, wmDay] = startStr.split('-').map(Number);
  const weekMonday = new Date(wmYear, wmMonth - 1, wmDay);

  const [athlete, existingOnDate, allWeekEvents] = await Promise.all([
    prisma.athleteProfile.findUnique({ where: { id: athleteProfileId } }),
    prisma.calendarEvent.findFirst({
      where: {
        athleteProfileId,
        date: params.date,
        eventType: 'strength',
      },
    }),
    prisma.calendarEvent.findMany({
      where: {
        athleteProfileId,
        date: { gte: startStr, lte: endStr },
      },
      orderBy: { date: 'asc' },
    }),
  ]);

  const availableDays = parseAvailableDayIndices(athlete?.availableDays);
  const weeklyWorkoutsTarget = athlete?.weeklyWorkoutsTarget ?? activePlan.workoutDays.length;

  const selectedEventIdPre = existingOnDate?.id ?? 'pending-selected-event';
  const weekEvents = allWeekEvents.filter((ev) => ev.id !== existingOnDate?.id);

  const existingPlannedStrengthEvents: typeof weekEvents = [];
  const nonPlannedRaw: typeof weekEvents = [];

  for (const ev of weekEvents) {
    if (ev.eventType === 'strength' && ev.status === 'planned' && ev.date >= today) {
      existingPlannedStrengthEvents.push(ev);
    } else {
      nonPlannedRaw.push(ev);
    }
  }

  const fixedScheduleEvents = await enrichFixedEventsBatch(nonPlannedRaw);
  fixedScheduleEvents.push({
    id: selectedEventIdPre,
    date: params.date,
    dayIndex: targetDayIndex,
    eventType: 'strength',
    status: 'planned',
    title: chosenTemplate.label,
    referenceModel: 'WorkoutDayTemplate',
  });

  const pastOrCompletedStrengthCount = nonPlannedRaw.filter(
    (ev) => ev.eventType === 'strength' && (ev.status === 'completed' || ev.date < today)
  ).length;
  const totalCountForWeek = Math.min(weeklyWorkoutsTarget, activePlan.workoutDays.length);
  const remainingCount = Math.max(0, totalCountForWeek - 1 - pastOrCompletedStrengthCount);

  const forwardAvailableDays = availableDays.filter(
    (d) => d !== targetDayIndex && shiftISODate(startStr, d) >= today
  );
  const allForwardDays = [0, 1, 2, 3, 4, 5, 6].filter(
    (d) => d !== targetDayIndex && shiftISODate(startStr, d) >= today
  );

  let rebalancedCount = 0;

  await prisma.$transaction(async (tx) => {
    if (existingOnDate) {
      await tx.calendarEvent.update({
        where: { id: existingOnDate.id },
        data: {
          referenceId: chosenTemplate.id,
          referenceModel: 'WorkoutDayTemplate',
          title: chosenTemplate.label,
          status: existingOnDate.status === 'completed' ? 'completed' : 'planned',
        },
      });
    } else {
      await tx.calendarEvent.create({
        data: {
          athleteProfileId,
          date: params.date,
          eventType: 'strength',
          referenceId: chosenTemplate.id,
          referenceModel: 'WorkoutDayTemplate',
          title: chosenTemplate.label,
          status: 'planned',
          sortOrder: 0,
        },
      });
    }

    if (remainingCount > 0 && allForwardDays.length > 0) {
      const allTemplates = activePlan.workoutDays;
      const numTemplates = allTemplates.length;
      const chosenIndex = allTemplates.findIndex((t) => t.id === chosenTemplate.id);

      const cappedRemaining = Math.min(remainingCount, allForwardDays.length);
      const remainingTemplates: typeof allTemplates = [];
      for (let step = 1; step <= cappedRemaining; step++) {
        const nextIdx = (chosenIndex + step) % numTemplates;
        remainingTemplates.push(allTemplates[nextIdx]);
      }

      const validCandidateDays =
        forwardAvailableDays.length >= remainingTemplates.length
          ? forwardAvailableDays
          : allForwardDays;

      const workoutsToSchedule: StrengthWorkoutToSchedule[] = remainingTemplates.map((t) => ({
        id: t.id,
        title: t.label,
        isLower: isLowerBodyWorkout({
          title: t.label,
          label: t.label,
          prescriptions: t.prescriptions,
        }),
        sortOrder: t.dayOrder,
      }));

      const { assignment } = solveOptimalWeeklyStrengthDistribution({
        weekMonday,
        availableDays: validCandidateDays,
        workouts: workoutsToSchedule,
        fixedEvents: fixedScheduleEvents,
      });

      const usedEventIds = new Set<string>([selectedEventIdPre]);

      for (let i = 0; i < assignment.length; i++) {
        const sol = assignment[i];
        const template =
          remainingTemplates.find((t) => t.id === sol.workoutId) || remainingTemplates[i];

        const match =
          existingPlannedStrengthEvents.find(
            (e) =>
              !usedEventIds.has(e.id) &&
              (e.referenceId === template.id || e.title === template.label)
          ) || existingPlannedStrengthEvents.find((e) => !usedEventIds.has(e.id));

        if (match) {
          usedEventIds.add(match.id);
          await tx.calendarEvent.update({
            where: { id: match.id },
            data: {
              date: sol.dateStr,
              referenceId: template.id,
              referenceModel: 'WorkoutDayTemplate',
              title: template.label,
              status: 'planned',
              originalDate: match.originalDate || match.date,
              sortOrder: i + 1,
            },
          });
          rebalancedCount++;
        } else {
          const created = await tx.calendarEvent.create({
            data: {
              athleteProfileId,
              date: sol.dateStr,
              eventType: 'strength',
              referenceId: template.id,
              referenceModel: 'WorkoutDayTemplate',
              title: template.label,
              status: 'planned',
              sortOrder: i + 1,
            },
          });
          usedEventIds.add(created.id);
          rebalancedCount++;
        }
      }

      const orphanedEvents = existingPlannedStrengthEvents.filter((e) => !usedEventIds.has(e.id));
      if (orphanedEvents.length > 0) {
        await tx.calendarEvent.deleteMany({
          where: { id: { in: orphanedEvents.map((e) => e.id) } },
        });
      }
    }
  });

  await cleanupDuplicateStrengthEvents(athleteProfileId);

  return {
    success: true,
    selectedTemplate: {
      id: chosenTemplate.id,
      label: chosenTemplate.label,
      dayOrder: chosenTemplate.dayOrder,
    },
    rebalancedCount,
    message: `Treino "${chosenTemplate.label}" agendado para ${params.date}, e ${rebalancedCount} treino(s) da semana reorganizados com sucesso.`,
  };
}
