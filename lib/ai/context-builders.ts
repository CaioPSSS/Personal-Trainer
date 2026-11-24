/**
 * Deterministic pre-aggregation helpers that convert raw Prisma training, wellness,
 * nutrition, running, and cross-training records into compact, high-signal JSON digests
 * for LLM prompts (eliminating CUIDs, timestamps, and duplicated rawPlan blobs).
 */

export interface ExercisePerformanceDigestItem {
  exerciseName: string;
  movementPattern: string | null;
  sessionsCount: number;
  firstDate: string;
  lastDate: string;
  firstBestSet: { loadKg: number; reps: number; rpe: number | null; e1rmKg: number };
  latestBestSet: { loadKg: number; reps: number; rpe: number | null; e1rmKg: number };
  loadDeltaKg: number;
  e1rmDeltaKg: number;
  avgSetsPerSession: number;
  avgRpe: number | null;
  failureSetsCount: number;
  substitutedCount: number;
}

export interface WorkoutHistoryDigest {
  totalWorkouts: number;
  dateRange: { from: string; to: string } | null;
  avgDurationMin: number | null;
  avgSessionRpe: number | null;
  avgCaloriesBurned: number | null;
  exercises: ExercisePerformanceDigestItem[];
  recentSessionsSummary: Array<{
    date: string;
    durationMinutes: number | null;
    sessionRpe: number | null;
    caloriesBurned: number | null;
    totalSets: number;
    tonnageKg: number;
    exercises: string[];
    notes: string | null;
  }>;
}

export interface WellnessNutritionDigest {
  daysLogged: number;
  avgSleepHours: number | null;
  minSleepHours: number | null;
  avgFatigueLevel: number | null;
  avgSorenessLevel: number | null;
  avgStressLevel: number | null;
  avgEnergyLevel: number | null;
  latestBodyWeightKg: number | null;
  weightDeltaKg: number | null;
  avgCaloriesConsumed: number | null;
  avgCalorieTarget: number | null;
  avgCaloricBalanceKcal: number | null;
  avgProteinGrams: number | null;
  proteinGramsPerKg: number | null;
  dominantDietGoal: 'loss' | 'maintenance' | 'gain' | null;
  recentDays: Array<{
    date: string;
    sleepHours: number | null;
    fatigueLevel: number | null;
    sorenessLevel: number | null;
    stressLevel: number | null;
    bodyWeightKg: number | null;
    caloriesConsumed: number | null;
    proteinConsumed: number | null;
    dietGoal: string | null;
  }>;
}

export interface ConcurrentRunningDigest {
  hasRunningProfile: boolean;
  primaryObjective: string | null;
  weeklyRunsTarget: number | null;
  availableDays: string[] | null;
  currentPace5kFormatted: string | null;
  activePlan: {
    title: string;
    phase: string;
    weeklyTargetKm: number | null;
    scheduledKeySessions: Array<{
      dayOfWeek: string;
      sessionType: string;
      title: string;
      totalDistanceKm: number | null;
    }>;
  } | null;
  last14Days: {
    runsCount: number;
    totalKm: number;
    longRunsOrHighVolumeCount: number;
    avgRpe: number | null;
    totalCaloriesBurned: number;
  };
}

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

function estimateE1RM(loadKg: number, reps: number): number {
  if (loadKg <= 0 || reps <= 0) return 0;
  if (reps === 1) return round1(loadKg);
  return round1(loadKg * (1 + reps / 30));
}

function avgOrNull(values: number[]): number | null {
  if (values.length === 0) return null;
  return round1(values.reduce((acc, v) => acc + v, 0) / values.length);
}

function formatPaceMMSS(paceSec?: number | null): string | null {
  if (!paceSec || paceSec <= 0) return null;
  const m = Math.floor(paceSec / 60);
  const s = Math.round(paceSec % 60);
  return `${m}:${String(s).padStart(2, '0')}/km`;
}

/**
 * Strips internal DB metadata from AthleteProfile while keeping all coaching constraints.
 */
