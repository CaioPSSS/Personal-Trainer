import {
  formatISODateShortPTBR,
  formatISODateWithWeekdayPTBR,
  isISODate,
  mondayOfISODate,
  shiftISODate,
  signedDiffISODays,
  todayISO,
} from '../dates';
import {
  computeCycleEndDate,
  resolveCycleAnchorMonday,
  resolveRunningPlanMonthYear,
} from './plan-dates';

export type CycleLifecycleStatus = 'none' | 'active' | 'completed' | 'ended';

export interface StrengthCycleStatusResult {
  status: CycleLifecycleStatus;
  needsRenewal: boolean;
  planId: string | null;
  title: string | null;
  split: string | null;
  startDate: string | null;
  endDate: string | null;
  currentWeek: number;
  durationWeeks: number;
  completedWorkouts: number;
  remainingPlannedCount: number;
  daysUntilEnd: number | null;
  suggestedStartDate: string;
  suggestedStartLabel: string;
  reason: string | null;
}

export interface RunningCycleStatusResult {
  status: CycleLifecycleStatus;
  needsRenewal: boolean;
  planId: string | null;
  title: string | null;
  month: number | null;
  year: number | null;
  lastSessionDate: string | null;
  completedSessions: number;
  skippedSessions: number;
  totalSessions: number;
  remainingPlannedCount: number;
  daysUntilEnd: number | null;
  suggestedStartDate: string;
  suggestedStartLabel: string;
  suggestedTargetMonth: number;
  suggestedTargetYear: number;
  reason: string | null;
}

export interface EvaluateStrengthCycleInput {
  today: string;
  activePlan: {
    id: string;
    title: string;
    split: string;
    startDate?: string | null;
    endDate?: string | null;
    createdAt: Date | string;
    durationWeeks: number;
  } | null;
  availableDayIndices: number[];
  weeklyWorkoutsTarget: number;
  completedWorkoutsCount: number;
  /** Number of remaining planned strength calendar events with date >= today. */
  remainingPlannedCount: number;
  /** Latest scheduled date among strength calendar events in the active cycle, if any. */
  lastScheduledEventDate?: string | null;
}

export interface EvaluateRunningCycleInput {
  today: string;
  activePlan: {
    id: string;
    title: string;
    month: number;
    year: number;
    sessions: Array<{
      scheduledDate: string;
      status: string;
    }>;
  } | null;
  availableDayIndices: number[];
  weeklyRunsTarget: number;
}

function toISODateFallback(value: Date | string): string {
  if (typeof value === 'string' && isISODate(value)) return value;
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return todayISO();
  return todayISO(parsed);
}

/**
 * Evaluates whether the active strength mesocycle is still ongoing, completed (last workout done),
 * or ended (past end date).
 *
 * Per user preference: only triggers renewal when the last planned workout is completed/resolved
 * OR the cycle period has ended, and keeps the prompt active until a new cycle is created.
 */
export function evaluateStrengthCycleStatus(
  input: EvaluateStrengthCycleInput
): StrengthCycleStatusResult {
  const {
    today,
    activePlan,
    availableDayIndices,
    weeklyWorkoutsTarget,
    completedWorkoutsCount,
    remainingPlannedCount,
    lastScheduledEventDate,
  } = input;

  const defaultAnchor = resolveCycleAnchorMonday({
    today,
    availableDayIndices,
    weeklyTarget: weeklyWorkoutsTarget,
  });

  if (!activePlan) {
    return {
      status: 'none',
      needsRenewal: false,
      planId: null,
      title: null,
      split: null,
      startDate: null,
      endDate: null,
      currentWeek: 0,
      durationWeeks: 0,
      completedWorkouts: 0,
      remainingPlannedCount: 0,
      daysUntilEnd: null,
      suggestedStartDate: defaultAnchor.effectiveStartDate,
      suggestedStartLabel: formatISODateWithWeekdayPTBR(defaultAnchor.effectiveStartDate),
      reason: null,
    };
  }

  const durationWeeks = Math.max(1, activePlan.durationWeeks || 4);
  const startDate =
    activePlan.startDate && isISODate(activePlan.startDate)
      ? activePlan.startDate
      : toISODateFallback(activePlan.createdAt);

  const computedEndDate = computeCycleEndDate(mondayOfISODate(startDate), durationWeeks);
  const endDate =
    activePlan.endDate && isISODate(activePlan.endDate)
      ? activePlan.endDate
      : computedEndDate;

  const daysSinceStart = signedDiffISODays(startDate, today);
  const currentWeek =
    daysSinceStart < 0
      ? 1
      : Math.min(durationWeeks, Math.max(1, Math.floor(daysSinceStart / 7) + 1));

  const effectiveBoundaryDate =
    lastScheduledEventDate && isISODate(lastScheduledEventDate) && lastScheduledEventDate > endDate
      ? lastScheduledEventDate
      : endDate;

  const daysUntilEnd = signedDiffISODays(today, effectiveBoundaryDate);

  let status: CycleLifecycleStatus = 'active';
  let reason: string | null = null;
  let suggestedStartDate = defaultAnchor.effectiveStartDate;

  if (today > effectiveBoundaryDate) {
    status = 'ended';
    reason = `O mesociclo "${activePlan.title}" encerrou em ${formatISODateShortPTBR(effectiveBoundaryDate)}.`;
    suggestedStartDate = defaultAnchor.effectiveStartDate;
  } else if (
    remainingPlannedCount === 0 &&
    (currentWeek >= durationWeeks || today >= effectiveBoundaryDate)
  ) {
    status = 'completed';
    reason = `Você concluiu o último treino planejado do mesociclo "${activePlan.title}"!`;
    // Suggest starting on the Monday immediately following the current cycle's final week
    const nextMondayAfterCycle = shiftISODate(mondayOfISODate(effectiveBoundaryDate), 7);
    suggestedStartDate =
      nextMondayAfterCycle >= today ? nextMondayAfterCycle : defaultAnchor.effectiveStartDate;
  }

  return {
    status,
    needsRenewal: status === 'completed' || status === 'ended',
    planId: activePlan.id,
    title: activePlan.title,
    split: activePlan.split,
    startDate,
    endDate: effectiveBoundaryDate,
    currentWeek,
    durationWeeks,
    completedWorkouts: completedWorkoutsCount,
    remainingPlannedCount,
    daysUntilEnd,
    suggestedStartDate,
    suggestedStartLabel: formatISODateWithWeekdayPTBR(suggestedStartDate),
    reason,
  };
}

