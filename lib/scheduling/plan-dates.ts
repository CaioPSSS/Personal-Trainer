import {
  isISODate,
  mondayOfISODate,
  shiftISODate,
  weekdayIndexISO,
} from '../dates';

export const CANONICAL_DAY_NAMES = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type CanonicalDayName = (typeof CANONICAL_DAY_NAMES)[number];

export interface ResolveCycleAnchorParams {
  /** Current calendar date in the athlete's timezone ("YYYY-MM-DD"). */
  today: string;
  /** Monday=0 .. Sunday=6 available days configured by the athlete. */
  availableDayIndices: number[];
  /** Number of workouts/sessions planned per week. */
  weeklyTarget: number;
  /** Optional explicit start date requested by the athlete ("YYYY-MM-DD", >= today). */
  requestedStartDate?: string | null;
}

export interface ResolvedCycleAnchor {
  /** ISO date of Monday of Week 1 ("YYYY-MM-DD"). */
  anchorMonday: string;
  /** Effective first date on which Week 1 workouts may be scheduled (>= today). */
  effectiveStartDate: string;
  /** Day indices (0..6) allowed for Week 1 scheduling without dropping any workout. */
  week1AllowedDayIndices: number[];
  /** Canonical lowercase English day names corresponding to `week1AllowedDayIndices`. */
  week1AllowedDayNames: CanonicalDayName[];
  /** True when the anchor rolled forward to a future Monday instead of the current week. */
  rolledToNextWeek: boolean;
}

function sanitizeAvailableDayIndices(indices: number[]): number[] {
  const unique = Array.from(
    new Set(indices.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))
  ).sort((a, b) => a - b);
  return unique.length > 0 ? unique : [0, 1, 2, 3, 4];
}

/**
 * Deterministically resolves the Week 1 anchor Monday and allowed Week 1 days so that
 * generating a plan late in the week (or on weekends) never silently drops Week 1 sessions.
 *
 * Smart Rule:
 * - If enough `availableDayIndices` remain on/after the start floor in that week to fit
 *   `effectiveWeeklyTarget`, start in that week and restrict Week 1 to those remaining days.
 * - Otherwise (e.g. Saturday/Sunday or late in the week without enough available slots),
 *   roll Week 1 cleanly to the next Monday so all weeks are preserved in full.
 */
export function resolveCycleAnchorMonday(
  params: ResolveCycleAnchorParams
): ResolvedCycleAnchor {
  const { today, weeklyTarget, requestedStartDate } = params;
  const available = sanitizeAvailableDayIndices(params.availableDayIndices);
  const clampedTarget = Math.max(1, Math.min(Math.round(weeklyTarget || 1), available.length));

  // Resolve the earliest floor date (cannot schedule in the past)
  const floorDate =
    requestedStartDate && isISODate(requestedStartDate) && requestedStartDate >= today
      ? requestedStartDate
      : today;

  const floorMonday = mondayOfISODate(floorDate);
  const floorDayIndex = weekdayIndexISO(floorDate);
  const currentMonday = mondayOfISODate(today);

  const remainingAvailableInFloorWeek = available.filter((d) => d >= floorDayIndex);

  if (remainingAvailableInFloorWeek.length >= clampedTarget) {
    return {
      anchorMonday: floorMonday,
      effectiveStartDate: floorDate,
      week1AllowedDayIndices: remainingAvailableInFloorWeek,
      week1AllowedDayNames: remainingAvailableInFloorWeek.map((d) => CANONICAL_DAY_NAMES[d]),
      rolledToNextWeek: floorMonday > currentMonday,
    };
  }

  // Not enough available days left in that week: roll cleanly to the next Monday
  const nextMonday = shiftISODate(floorMonday, 7);
  return {
    anchorMonday: nextMonday,
    effectiveStartDate: nextMonday,
    week1AllowedDayIndices: available,
    week1AllowedDayNames: available.map((d) => CANONICAL_DAY_NAMES[d]),
    rolledToNextWeek: true,
  };
}

/**
 * Resolves the canonical `(month, year)` label for a 4-week RunningPlan anchored at `anchorMonday`.
 * Uses Thursday of Week 1 (ISO-8601 week convention) so a cycle starting Monday Nov 30
 * belongs to December instead of colliding with November's plan.
 */
export function resolveRunningPlanMonthYear(anchorMonday: string): {
  month: number;
  year: number;
} {
  const thursdayOfWeek1 = shiftISODate(anchorMonday, 3);
  const [year, month] = thursdayOfWeek1.split('-').map(Number);
  return { month, year };
}

/**
 * Computes the inclusive end date (Sunday of the final week) for a cycle anchored on `anchorMonday`.
 */
export function computeCycleEndDate(anchorMonday: string, durationWeeks: number): string {
  const weeks = Math.max(1, Math.round(durationWeeks || 4));
  return shiftISODate(anchorMonday, weeks * 7 - 1);
}