export function buildCompactAthleteProfile(profile: Record<string, unknown> | null | undefined) {
  if (!profile) return null;
  return {
    displayName: profile.displayName ?? null,
    trainingAgeYears: profile.trainingAgeYears ?? null,
    sessionDurationMin: profile.sessionDurationMin ?? 60,
    availableDays: profile.availableDays ?? null,
    weeklyWorkoutsTarget: profile.weeklyWorkoutsTarget ?? null,
    bodyWeightKg: profile.bodyWeightKg ?? null,
    heightCm: profile.heightCm ?? null,
    biologicalSex: profile.biologicalSex ?? null,
    bodyFatPercent: profile.bodyFatPercent ?? null,
    availableEquipment: profile.availableEquipment ?? null,
    movementRestrictions: profile.movementRestrictions ?? null,
    athleteContext: profile.athleteContext ?? null,
    recurringCrossTraining: profile.recurringCrossTraining ?? null,
  };
}

/**
 * Strips `rawPlan`, CUIDs, and timestamps from an active MesocyclePlan.
 */
export function buildCompactMesocycleSummary(
  mesocycle: {
    title?: string | null;
    objective?: string | null;
    split?: string | null;
    durationWeeks?: number | null;
    startDate?: string | null;
    endDate?: string | null;
    workoutDays?: Array<{
      dayOrder: number;
      label: string;
      estimatedDurationMin?: number | null;
      prescriptions?: Array<{
        exerciseName: string;
        movementPattern: string;
        targetSets: number;
        targetRepMin: number;
        targetRepMax: number;
        targetRpeMin?: number | null;
        targetRpeMax?: number | null;
      }>;
    }>;
  } | null | undefined
) {
  if (!mesocycle) return null;
  return {
    title: mesocycle.title ?? null,
    objective: mesocycle.objective ?? null,
    split: mesocycle.split ?? null,
    durationWeeks: mesocycle.durationWeeks ?? null,
    startDate: mesocycle.startDate ?? null,
    endDate: mesocycle.endDate ?? null,
    days: (mesocycle.workoutDays ?? []).map((d) => ({
      dayOrder: d.dayOrder,
      label: d.label,
      estimatedDurationMin: d.estimatedDurationMin ?? 60,
      exercises: (d.prescriptions ?? []).map((p) => ({
        exerciseName: p.exerciseName,
        movementPattern: p.movementPattern,
        targetSets: p.targetSets,
        reps: `${p.targetRepMin}-${p.targetRepMax}`,
        rpe:
          p.targetRpeMin != null && p.targetRpeMax != null
            ? `${p.targetRpeMin}-${p.targetRpeMax}`
            : null,
      })),
    })),
  };
}

/**
 * Computes deterministic per-exercise progression and session metrics across recent workouts.
 */
