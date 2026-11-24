import { normalizeTextKey } from '@/lib/ai/exercise-swap';
import { isISODate, shiftISODate } from '@/lib/dates';

export interface MuscleGroupVolumeItem {
  muscleGroup: string;
  key: string;
  directSets: number;
  secondarySets: number;
  effectiveSets: number;
  mev: number;
  mavMin: number;
  mavMax: number;
  mrv: number;
  status: 'below_mev' | 'optimal_mav' | 'approaching_mrv' | 'exceeding_mrv';
  statusLabel: string;
  hasCrossFitOverlap: boolean;
  crossFitSessionsCount: number;
}

export interface PersonalRecordItem {
  exerciseName: string;
  movementPattern: string;
  maxLoadKg: number;
  bestSetRepsAtMaxLoad: number;
  bestEstimated1RM: number;
  best1RMSetLabel: string;
  achievedDate: string;
  totalSessionsCount: number;
}

export interface MesocycleComparisonResult {
  hasPreviousMesocycle: boolean;
  activeTitle: string;
  previousTitle: string | null;
  activeAvgTonnageKg: number;
  previousAvgTonnageKg: number;
  tonnageDeltaPercent: number | null;
  activeAvgSetsPerSession: number;
  previousAvgSetsPerSession: number;
  activeAvgRpe: number | null;
  previousAvgRpe: number | null;
  activeSessionsCompleted: number;
  previousSessionsCompleted: number;
  topExerciseGains: Array<{
    exerciseName: string;
    previousMaxLoadKg: number;
    activeMaxLoadKg: number;
    deltaKg: number;
    previousBest1RM: number;
    activeBest1RM: number;
  }>;
}

/**
 * Calculates Estimated 1RM (e1RM) using Epley formula adjusted for Reps in Reserve (RIR).
 * When RPE is provided (5..10), effective max reps = reps + (10 - RPE).
 */
export function calculateEstimated1RM(
  loadKg: number | null | undefined,
  reps: number | null | undefined,
  rpe?: number | null
): number {
  const load = Number(loadKg ?? 0);
  const repCount = Number(reps ?? 0);
  if (load <= 0 || repCount <= 0) return 0;

  const parsedRpe = rpe != null && !isNaN(Number(rpe)) ? Math.min(10, Math.max(5, Number(rpe))) : null;
  const rir = parsedRpe != null ? Math.max(0, 10 - parsedRpe) : 0;
  const effectiveReps = Math.min(30, repCount + rir);

  if (effectiveReps === 1) {
    return Math.round(load * 10) / 10;
  }

  // Epley formula: 1RM = weight * (1 + effectiveReps / 30)
  const e1rm = load * (1 + effectiveReps / 30);
  return Math.round(e1rm * 10) / 10;
}

const MUSCLE_LANDMARKS: Array<{
  key: string;
  muscleGroup: string;
  mev: number;
  mavMin: number;
  mavMax: number;
  mrv: number;
  crossFitAliases: string[];
}> = [
  {
    key: 'chest',
    muscleGroup: 'Peitoral',
    mev: 8,
    mavMin: 10,
    mavMax: 16,
    mrv: 20,
    crossFitAliases: ['peito', 'chest', 'full body'],
  },
  {
    key: 'back',
    muscleGroup: 'Costas / Dorsais',
    mev: 10,
    mavMin: 12,
    mavMax: 18,
    mrv: 22,
    crossFitAliases: ['costas', 'back', 'full body'],
  },
  {
    key: 'quads',
    muscleGroup: 'Quadríceps',
    mev: 8,
    mavMin: 10,
    mavMax: 16,
    mrv: 20,
    crossFitAliases: ['pernas', 'legs', 'quadriceps', 'full body'],
  },
  {
    key: 'posterior',
    muscleGroup: 'Posteriores & Glúteos',
    mev: 6,
    mavMin: 10,
    mavMax: 16,
    mrv: 20,
    crossFitAliases: ['pernas', 'legs', 'posterior', 'gluteos', 'full body'],
  },
  {
    key: 'shoulders',
    muscleGroup: 'Ombros / Deltoides',
    mev: 8,
    mavMin: 10,
    mavMax: 16,
    mrv: 22,
    crossFitAliases: ['ombros', 'shoulders', 'full body'],
  },
  {
    key: 'biceps',
    muscleGroup: 'Bíceps',
    mev: 6,
    mavMin: 8,
    mavMax: 14,
    mrv: 18,
    crossFitAliases: ['bracos', 'arms', 'costas', 'full body'],
  },
  {
    key: 'triceps',
    muscleGroup: 'Tríceps',
    mev: 6,
    mavMin: 8,
    mavMax: 14,
    mrv: 18,
    crossFitAliases: ['bracos', 'arms', 'ombros', 'peito', 'full body'],
  },
  {
    key: 'core_calves',
    muscleGroup: 'Core & Panturrilhas',
    mev: 6,
    mavMin: 8,
    mavMax: 16,
    mrv: 22,
    crossFitAliases: ['core', 'abdomen', 'full body'],
  },
];