/**
 * Evaluates whether the active 4-week running plan is ongoing, completed (last session resolved),
 * or ended (past the last session's date).
 */
export function evaluateRunningCycleStatus(
  input: EvaluateRunningCycleInput
): RunningCycleStatusResult {
  const { today, activePlan, availableDayIndices, weeklyRunsTarget } = input;

  const defaultAnchor = resolveCycleAnchorMonday({
    today,
    availableDayIndices,
    weeklyTarget: weeklyRunsTarget,
  });
  const defaultMonthYear = resolveRunningPlanMonthYear(defaultAnchor.anchorMonday);

  if (!activePlan || activePlan.sessions.length === 0) {
    return {
      status: 'none',
      needsRenewal: false,
      planId: activePlan?.id ?? null,
      title: activePlan?.title ?? null,
      month: activePlan?.month ?? null,
      year: activePlan?.year ?? null,
      lastSessionDate: null,
      completedSessions: 0,
      skippedSessions: 0,
      totalSessions: 0,
      remainingPlannedCount: 0,
      daysUntilEnd: null,
      suggestedStartDate: defaultAnchor.effectiveStartDate,
      suggestedStartLabel: formatISODateWithWeekdayPTBR(defaultAnchor.effectiveStartDate),
      suggestedTargetMonth: defaultMonthYear.month,
      suggestedTargetYear: defaultMonthYear.year,
      reason: null,
    };
  }

  const totalSessions = activePlan.sessions.length;
  const completedSessions = activePlan.sessions.filter((s) => s.status === 'completed').length;
  const skippedSessions = activePlan.sessions.filter((s) => s.status === 'skipped').length;
  const remainingPlannedCount = activePlan.sessions.filter(
    (s) => s.status === 'planned' && s.scheduledDate >= today
  ).length;

  const sortedDates = activePlan.sessions
    .map((s) => s.scheduledDate)
    .filter(isISODate)
    .sort();
  const lastSessionDate = sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : null;
  const daysUntilEnd = lastSessionDate ? signedDiffISODays(today, lastSessionDate) : null;

  let status: CycleLifecycleStatus = 'active';
  let reason: string | null = null;
  let suggestedStartDate = defaultAnchor.effectiveStartDate;

  if (lastSessionDate && today > lastSessionDate) {
    status = 'ended';
    reason = `O plano de corrida "${activePlan.title}" encerrou em ${formatISODateShortPTBR(lastSessionDate)}.`;
    suggestedStartDate = defaultAnchor.effectiveStartDate;
  } else if (remainingPlannedCount === 0) {
    status = 'completed';
    reason = `Você concluiu a última corrida planejada do ciclo "${activePlan.title}"!`;
    if (lastSessionDate) {
      const nextMondayAfterCycle = shiftISODate(mondayOfISODate(lastSessionDate), 7);
      suggestedStartDate =
        nextMondayAfterCycle >= today ? nextMondayAfterCycle : defaultAnchor.effectiveStartDate;
    }
  }

  const suggestedAnchor = resolveCycleAnchorMonday({
    today,
    availableDayIndices,
    weeklyTarget: weeklyRunsTarget,
    requestedStartDate: suggestedStartDate,
  });
  const suggestedMonthYear = resolveRunningPlanMonthYear(suggestedAnchor.anchorMonday);

  return {
    status,
    needsRenewal: status === 'completed' || status === 'ended',
    planId: activePlan.id,
    title: activePlan.title,
    month: activePlan.month,
    year: activePlan.year,
    lastSessionDate,
    completedSessions,
    skippedSessions,
    totalSessions,
    remainingPlannedCount,
    daysUntilEnd,
    suggestedStartDate: suggestedAnchor.effectiveStartDate,
    suggestedStartLabel: formatISODateWithWeekdayPTBR(suggestedAnchor.effectiveStartDate),
    suggestedTargetMonth: suggestedMonthYear.month,
    suggestedTargetYear: suggestedMonthYear.year,
    reason,
  };
}
