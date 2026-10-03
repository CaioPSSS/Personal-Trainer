/**
 * Scientific Calorie Estimation Engine for Resistance / Strength Training
 *
 * Implements a 3-layer hybrid model based on peer-reviewed exercise physiology:
 * - Layer 1: Mechanical & metabolic work per set (Lytle & Crouse 2019, Reis 2017, Scott 2011)
 * - Layer 2: Inter-set recovery oxygen consumption & basal active expenditure (Abboud 2013)
 * - Layer 3: Excess Post-Exercise Oxygen Consumption (EPOC / Afterburn) (LaForgia 2006, Børsheim 2003)
 */

export interface SetCalorieInput {
  setNumber?: number;
  reps: number;
  loadKg?: number | null;
  rpe?: number | null;
}

export interface ExerciseCalorieInput {
  exerciseName: string;
  movementPattern?: string | null;
  sets: SetCalorieInput[];
}

export interface StrengthSessionCalorieInput {
  athleteWeightKg: number;
  durationMinutes?: number | null;
  sessionRpe?: number | null;
  exercises: ExerciseCalorieInput[];
}

export interface ExerciseCalorieBreakdown {
  exerciseName: string;
  movementCategory: string;
  exerciseMultiplier: number;
  totalVolumeLoadKg: number;
  setCount: number;
  totalReps: number;
  caloriesBurned: number;
}

export interface StrengthCalorieResult {
  totalCalories: number;
  mechanicalWorkCalories: number;
  interSetCalories: number;
  epocCalories: number;
  totalVolumeLoadKg: number;
  totalSets: number;
  totalReps: number;
  epocFactor: number;
  perExercise: ExerciseCalorieBreakdown[];
}

/**
 * Maps exercise name and movement pattern to biomechanical category and energy multiplier.
 * Reis et al. (2017) demonstrated that lower-body multi-joint movements recruit substantially
 * more active muscle mass than single-joint upper-body movements.
 */
export function getExerciseCategoryAndMultiplier(
  exerciseName: string,
  movementPattern?: string | null
): { category: string; multiplier: number } {
  const name = exerciseName.toLowerCase();
  const pattern = (movementPattern || '').toLowerCase();

  // 1. Lower Body Compound (1.35x)
  if (
    pattern.includes('squat') ||
    pattern.includes('hip_hinge') ||
    pattern.includes('lunge') ||
    pattern.includes('legs_compound') ||
    name.includes('agachamento') ||
    name.includes('squat') ||
    name.includes('leg press') ||
    name.includes('hack') ||
    name.includes('stiff') ||
    name.includes('terra') ||
    name.includes('deadlift') ||
    name.includes('passada') ||
    name.includes('afundo') ||
    name.includes('bulgaro') ||
    name.includes('búlgaro') ||
    name.includes('hip thrust') ||
    name.includes('elevacao pelvica') ||
    name.includes('elevação pélvica')
  ) {
    return { category: 'compound_lower', multiplier: 1.35 };
  }

  // 2. Core / Abdominals (0.60x)
  if (
    pattern.includes('core') ||
    pattern.includes('abs') ||
    name.includes('abdominal') ||
    name.includes('crunch') ||
    name.includes('prancha') ||
    name.includes('plank') ||
    name.includes('ab coaster')
  ) {
    return { category: 'core', multiplier: 0.6 };
  }

  // 3. Lower Body Isolation (0.80x)
  if (
    pattern.includes('isolation_lower') ||
    name.includes('extensora') ||
    name.includes('flexora') ||
    name.includes('adutora') ||
    name.includes('abdutora') ||
    name.includes('panturrilha') ||
    name.includes('gemeos') ||
    name.includes('gêmeos') ||
    name.includes('soleo') ||
    name.includes('sóleo') ||
    name.includes('calf')
  ) {
    return { category: 'isolation_lower', multiplier: 0.8 };
  }

  // 4. Upper Body Isolation (0.65x)
  if (
    pattern.includes('isolation') ||
    name.includes('rosca') ||
    name.includes('biceps') ||
    name.includes('bíceps') ||
    name.includes('triceps') ||
    name.includes('tríceps') ||
    name.includes('lateral') ||
    name.includes('frontal') ||
    name.includes('crucifixo') ||
    name.includes('voador inverso') ||
    name.includes('peck deck inverso')
  ) {
    return { category: 'isolation_upper', multiplier: 0.65 };
  }

  // 5. Upper Body Compound (Default baseline: 1.00x)
  // (Bench press, rows, pulldowns, shoulder presses, etc.)
  return { category: 'compound_upper', multiplier: 1.0 };
}

/**
 * Calculates effective load for bodyweight movements when no external load is specified.
 */