export function classifyExerciseMuscleGroup(
  exerciseName: string,
  movementPattern?: string | null
): { primary: string; secondary?: string } {
  const norm = `${normalizeTextKey(exerciseName)} ${normalizeTextKey(movementPattern)}`;

  if (
    norm.includes('biceps') ||
    norm.includes('rosca') ||
    norm.includes('scott') ||
    norm.includes('martelo') ||
    norm.includes('elbow flexion') ||
    norm.includes('curl')
  ) {
    return { primary: 'biceps' };
  }

  if (
    norm.includes('triceps') ||
    norm.includes('frances') ||
    norm.includes('testa') ||
    norm.includes('elbow extension') ||
    norm.includes('pulley triceps') ||
    norm.includes('mergulho')
  ) {
    return { primary: 'triceps' };
  }

  if (
    norm.includes('supino') ||
    norm.includes('peito') ||
    norm.includes('peitoral') ||
    norm.includes('crucifixo') ||
    norm.includes('crossover') ||
    norm.includes('peck deck') ||
    norm.includes('voador') ||
    norm.includes('horizontal push') ||
    norm.includes('chest')
  ) {
    return { primary: 'chest', secondary: 'triceps' };
  }

  if (
    norm.includes('desenvolvimento') ||
    norm.includes('elevacao lateral') ||
    norm.includes('elevacao frontal') ||
    norm.includes('crucifixo inverso') ||
    norm.includes('face pull') ||
    norm.includes('ombro') ||
    norm.includes('deltoide') ||
    norm.includes('vertical push') ||
    norm.includes('shoulder')
  ) {
    return { primary: 'shoulders' };
  }

  if (
    norm.includes('puxada') ||
    norm.includes('pulldown') ||
    norm.includes('barra fixa') ||
    norm.includes('gravitron') ||
    norm.includes('remada') ||
    norm.includes('serrote') ||
    norm.includes('vertical pull') ||
    norm.includes('horizontal pull') ||
    norm.includes('costas') ||
    norm.includes('dorsal') ||
    norm.includes('row')
  ) {
    return { primary: 'back', secondary: 'biceps' };
  }

  if (
    norm.includes('flexora') ||
    norm.includes('stiff') ||
    norm.includes('terra') ||
    norm.includes('romeno') ||
    norm.includes('rdl') ||
    norm.includes('elevacao pelvica') ||
    norm.includes('gluteo') ||
    norm.includes('abdutora') ||
    norm.includes('posterior') ||
    norm.includes('hinge') ||
    norm.includes('hip')
  ) {
    return { primary: 'posterior' };
  }

  if (
    norm.includes('agachamento') ||
    norm.includes('leg press') ||
    norm.includes('hack') ||
    norm.includes('extensora') ||
    norm.includes('afundo') ||
    norm.includes('bulgaro') ||
    norm.includes('passada') ||
    norm.includes('adutora') ||
    norm.includes('squat') ||
    norm.includes('knee') ||
    norm.includes('quadriceps')
  ) {
    return { primary: 'quads' };
  }

  return { primary: 'core_calves' };
}