export function buildWorkoutHistoryDigest(
  workouts: Array<{
    date: string;
    durationMinutes?: number | null;
    sessionRpe?: number | null;
    caloriesBurned?: number | null;
    notes?: string | null;
    exerciseExecutions?: Array<{
      exerciseName: string;
      movementPattern?: string | null;
      substitutedFrom?: string | null;
      setExecutions?: Array<{
        loadKg?: number | null;
        reps: number;
        rpe?: number | null;
        isFailure?: boolean;
      }>;
    }>;
  }>
): WorkoutHistoryDigest {
  if (!workouts || workouts.length === 0) {
    return {
      totalWorkouts: 0,
      dateRange: null,
      avgDurationMin: null,
      avgSessionRpe: null,
      avgCaloriesBurned: null,
      exercises: [],
      recentSessionsSummary: [],
    };
  }

  // Sort chronologically ascending to compute true first -> latest progression
  const chronological = [...workouts].sort((a, b) => a.date.localeCompare(b.date));
  const durations: number[] = [];
  const sessionRpes: number[] = [];
  const calories: number[] = [];

  interface ExerciseAccumulator {
    exerciseName: string;
    movementPattern: string | null;
    entries: Array<{
      date: string;
      bestSet: { loadKg: number; reps: number; rpe: number | null; e1rmKg: number };
      setsCount: number;
      rpeSum: number;
      rpeCount: number;
      failureCount: number;
      wasSubstituted: boolean;
    }>;
  }

  const byExercise = new Map<string, ExerciseAccumulator>();
  const sessionSummaries: WorkoutHistoryDigest['recentSessionsSummary'] = [];

  for (const w of chronological) {
    if (w.durationMinutes != null && w.durationMinutes > 0) durations.push(w.durationMinutes);
    if (w.sessionRpe != null && w.sessionRpe > 0) sessionRpes.push(w.sessionRpe);
    if (w.caloriesBurned != null && w.caloriesBurned > 0) calories.push(w.caloriesBurned);

    let totalSets = 0;
    let tonnageKg = 0;
    const exerciseNames: string[] = [];

    for (const ex of w.exerciseExecutions ?? []) {
      const validSets = (ex.setExecutions ?? []).filter((s) => (s.reps ?? 0) > 0);
      if (validSets.length === 0) continue;

      exerciseNames.push(ex.exerciseName);
      totalSets += validSets.length;

      let bestSet = {
        loadKg: 0,
        reps: 0,
        rpe: null as number | null,
        e1rmKg: 0,
      };
      let rpeSum = 0;
      let rpeCount = 0;
      let failureCount = 0;

      for (const s of validSets) {
        const load = s.loadKg ?? 0;
        const reps = s.reps ?? 0;
        tonnageKg += load * reps;
        const e1rm = estimateE1RM(load, reps);
        if (
          e1rm > bestSet.e1rmKg ||
          (e1rm === bestSet.e1rmKg && load > bestSet.loadKg) ||
          (e1rm === 0 && reps > bestSet.reps)
        ) {
          bestSet = {
            loadKg: round1(load),
            reps,
            rpe: s.rpe ?? null,
            e1rmKg: e1rm,
          };
        }
        if (s.rpe != null && s.rpe > 0) {
          rpeSum += s.rpe;
          rpeCount++;
        }
        if (s.isFailure) failureCount++;
      }

      const key = ex.exerciseName.trim().toLowerCase();
      let acc = byExercise.get(key);
      if (!acc) {
        acc = {
          exerciseName: ex.exerciseName.trim(),
          movementPattern: ex.movementPattern ?? null,
          entries: [],
        };
        byExercise.set(key, acc);
      }
      if (!acc.movementPattern && ex.movementPattern) {
        acc.movementPattern = ex.movementPattern;
      }
      acc.entries.push({
        date: w.date,
        bestSet,
        setsCount: validSets.length,
        rpeSum,
        rpeCount,
        failureCount,
        wasSubstituted: Boolean(ex.substitutedFrom),
      });
    }

    sessionSummaries.push({
      date: w.date,
      durationMinutes: w.durationMinutes ?? null,
      sessionRpe: w.sessionRpe ?? null,
      caloriesBurned: w.caloriesBurned ?? null,
      totalSets,
      tonnageKg: round1(tonnageKg),
      exercises: exerciseNames,
      notes: w.notes ? w.notes.slice(0, 140) : null,
    });
  }

  const exercises: ExercisePerformanceDigestItem[] = Array.from(byExercise.values())
    .map((acc) => {
      const first = acc.entries[0];
      const latest = acc.entries[acc.entries.length - 1];
      const totalSets = acc.entries.reduce((s, e) => s + e.setsCount, 0);
      const totalRpeSum = acc.entries.reduce((s, e) => s + e.rpeSum, 0);
      const totalRpeCount = acc.entries.reduce((s, e) => s + e.rpeCount, 0);
      const failureSetsCount = acc.entries.reduce((s, e) => s + e.failureCount, 0);
      const substitutedCount = acc.entries.filter((e) => e.wasSubstituted).length;

      return {
        exerciseName: acc.exerciseName,
        movementPattern: acc.movementPattern,
        sessionsCount: acc.entries.length,
        firstDate: first.date,
        lastDate: latest.date,
        firstBestSet: first.bestSet,
        latestBestSet: latest.bestSet,
        loadDeltaKg: round1(latest.bestSet.loadKg - first.bestSet.loadKg),
        e1rmDeltaKg: round1(latest.bestSet.e1rmKg - first.bestSet.e1rmKg),
        avgSetsPerSession: round1(totalSets / acc.entries.length),
        avgRpe: totalRpeCount > 0 ? round1(totalRpeSum / totalRpeCount) : null,
        failureSetsCount,
        substitutedCount,
      };
    })
    .sort((a, b) => b.sessionsCount - a.sessionsCount)
    .slice(0, 28);

  return {
    totalWorkouts: chronological.length,
    dateRange: {
      from: chronological[0].date,
      to: chronological[chronological.length - 1].date,
    },
    avgDurationMin: avgOrNull(durations),
    avgSessionRpe: avgOrNull(sessionRpes),
    avgCaloriesBurned: avgOrNull(calories),
    exercises,
    recentSessionsSummary: sessionSummaries.slice(-10).reverse(),
  };
}

/**
 * Computes recovery, sleep, stress, weight, and metabolic/nutrition summary from WellnessDaily logs.
 */
