import type { PrismaClient } from '@prisma/client';

// Lazy loader for PrismaClient to allow importing pure scheduler helpers in unit tests without Next.js path alias issues
let prismaInstance: PrismaClient | null = null;
async function getPrisma(): Promise<PrismaClient> {
  if (!prismaInstance) {
    const mod = await import('@/lib/prisma');
    prismaInstance = mod.prisma;
  }
  return prismaInstance;
}

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
      'calf_raise',
      'hip_thrust',
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
  const prisma = await getPrisma();

  const targetDate = anchorDate ? new Date(anchorDate) : new Date();
  const weekMonday = getMondayOfDate(targetDate);
  const weekSunday = new Date(weekMonday);
  weekSunday.setDate(weekMonday.getDate() + 6);

  const startStr = formatISODate(weekMonday);
  const endStr = formatISODate(weekSunday);

  // 1. Fetch athlete profile preferences
  const athlete = await prisma.athleteProfile.findUnique({
    where: { id: athleteProfileId },
  });
  const availableDays = parseAvailableDayIndices(athlete?.availableDays);
  const weeklyWorkoutsTarget = athlete?.weeklyWorkoutsTarget ?? null;

  // 2. Fetch all events for this week
  const weekEvents = await prisma.calendarEvent.findMany({
    where: {
      athleteProfileId,
      date: { gte: startStr, lte: endStr },
    },
    orderBy: { date: 'asc' },
  });

  // Separate fixed events from planned strength events
  const fixedScheduleEvents: CalendarEventScheduleContext[] = [];
  const plannedStrengthEvents: typeof weekEvents = [];

  for (const ev of weekEvents) {
    const evDate = new Date(`${ev.date}T00:00:00`);
    const day = evDate.getDay();
    const dayIndex = day === 0 ? 6 : day - 1; // 0=Mon, 6=Sun

    if (ev.eventType === 'strength' && ev.status === 'planned') {
      plannedStrengthEvents.push(ev);
    } else {
      // Completed strength, running, cross-training
      let runningSessionType: string | undefined;
      let muscleGroups: string[] | undefined;
      let sessionRpe: number | null | undefined;

      if (ev.eventType === 'running' && ev.referenceId) {
        const runSession = await prisma.runningSession.findUnique({
          where: { id: ev.referenceId },
          select: { sessionType: true },
        });
        runningSessionType = runSession?.sessionType;
      }

      if (['crossfit', 'swimming', 'cycling', 'martial_arts', 'other'].includes(ev.eventType) && ev.referenceId) {
        const ct = await prisma.crossTrainingActivity.findUnique({
          where: { id: ev.referenceId },
          select: { muscleGroups: true, sessionRpe: true },
        });
        if (ct?.muscleGroups && Array.isArray(ct.muscleGroups)) {
          muscleGroups = ct.muscleGroups as string[];
        }
        sessionRpe = ct?.sessionRpe;
      }

      fixedScheduleEvents.push({
        id: ev.id,
        date: ev.date,
        dayIndex,
        eventType: ev.eventType,
        status: ev.status,
        title: ev.title,
        referenceModel: ev.referenceModel,
        runningSessionType,
        muscleGroups,
        sessionRpe,
      });
    }
  }

  if (plannedStrengthEvents.length === 0) {
    return {
      success: true,
      weekStart: startStr,
      rebalancedCount: 0,
      events: [],
    };
  }

  // Filter planned workouts if athlete has a target lower than planned events count
  const targetCount = weeklyWorkoutsTarget
    ? Math.min(weeklyWorkoutsTarget, plannedStrengthEvents.length)
    : plannedStrengthEvents.length;

  const workoutsToSchedule: StrengthWorkoutToSchedule[] = plannedStrengthEvents
    .slice(0, targetCount)
    .map((ev) => ({
      id: ev.id,
      title: ev.title,
      isLower: isLowerBodyWorkout({ title: ev.title, label: ev.title }),
      sortOrder: ev.sortOrder,
    }));

  const { assignment } = solveOptimalWeeklyStrengthDistribution({
    weekMonday,
    availableDays,
    workouts: workoutsToSchedule,
    fixedEvents: fixedScheduleEvents,
  });

  const changes: Array<{ id: string; title: string; oldDate: string; newDate: string }> = [];

  for (const sol of assignment) {
    const originalEvent = plannedStrengthEvents.find((e) => e.id === sol.workoutId);
    if (originalEvent) {
      if (originalEvent.date !== sol.dateStr) {
        await prisma.calendarEvent.update({
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
  }

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
  const prisma = await getPrisma();
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

  // Ensure athlete profile exists and load preferences
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

  // Determine base Monday for scheduling
  let baseDate = startDate;
  if (!baseDate && activePlan.startDate) {
    const parts = activePlan.startDate.split('-').map(Number);
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      baseDate = new Date(parts[0], parts[1] - 1, parts[2]);
    }
  }
  if (!baseDate) {
    baseDate = new Date();
  }

  const baseMonday = getMondayOfDate(baseDate);
  const dayTemplates = activePlan.workoutDays;
  const numWeeks = activePlan.durationWeeks || (activePlan.weeks.length > 0 ? activePlan.weeks.length : 4);

  for (let weekIndex = 0; weekIndex < numWeeks; weekIndex++) {
    const weekStart = new Date(baseMonday);
    weekStart.setDate(baseMonday.getDate() + weekIndex * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const weekStartStr = formatISODate(weekStart);
    const weekEndStr = formatISODate(weekEnd);

    // Fetch existing calendar events for this week (e.g. running sessions, cross-training, completed strength)
    const existingWeekEvents = await prisma.calendarEvent.findMany({
      where: {
        athleteProfileId,
        date: { gte: weekStartStr, lte: weekEndStr },
      },
    });

    const fixedEvents: CalendarEventScheduleContext[] = existingWeekEvents.map((ev) => {
      const d = new Date(`${ev.date}T00:00:00`);
      const day = d.getDay();
      return {
        id: ev.id,
        date: ev.date,
        dayIndex: day === 0 ? 6 : day - 1,
        eventType: ev.eventType,
        status: ev.status,
        title: ev.title,
        referenceModel: ev.referenceModel,
      };
    });

    // Pick templates for this week (respecting targetWorkoutsPerWeek)
    const countToSchedule = Math.min(targetWorkoutsPerWeek, dayTemplates.length);
    const templatesForWeek = dayTemplates.slice(0, countToSchedule);

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
      const template = templatesForWeek.find((t) => t.id === sol.workoutId) || templatesForWeek[tIdx];

      // Check if any strength event already exists for this date and template
      const existing = await prisma.calendarEvent.findFirst({
        where: {
          athleteProfileId,
          date: sol.dateStr,
          eventType: 'strength',
          OR: [
            { referenceId: template.id },
            { title: template.label },
            { referenceModel: 'WorkoutExecution' },
          ],
        },
      });

      if (!existing) {
        await prisma.calendarEvent.create({
          data: {
            athleteProfileId,
            date: sol.dateStr,
            eventType: 'strength',
            referenceModel: 'WorkoutDayTemplate',
            referenceId: template.id,
            title: template.label,
            status: 'planned',
            sortOrder: tIdx,
          },
        });
      }
    }
  }

  // Ensure no duplicates exist after scheduling
  await cleanupDuplicateStrengthEvents(athleteProfileId);
}

/**
 * Removes duplicate planned strength events on the same date with the same title,
 * keeping only the earliest created event for each date/title combination.
 */
export async function cleanupDuplicateStrengthEvents(athleteProfileId: string): Promise<number> {
  const prisma = await getPrisma();
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
  const prisma = await getPrisma();

  // 1. Purge any duplicate planned strength events
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

  // Count all strength events (both planned templates and completed executions)
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