export function computeWeeklyMuscleVolume(params: {
  weekWorkouts: Array<{
    exerciseExecutions: Array<{
      exerciseName: string;
      movementPattern?: string | null;
      setExecutions: Array<{ reps: number; loadKg?: number | null }>;
    }>;
  }>;
  weekCrossTraining: Array<{
    activityType: string;
    muscleGroups?: unknown;
  }>;
}): MuscleGroupVolumeItem[] {
  const { weekWorkouts, weekCrossTraining } = params;

  const directCounts = new Map<string, number>();
  const secondaryCounts = new Map<string, number>();
  for (const landmark of MUSCLE_LANDMARKS) {
    directCounts.set(landmark.key, 0);
    secondaryCounts.set(landmark.key, 0);
  }

  for (const workout of weekWorkouts) {
    for (const ex of workout.exerciseExecutions) {
      const validSets = ex.setExecutions.filter((s) => (s.reps ?? 0) > 0).length;
      if (validSets === 0) continue;

      const { primary, secondary } = classifyExerciseMuscleGroup(ex.exerciseName, ex.movementPattern);
      directCounts.set(primary, (directCounts.get(primary) ?? 0) + validSets);
      if (secondary && secondary !== primary) {
        secondaryCounts.set(secondary, (secondaryCounts.get(secondary) ?? 0) + validSets);
      }
    }
  }

  // Evaluate CrossFit / CrossTraining muscle group overlap
  const crossFitHits = new Map<string, number>();
  for (const ct of weekCrossTraining) {
    const rawGroups = Array.isArray(ct.muscleGroups) ? ct.muscleGroups : [];
    const normalizedGroups = rawGroups.map((g) => normalizeTextKey(String(g)));

    for (const landmark of MUSCLE_LANDMARKS) {
      const matched = landmark.crossFitAliases.some((alias) =>
        normalizedGroups.some((ng) => ng.includes(alias))
      );
      if (matched) {
        crossFitHits.set(landmark.key, (crossFitHits.get(landmark.key) ?? 0) + 1);
      }
    }
  }

  return MUSCLE_LANDMARKS.map((landmark) => {
    const directSets = directCounts.get(landmark.key) ?? 0;
    const secondarySets = secondaryCounts.get(landmark.key) ?? 0;
    const effectiveSets = Math.round((directSets + secondarySets * 0.5) * 10) / 10;
    const cfCount = crossFitHits.get(landmark.key) ?? 0;

    let status: MuscleGroupVolumeItem['status'] = 'below_mev';
    let statusLabel = 'Abaixo do MEV';

    if (effectiveSets > landmark.mrv) {
      status = 'exceeding_mrv';
      statusLabel = 'Acima do MRV (Risco Overreaching)';
    } else if (effectiveSets >= landmark.mavMax) {
      status = 'approaching_mrv';
      statusLabel = 'Limite Superior MAV/MRV';
    } else if (effectiveSets >= landmark.mev) {
      status = 'optimal_mav';
      statusLabel = effectiveSets >= landmark.mavMin ? 'Zona Ótima (MAV)' : 'Manutenção / MEV Atingido';
    }

    return {
      muscleGroup: landmark.muscleGroup,
      key: landmark.key,
      directSets,
      secondarySets,
      effectiveSets,
      mev: landmark.mev,
      mavMin: landmark.mavMin,
      mavMax: landmark.mavMax,
      mrv: landmark.mrv,
      status,
      statusLabel,
      hasCrossFitOverlap: cfCount > 0,
      crossFitSessionsCount: cfCount,
    };
  });
}

/**
 * Computes current active streak (from `today` or `today - 1`) and all-time historical record streak.
 */
export function computeStreakMetrics(
  completedDates: Iterable<string>,
  today: string
): { currentStreak: number; recordStreak: number } {
  const uniqueDates = Array.from(
    new Set(
      Array.from(completedDates).filter((d): d is string => isISODate(d))
    )
  ).sort();

  if (uniqueDates.length === 0) {
    return { currentStreak: 0, recordStreak: 0 };
  }

  const dateSet = new Set(uniqueDates);

  let currentStreak = 0;
  let cursor = dateSet.has(today) ? today : shiftISODate(today, -1);
  while (dateSet.has(cursor)) {
    currentStreak += 1;
    cursor = shiftISODate(cursor, -1);
  }

  let recordStreak = 1;
  let running = 1;
  for (let i = 1; i < uniqueDates.length; i += 1) {
    if (shiftISODate(uniqueDates[i - 1], 1) === uniqueDates[i]) {
      running += 1;
      if (running > recordStreak) {
        recordStreak = running;
      }
    } else {
      running = 1;
    }
  }

  return {
    currentStreak,
    recordStreak: Math.max(currentStreak, recordStreak),
  };
}

/**
 * Excludes low-intensity regenerative runs (`easy`, `recovery`, or RPE <= 4) from
 * Riegel/VDOT performance extrapolation curves so easy mileage does not regress pace trends.
 */