export function buildWellnessNutritionDigest(
  logs: Array<{
    date: string;
    sleepHours?: number | null;
    fatigueLevel?: number | null;
    sorenessLevel?: number | null;
    stressLevel?: number | null;
    energyLevel?: number | null;
    bodyWeightKg?: number | null;
    caloriesConsumed?: number | null;
    proteinConsumed?: number | null;
    calorieTarget?: number | null;
    dietGoal?: string | null;
  }>,
  fallbackBodyWeightKg?: number | null
): WellnessNutritionDigest {
  if (!logs || logs.length === 0) {
    return {
      daysLogged: 0,
      avgSleepHours: null,
      minSleepHours: null,
      avgFatigueLevel: null,
      avgSorenessLevel: null,
      avgStressLevel: null,
      avgEnergyLevel: null,
      latestBodyWeightKg: fallbackBodyWeightKg ?? null,
      weightDeltaKg: null,
      avgCaloriesConsumed: null,
      avgCalorieTarget: null,
      avgCaloricBalanceKcal: null,
      avgProteinGrams: null,
      proteinGramsPerKg: null,
      dominantDietGoal: null,
      recentDays: [],
    };
  }

  const chronological = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  const recent28 = chronological.slice(-28);

  const sleep = recent28.map((l) => l.sleepHours).filter((v): v is number => v != null && v > 0);
  const fatigue = recent28.map((l) => l.fatigueLevel).filter((v): v is number => v != null && v > 0);
  const soreness = recent28.map((l) => l.sorenessLevel).filter((v): v is number => v != null && v > 0);
  const stress = recent28.map((l) => l.stressLevel).filter((v): v is number => v != null && v > 0);
  const energy = recent28.map((l) => l.energyLevel).filter((v): v is number => v != null && v > 0);
  const weights = recent28.map((l) => l.bodyWeightKg).filter((v): v is number => v != null && v > 0);
  const kcal = recent28.map((l) => l.caloriesConsumed).filter((v): v is number => v != null && v > 0);
  const targets = recent28.map((l) => l.calorieTarget).filter((v): v is number => v != null && v > 0);
  const protein = recent28.map((l) => l.proteinConsumed).filter((v): v is number => v != null && v > 0);

  const balances = recent28
    .filter((l) => l.caloriesConsumed != null && l.caloriesConsumed > 0 && l.calorieTarget != null && l.calorieTarget > 0)
    .map((l) => (l.caloriesConsumed as number) - (l.calorieTarget as number));

  const goalCounts = new Map<'loss' | 'maintenance' | 'gain', number>();
  for (const l of recent28) {
    if (l.dietGoal === 'loss' || l.dietGoal === 'maintenance' || l.dietGoal === 'gain') {
      goalCounts.set(l.dietGoal, (goalCounts.get(l.dietGoal) ?? 0) + 1);
    }
  }
  let dominantDietGoal: 'loss' | 'maintenance' | 'gain' | null = null;
  let topCount = 0;
  for (const [goal, count] of goalCounts.entries()) {
    if (count > topCount) {
      topCount = count;
      dominantDietGoal = goal;
    }
  }

  const latestWeight = weights.length > 0 ? weights[weights.length - 1] : (fallbackBodyWeightKg ?? null);
  const weightDeltaKg = weights.length >= 2 ? round1(weights[weights.length - 1] - weights[0]) : null;
  const avgProtein = avgOrNull(protein);
  const proteinGramsPerKg =
    avgProtein != null && latestWeight != null && latestWeight > 0
      ? round1(avgProtein / latestWeight)
      : null;

  return {
    daysLogged: recent28.length,
    avgSleepHours: avgOrNull(sleep),
    minSleepHours: sleep.length > 0 ? round1(Math.min(...sleep)) : null,
    avgFatigueLevel: avgOrNull(fatigue),
    avgSorenessLevel: avgOrNull(soreness),
    avgStressLevel: avgOrNull(stress),
    avgEnergyLevel: avgOrNull(energy),
    latestBodyWeightKg: latestWeight != null ? round1(latestWeight) : null,
    weightDeltaKg,
    avgCaloriesConsumed: avgOrNull(kcal),
    avgCalorieTarget: avgOrNull(targets),
    avgCaloricBalanceKcal: avgOrNull(balances),
    avgProteinGrams: avgProtein,
    proteinGramsPerKg,
    dominantDietGoal,
    recentDays: recent28
      .slice(-7)
      .reverse()
      .map((l) => ({
        date: l.date,
        sleepHours: l.sleepHours ?? null,
        fatigueLevel: l.fatigueLevel ?? null,
        sorenessLevel: l.sorenessLevel ?? null,
        stressLevel: l.stressLevel ?? null,
        bodyWeightKg: l.bodyWeightKg ?? null,
        caloriesConsumed: l.caloriesConsumed ?? null,
        proteinConsumed: l.proteinConsumed ?? null,
        dietGoal: l.dietGoal ?? null,
      })),
  };
}