function resolveEffectiveSetLoad(
  exerciseName: string,
  declaredLoad: number | null | undefined,
  athleteWeightKg: number
): number {
  if (declaredLoad != null && declaredLoad > 0) {
    return declaredLoad;
  }

  const name = exerciseName.toLowerCase();
  if (name.includes('barra fixa') || name.includes('pull-up') || name.includes('chin-up')) {
    return athleteWeightKg * 1.0;
  }
  if (name.includes('paralela') || name.includes('dip')) {
    return athleteWeightKg * 0.85;
  }
  if (name.includes('flexao') || name.includes('flexão') || name.includes('push-up')) {
    return athleteWeightKg * 0.65;
  }
  if (name.includes('prancha') || name.includes('plank')) {
    return athleteWeightKg * 0.5;
  }

  return declaredLoad || 0;
}

/**
 * Computes estimated calorie expenditure for a strength training session.
 */
export function calculateStrengthCalories(
  input: StrengthSessionCalorieInput
): StrengthCalorieResult {
  const weight = Math.max(30, input.athleteWeightKg || 75);
  const durationMin = Math.max(10, input.durationMinutes || 60);
  const sessionRpe = Math.min(10, Math.max(1, input.sessionRpe || 7.5));

  // Allometric scale factor based on metabolic body size: (weight / 75)^0.75
  const allometricScale = Math.pow(weight / 75.0, 0.75);

  let totalVolumeLoadKg = 0;
  let totalSets = 0;
  let totalReps = 0;
  let mechanicalWorkCaloriesRaw = 0;

  const perExercise: ExerciseCalorieBreakdown[] = [];

  for (const ex of input.exercises) {
    const { category, multiplier: exerciseMultiplier } = getExerciseCategoryAndMultiplier(
      ex.exerciseName,
      ex.movementPattern
    );

    let exerciseVolumeLoad = 0;
    let exerciseReps = 0;
    let exerciseSets = 0;
    let exerciseCaloriesRaw = 0;

    for (const set of ex.sets) {
      const reps = Math.max(1, set.reps || 0);
      const effectiveLoad = resolveEffectiveSetLoad(ex.exerciseName, set.loadKg, weight);
      const rpe = Math.min(10, Math.max(5, set.rpe ?? sessionRpe));

      const volumeLoad = reps * effectiveLoad;
      exerciseVolumeLoad += volumeLoad;
      exerciseReps += reps;
      exerciseSets += 1;

      // Base energetic cost of the set: reps movement baseline + volume-load mechanical work
      // Lytle, Crouse et al. (2019 MSSE) established ~2.46 net kcal per 1,000 kg volume-load
      const baseCal = reps * 0.35 + volumeLoad * 0.018;

      // RPE multiplier: 0.70 + (RPE * 0.05) -> RPE 6 = 1.00, RPE 8 = 1.10, RPE 10 = 1.20
      const rpeMultiplier = 0.7 + rpe * 0.05;

      const setCalories = baseCal * exerciseMultiplier * rpeMultiplier * allometricScale;
      exerciseCaloriesRaw += setCalories;
    }

    totalVolumeLoadKg += exerciseVolumeLoad;
    totalReps += exerciseReps;
    totalSets += exerciseSets;
    mechanicalWorkCaloriesRaw += exerciseCaloriesRaw;

    perExercise.push({
      exerciseName: ex.exerciseName,
      movementCategory: category,
      exerciseMultiplier,
      totalVolumeLoadKg: Math.round(exerciseVolumeLoad),
      setCount: exerciseSets,
      totalReps: exerciseReps,
      caloriesBurned: Math.round(exerciseCaloriesRaw),
    });
  }

  // Layer 2: Inter-set recovery oxygen uptake & basal active expenditure
  // Abboud et al. (2013) & Scott (2011) demonstrate that aerobic metabolism between sets
  // accounts for continuous calorie burn at ~1.5 kcal/kg/hour above rest
  const interSetCaloriesRaw = weight * (durationMin / 60.0) * 1.5;

  // Layer 3: EPOC (Excess Post-Exercise Oxygen Consumption / Afterburn)
  // Higher session intensity (RPE >= 7.5) triggers elevated glycolytic clearance and sympathetic recovery
  const epocFactor = sessionRpe >= 7.5 ? 0.12 : 0.08;

  const subtotalCalories = mechanicalWorkCaloriesRaw + interSetCaloriesRaw;
  const epocCaloriesRaw = subtotalCalories * epocFactor;
  const grossTotalCalories = Math.round(subtotalCalories + epocCaloriesRaw);

  return {
    totalCalories: grossTotalCalories,
    mechanicalWorkCalories: Math.round(mechanicalWorkCaloriesRaw),
    interSetCalories: Math.round(interSetCaloriesRaw),
    epocCalories: Math.round(epocCaloriesRaw),
    totalVolumeLoadKg: Math.round(totalVolumeLoadKg),
    totalSets,
    totalReps,
    epocFactor,
    perExercise,
  };
}