export function filterQualifyingPerformanceRuns<
  T extends {
    distanceKm: number;
    durationSeconds?: number | null;
    avgPaceSec?: number | null;
    sessionType?: string | null;
    sessionRpe?: number | null;
  },
>(runs: T[]): T[] {
  return runs.filter((run) => {
    if (!run.avgPaceSec || run.avgPaceSec <= 0 || !run.distanceKm || run.distanceKm < 1) {
      return false;
    }
    const type = (run.sessionType || '').toLowerCase();
    if (type === 'easy' || type === 'recovery') {
      return false;
    }
    if (typeof run.sessionRpe === 'number' && run.sessionRpe > 0 && run.sessionRpe <= 4) {
      return false;
    }
    return true;
  });
}

export function computePersonalRecordsHallOfFame(
  workouts: Array<{
    date: string;
    exerciseExecutions: Array<{
      exerciseName: string;
      movementPattern?: string | null;
      setExecutions: Array<{
        loadKg?: number | null;
        reps: number;
        rpe?: number | null;
      }>;
    }>;
  }>
): PersonalRecordItem[] {
  const prMap = new Map<
    string,
    {
      exerciseName: string;
      movementPattern: string;
      maxLoadKg: number;
      bestSetRepsAtMaxLoad: number;
      bestEstimated1RM: number;
      best1RMSetLabel: string;
      achievedDate: string;
      sessionDates: Set<string>;
    }
  >();

  for (const w of workouts) {
    for (const ex of w.exerciseExecutions) {
      const key = normalizeTextKey(ex.exerciseName);
      if (!key) continue;

      const validSets = ex.setExecutions.filter((s) => (s.loadKg ?? 0) > 0 && (s.reps ?? 0) > 0);
      if (validSets.length === 0) continue;

      let entry = prMap.get(key);
      if (!entry) {
        entry = {
          exerciseName: ex.exerciseName,
          movementPattern: ex.movementPattern || 'Geral',
          maxLoadKg: 0,
          bestSetRepsAtMaxLoad: 0,
          bestEstimated1RM: 0,
          best1RMSetLabel: '',
          achievedDate: w.date,
          sessionDates: new Set<string>(),
        };
        prMap.set(key, entry);
      }

      entry.sessionDates.add(w.date);

      for (const s of validSets) {
        const load = Number(s.loadKg ?? 0);
        const reps = Number(s.reps ?? 0);
        const e1rm = calculateEstimated1RM(load, reps, s.rpe);

        if (load > entry.maxLoadKg || (load === entry.maxLoadKg && reps > entry.bestSetRepsAtMaxLoad)) {
          entry.maxLoadKg = load;
          entry.bestSetRepsAtMaxLoad = reps;
        }

        if (e1rm > entry.bestEstimated1RM) {
          entry.bestEstimated1RM = e1rm;
          entry.best1RMSetLabel = `${load}kg × ${reps} reps`;
          entry.achievedDate = w.date;
        }
      }
    }
  }

  return Array.from(prMap.values())
    .map((item) => ({
      exerciseName: item.exerciseName,
      movementPattern: item.movementPattern,
      maxLoadKg: item.maxLoadKg,
      bestSetRepsAtMaxLoad: item.bestSetRepsAtMaxLoad,
      bestEstimated1RM: item.bestEstimated1RM,
      best1RMSetLabel: item.best1RMSetLabel,
      achievedDate: item.achievedDate,
      totalSessionsCount: item.sessionDates.size,
    }))
    .sort((a, b) => b.bestEstimated1RM - a.bestEstimated1RM);
}