/**
 * Summarizes the athlete's concurrent Running profile, active plan, and recent 14-day load
 * so Master Coach can autoregulate lower-body hypertrophy volume and axial fatigue.
 */
export function buildConcurrentRunningDigest(params: {
  runningProfile: {
    primaryObjective?: string | null;
    weeklyRunsTarget?: number | null;
    availableDays?: unknown;
    currentPace5kSec?: number | null;
  } | null;
  activeRunningPlan: {
    title: string;
    phase: string;
    weeklyTargetKm?: number | null;
    sessions?: Array<{
      weekNumber: number;
      dayOfWeek: string;
      sessionType: string;
      title: string;
      totalDistanceKm?: number | null;
    }>;
  } | null;
  recentRuns: Array<{
    date: string;
    distanceKm: number;
    sessionRpe?: number | null;
    caloriesBurned?: number | null;
  }>;
}): ConcurrentRunningDigest | null {
  const { runningProfile, activeRunningPlan, recentRuns } = params;
  if (!runningProfile && !activeRunningPlan && recentRuns.length === 0) {
    return null;
  }

  const totalKm = round1(recentRuns.reduce((sum, r) => sum + (r.distanceKm || 0), 0));
  const rpes = recentRuns.map((r) => r.sessionRpe).filter((v): v is number => v != null && v > 0);
  const totalCalories = Math.round(
    recentRuns.reduce((sum, r) => sum + (r.caloriesBurned || 0), 0)
  );
  const longRunsOrHighVolumeCount = recentRuns.filter((r) => (r.distanceKm || 0) >= 10).length;

  // Extract representative week-1/key sessions from the active running plan
  const keySessionTypes = new Set(['long_run', 'intervals', 'tempo', 'hill_repeats', 'race_pace']);
  const week1OrKey = (activeRunningPlan?.sessions ?? [])
    .filter((s) => s.weekNumber === 1 || keySessionTypes.has(s.sessionType))
    .slice(0, 6)
    .map((s) => ({
      dayOfWeek: s.dayOfWeek,
      sessionType: s.sessionType,
      title: s.title,
      totalDistanceKm: s.totalDistanceKm ?? null,
    }));

  return {
    hasRunningProfile: Boolean(runningProfile),
    primaryObjective: runningProfile?.primaryObjective ?? null,
    weeklyRunsTarget: runningProfile?.weeklyRunsTarget ?? null,
    availableDays: Array.isArray(runningProfile?.availableDays)
      ? (runningProfile?.availableDays as string[])
      : null,
    currentPace5kFormatted: formatPaceMMSS(runningProfile?.currentPace5kSec),
    activePlan: activeRunningPlan
      ? {
          title: activeRunningPlan.title,
          phase: activeRunningPlan.phase,
          weeklyTargetKm: activeRunningPlan.weeklyTargetKm ?? null,
          scheduledKeySessions: week1OrKey,
        }
      : null,
    last14Days: {
      runsCount: recentRuns.length,
      totalKm,
      longRunsOrHighVolumeCount,
      avgRpe: avgOrNull(rpes),
      totalCaloriesBurned: totalCalories,
    },
  };
}

/**
 * Strips DB boilerplate from recent CrossTrainingActivity records.
 */
export function buildCompactCrossTrainingDigest(
  activities: Array<{
    date: string;
    activityType: string;
    title?: string | null;
    durationMinutes: number;
    sessionRpe?: number | null;
    muscleGroups?: unknown;
    caloriesBurned?: number | null;
    notes?: string | null;
  }>
) {
  return activities.map((a) => ({
    date: a.date,
    activityType: a.activityType,
    title: a.title ?? null,
    durationMinutes: a.durationMinutes,
    sessionRpe: a.sessionRpe ?? null,
    muscleGroups: a.muscleGroups ?? null,
    caloriesBurned: a.caloriesBurned ?? null,
    notes: a.notes ? a.notes.slice(0, 120) : null,
  }));
}
