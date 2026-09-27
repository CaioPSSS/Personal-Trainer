/**
 * Deterministic Progressive Overload Engine
 *
 * Implements 100% pure, rule-based mathematical progression for strength training.
 * Evaluates completed sets against target rep range, RPE, and failure flags
 * to compute optimal working load progression without AI hallucinations.
 */

export interface CompletedSet {
  setNumber: number;
  loadKg: number;
  reps: number;
  rpe?: number | null;
  isFailure?: boolean;
}

export interface PreviousExercisePerformance {
  exerciseName: string;
  movementPattern?: string | null;
  isCompound: boolean;
  targetRepMin: number;
  targetRepMax: number;
  targetRpeMin: number;
  targetRpeMax: number;
  completedSets: CompletedSet[];
}

export interface LoadProgressionResult {
  suggestedLoadKg: number;
  previousMaxLoadKg: number;
  progressionReason: string;
  deltaKg: number;
  action: 'increment' | 'maintain' | 'micro_adjust';
}

export interface ExercisePreviousPerformanceData {
  lastLoadKg: number;
  suggestedLoadKg: number;
  deltaKg: number;
  lastReps: number;
  lastRpe: number | null;
  action: 'increment' | 'maintain' | 'micro_adjust';
  reason: string;
  progressionReason?: string;
}

/**
 * Rounds a weight value to the nearest 0.5 kg gym plate increment.
 */
export function roundToHalfKg(value: number): number {
  if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
    return 0;
  }
  return Math.round(value * 2) / 2;
}

/**
 * Normalizes a string by stripping accents and lowercasing.
 */
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Classifies whether an exercise is a multi-joint compound movement
 * or a single-joint isolation movement based on movement pattern and exercise name.
 */
export function isCompoundExercise(exerciseName: string, movementPattern?: string | null): boolean {
  const compoundPatterns = [
    'squat',
    'hinge',
    'lunge',
    'horizontal_push',
    'vertical_push',
    'horizontal_pull',
    'vertical_pull',
    'hip_thrust',
    'olympic_lift',
  ];

  const isolationPatterns = [
    'knee_extension',
    'knee_flexion',
    'calf_raise',
    'biceps_curl',
    'triceps_extension',
    'lateral_raise',
    'chest_fly',
    'rear_delt_fly',
    'isolation',
    'core',
    'abs',
  ];

  if (movementPattern) {
    const normPattern = normalizeString(movementPattern);
    if (compoundPatterns.some((cp) => normPattern.includes(cp))) {
      return true;
    }
    if (isolationPatterns.some((ip) => normPattern.includes(ip))) {
      return false;
    }
  }

  const normName = normalizeString(exerciseName);

  const isolationKeywords = [
    'extensora',
    'flexora',
    'panturrilha',
    'calf',
    'elevacao lateral',
    'lateral raise',
    'rosca',
    'curl',
    'triceps',
    'crucifixo',
    'fly',
    'peck deck',
    'voador',
    'pullover',
    'abducao',
    'aducao',
    'elevacao frontal',
    'abdominal',
    'prancha',
  ];

  if (isolationKeywords.some((kw) => normName.includes(kw))) {
    return false;
  }

  const compoundKeywords = [
    'agachamento',
    'squat',
    'leg press',
    'hack',
    'stiff',
    'levantamento terra',
    'terra',
    'deadlift',
    'supino',
    'bench press',
    'desenvolvimento',
    'overhead press',
    'military press',
    'remada',
    'puxada',
    'barra fixa',
    'chin up',
    'pull up',
    'dips',
    'paralela',
    'afundo',
    'passada',
    'lunge',
    'bulgarian',
    'bulgaro',
    'hip thrust',
    'elevacao pelvica',
    'clean',
    'snatch',
  ];

  if (compoundKeywords.some((kw) => normName.includes(kw))) {
    return true;
  }

  // Default fallback if undetermined: treat as compound if pattern is empty/unknown
  return false;
}

/**
 * Pure deterministic calculation of progressive overload.
 *
 * Rules:
 * 1. First session / no history: suggestedLoad = 0, deltaKg = 0, action = 'maintain'.
 * 2. Bodyweight only (loadKg = 0): suggestedLoad = 0, deltaKg = 0, action = 'maintain'.
 * 3. Fatigue / Failure hold (R < targetMin OR RPE >= 9.5 OR isFailure): maintain load (delta 0).
 * 4. Progressive overload increment (R >= targetMax AND RPE <= 8):
 *    - Compound: +2.5kg (or +5.0kg if R > targetMax + 1 and RPE <= 7.0)
 *    - Isolation: +1.0kg (or +2.0kg if R > targetMax + 1 and RPE <= 7.0)
 * 5. Technical consolidation (targetMin <= R <= targetMax AND 8.0 <= RPE <= 9.0): maintain load (delta 0).
 * 6. Within rep range with RPE < 8: maintain load to build reps up to targetMax.
 */