export function computeMesocycleComparison(params: {
  activeMesocycle?: { id: string; title: string } | null;
  previousMesocycle?: { id: string; title: string } | null;
  workouts: Array<{
    mesocyclePlanId?: string | null;
    date: string;
    sessionRpe?: number | null;
    exerciseExecutions: Array<{
      exerciseName: string;
      setExecutions: Array<{
        loadKg?: number | null;
        reps: number;
        rpe?: number | null;
      }>;
    }>;
  }>;
}): MesocycleComparisonResult {
  const { activeMesocycle, previousMesocycle, workouts } = params;

  const summarizeBlock = (mesoId?: string | null) => {
    if (!mesoId) {
      return {
        sessions: 0,
        avgTonnageKg: 0,
        avgSetsPerSession: 0,
        avgRpe: null as number | null,
        exerciseStats: new Map<string, { name: string; maxLoadKg: number; best1RM: number }>(),
      };
    }

    const blockWorkouts = workouts.filter((w) => w.mesocyclePlanId === mesoId);
    if (blockWorkouts.length === 0) {
      return {
        sessions: 0,
        avgTonnageKg: 0,
        avgSetsPerSession: 0,
        avgRpe: null as number | null,
        exerciseStats: new Map<string, { name: string; maxLoadKg: number; best1RM: number }>(),
      };
    }

    let totalTonnage = 0;
    let totalSets = 0;
    let rpeSum = 0;
    let rpeCount = 0;
    const exerciseStats = new Map<string, { name: string; maxLoadKg: number; best1RM: number }>();

    for (const w of blockWorkouts) {
      if (w.sessionRpe != null && w.sessionRpe > 0) {
        rpeSum += w.sessionRpe;
        rpeCount += 1;
      }

      for (const ex of w.exerciseExecutions) {
        const key = normalizeTextKey(ex.exerciseName);
        let exEntry = exerciseStats.get(key);
        if (!exEntry) {
          exEntry = { name: ex.exerciseName, maxLoadKg: 0, best1RM: 0 };
          exerciseStats.set(key, exEntry);
        }

        for (const s of ex.setExecutions) {
          if ((s.reps ?? 0) <= 0) continue;
          totalSets += 1;
          const load = Number(s.loadKg ?? 0);
          totalTonnage += load * s.reps;
          if (load > exEntry.maxLoadKg) exEntry.maxLoadKg = load;
          const e1rm = calculateEstimated1RM(load, s.reps, s.rpe);
          if (e1rm > exEntry.best1RM) exEntry.best1RM = e1rm;
        }
      }
    }

    return {
      sessions: blockWorkouts.length,
      avgTonnageKg: Math.round(totalTonnage / blockWorkouts.length),
      avgSetsPerSession: Math.round((totalSets / blockWorkouts.length) * 10) / 10,
      avgRpe: rpeCount > 0 ? Math.round((rpeSum / rpeCount) * 10) / 10 : null,
      exerciseStats,
    };
  };

  const activeStats = summarizeBlock(activeMesocycle?.id);
  const prevStats = summarizeBlock(previousMesocycle?.id);

  const tonnageDeltaPercent =
    prevStats.avgTonnageKg > 0 && activeStats.avgTonnageKg > 0
      ? Math.round(((activeStats.avgTonnageKg - prevStats.avgTonnageKg) / prevStats.avgTonnageKg) * 1000) / 10
      : null;

  const topExerciseGains: MesocycleComparisonResult['topExerciseGains'] = [];
  for (const [key, actEx] of activeStats.exerciseStats.entries()) {
    const prevEx = prevStats.exerciseStats.get(key);
    if (prevEx && prevEx.maxLoadKg > 0 && actEx.maxLoadKg > 0) {
      topExerciseGains.push({
        exerciseName: actEx.name,
        previousMaxLoadKg: prevEx.maxLoadKg,
        activeMaxLoadKg: actEx.maxLoadKg,
        deltaKg: Math.round((actEx.maxLoadKg - prevEx.maxLoadKg) * 10) / 10,
        previousBest1RM: prevEx.best1RM,
        activeBest1RM: actEx.best1RM,
      });
    }
  }

  topExerciseGains.sort((a, b) => b.deltaKg - a.deltaKg);

  return {
    hasPreviousMesocycle: Boolean(previousMesocycle && prevStats.sessions > 0),
    activeTitle: activeMesocycle?.title ?? 'Bloco Atual',
    previousTitle: previousMesocycle?.title ?? null,
    activeAvgTonnageKg: activeStats.avgTonnageKg,
    previousAvgTonnageKg: prevStats.avgTonnageKg,
    tonnageDeltaPercent,
    activeAvgSetsPerSession: activeStats.avgSetsPerSession,
    previousAvgSetsPerSession: prevStats.avgSetsPerSession,
    activeAvgRpe: activeStats.avgRpe,
    previousAvgRpe: prevStats.avgRpe,
    activeSessionsCompleted: activeStats.sessions,
    previousSessionsCompleted: prevStats.sessions,
    topExerciseGains: topExerciseGains.slice(0, 6),
  };
}
