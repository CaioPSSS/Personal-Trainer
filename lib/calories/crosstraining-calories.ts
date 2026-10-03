/**
 * Scientific Calorie Estimation Engine for Cross-Training & Mixed-Modal Conditioning
 *
 * Implements Compendium of Physical Activities MET benchmarks adapted with session RPE
 * intensity scaling and anaerobic glycolytic EPOC factors.
 */

export interface CrossTrainingCalorieInput {
  athleteWeightKg: number;
  durationMinutes: number;
  activityType: string; // "crossfit" | "swimming" | "cycling" | "yoga" | "martial_arts" | "other"
  sessionRpe?: number | null; // 1-10
}

export interface CrossTrainingCalorieResult {
  totalCalories: number;
  effectiveMet: number;
  baseMet: number;
  epocFactor: number;
  caloriesPerMinute: number;
}

export function getBaseMetForActivity(
  activityType: string,
  sessionRpe: number = 7.5
): { baseMet: number; defaultEpoc: number } {
  const type = (activityType || '').toLowerCase().trim();

  switch (type) {
    case 'crossfit': {
      // Scale baseline MET by intensity profile
      if (sessionRpe >= 9.0) {
        return { baseMet: 11.0, defaultEpoc: 0.12 }; // All-out Fran / Sprint metcon
      }
      if (sessionRpe >= 7.5) {
        return { baseMet: 9.5, defaultEpoc: 0.1 }; // Cindy / AMRAP threshold
      }
      return { baseMet: 8.0, defaultEpoc: 0.08 }; // EMOM / Strength metcon
    }
    case 'swimming':
      return { baseMet: 8.0, defaultEpoc: 0.05 };
    case 'cycling':
      return { baseMet: 7.5, defaultEpoc: 0.05 };
    case 'yoga':
      return { baseMet: 3.0, defaultEpoc: 0.0 };
    case 'martial_arts':
      return { baseMet: 8.5, defaultEpoc: 0.08 };
    default:
      return { baseMet: 6.0, defaultEpoc: 0.05 };
  }
}

export function calculateCrossTrainingCalories(
  input: CrossTrainingCalorieInput
): CrossTrainingCalorieResult {
  const weight = Math.max(30, input.athleteWeightKg || 75);
  const durationMin = Math.max(1, input.durationMinutes || 45);
  const sessionRpe = Math.min(10, Math.max(1, input.sessionRpe || 7.5));

  const { baseMet, defaultEpoc } = getBaseMetForActivity(input.activityType, sessionRpe);

  // Intensity modifier: RPE 7.5 = 1.10x, RPE 10 = 1.20x, RPE 5 = 1.00x
  const rpeMultiplier = 0.8 + sessionRpe * 0.04;
  const effectiveMet = Number((baseMet * rpeMultiplier).toFixed(2));

  // Compendium formula: kcal/min = (MET * 3.5 * weightKg) / 200
  const kcalPerMinute = (effectiveMet * 3.5 * weight) / 200.0;
  const rawExerciseCalories = kcalPerMinute * durationMin;

  const totalCalories = Math.round(rawExerciseCalories * (1 + defaultEpoc));

  return {
    totalCalories,
    effectiveMet,
    baseMet,
    epocFactor: defaultEpoc,
    caloriesPerMinute: Number((totalCalories / durationMin).toFixed(1)),
  };
}