export function calculateProgressiveOverload(perf: PreviousExercisePerformance): LoadProgressionResult {
  const {
    exerciseName,
    movementPattern,
    isCompound: inputIsCompound,
    targetRepMin,
    targetRepMax,
    targetRpeMax,
    completedSets,
  } = perf;

  // Resolve compound vs isolation classification
  const isCompound = inputIsCompound || isCompoundExercise(exerciseName, movementPattern);

  // 1. Filter valid completed sets
  const validSets = (completedSets || []).filter((s) => s && s.reps > 0);

  if (validSets.length === 0) {
    return {
      suggestedLoadKg: 0,
      previousMaxLoadKg: 0,
      deltaKg: 0,
      action: 'maintain',
      progressionReason: 'Primeira execução do exercício. Defina a carga inicial.',
    };
  }

  // Check if all sets are bodyweight without external load
  const setsWithLoad = validSets.filter((s) => typeof s.loadKg === 'number' && s.loadKg > 0);
  if (setsWithLoad.length === 0) {
    return {
      suggestedLoadKg: 0,
      previousMaxLoadKg: 0,
      deltaKg: 0,
      action: 'maintain',
      progressionReason: 'Exercício com peso corporal. Progredir repetições ou adicionar sobrecarga externa.',
    };
  }

  // 2. Identify top set: highest load, breaking ties with highest reps
  const topSet = setsWithLoad.reduce((best, cur) => {
    if (cur.loadKg > best.loadKg) return cur;
    if (cur.loadKg === best.loadKg && cur.reps > best.reps) return cur;
    return best;
  }, setsWithLoad[0]);

  const previousMaxLoadKg = roundToHalfKg(topSet.loadKg);
  const reps = topSet.reps;
  const effectiveRpe =
    typeof topSet.rpe === 'number' && !isNaN(topSet.rpe) && topSet.rpe > 0
      ? topSet.rpe
      : (targetRpeMax ?? 8.0);

  const hasAnyFailure = validSets.some((s) => s.isFailure === true);

  // 3. Rule 3: Fatigue / Failure hold
  // If reps are below target minimum, RPE reached 9.5+, or any set hit mechanical failure
  if (reps < targetRepMin || effectiveRpe >= 9.5 || hasAnyFailure) {
    return {
      suggestedLoadKg: previousMaxLoadKg,
      previousMaxLoadKg,
      deltaKg: 0,
      action: 'maintain',
      progressionReason:
        'Esforço no limite ou repetições abaixo do piso. Manter carga para recuperação neuromuscular antes de novo incremento.',
    };
  }

  // 4. Rule 1: Progressive Overload Increment
  // Rep ceiling reached with good reserve (RPE <= 8.0) and no premature failure
  if (reps >= targetRepMax && effectiveRpe <= 8.0) {
    let delta = 0;
    if (isCompound) {
      // If reps exceeded ceiling with very low effort (RPE <= 7.0), award higher jump (+5.0kg)
      delta = reps > targetRepMax + 1 && effectiveRpe <= 7.0 ? 5.0 : 2.5;
    } else {
      // Isolation movements: +1.0kg to +2.0kg
      delta = reps > targetRepMax + 1 && effectiveRpe <= 7.0 ? 2.0 : 1.0;
    }

    const suggestedLoadKg = roundToHalfKg(previousMaxLoadKg + delta);
    return {
      suggestedLoadKg,
      previousMaxLoadKg,
      deltaKg: delta,
      action: 'increment',
      progressionReason: `Meta de repetições atingida com reserva de esforço (RPE ≤ 8). Sobrecarga progressiva recomendada: +${delta} kg.`,
    };
  }

  // 5. Rule 2: Technical Consolidation (RPE 8.0 - 9.0 within rep range)
  if (reps >= targetRepMin && reps <= targetRepMax && effectiveRpe >= 8.0 && effectiveRpe <= 9.0) {
    return {
      suggestedLoadKg: previousMaxLoadKg,
      previousMaxLoadKg,
      deltaKg: 0,
      action: 'maintain',
      progressionReason:
        'Carga desafiadora dentro da faixa alvo (RPE 8-9). Manter carga para consolidação técnica e ganho de repetições.',
    };
  }

  // 6. Default / Double Progression: reps within range with low RPE (< 8.0) but reps < targetRepMax
  // Maintain load and encourage athlete to build repetitions towards rep ceiling
  return {
    suggestedLoadKg: previousMaxLoadKg,
    previousMaxLoadKg,
    deltaKg: 0,
    action: 'maintain',
    progressionReason:
      'Meta mínima atingida com boa reserva. Progredir repetições em direção ao topo da faixa antes de subir a carga.',
  };
}
