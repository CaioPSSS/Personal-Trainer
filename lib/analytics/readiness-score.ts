export interface ReadinessScoreBreakdown {
  sleepScore: number;
  recoveryWellnessScore: number;
  acuteLoadPenalty: number;
  nutritionBonusOrPenalty: number;
}

export interface DailyReadinessResult {
  score: number;
  status: 'green' | 'yellow' | 'red';
  label: string;
  recommendation: string;
  hasWellnessToday: boolean;
  acuteSessionsLast3Days: number;
  breakdown: ReadinessScoreBreakdown;
}

export interface WeeklyReviewSummary {
  currentWeekLabel: string;
  previousWeekLabel: string;
  adherencePercent: { current: number; previous: number; delta: number };
  strengthTonnageKg: { current: number; previous: number; deltaPercent: number | null };
  strengthSets: { current: number; previous: number };
  runningKm: { current: number; previous: number; deltaKm: number };
  crossTrainingSessions: { current: number; previous: number };
  caloriesBurnedTotal: { current: number; previous: number };
  avgSleepHours: number | null;
  automatedFocusPoints: string[];
}

export function computeDailyReadinessScore(params: {
  latestWellness?: {
    date: string;
    sleepHours?: number | null;
    fatigueLevel?: number | null;
    sorenessLevel?: number | null;
    energyLevel?: number | null;
    stressLevel?: number | null;
    caloriesConsumed?: number | null;
    calorieTarget?: number | null;
  } | null;
  todayStr: string;
  recentStrengthCount3d: number;
  recentRunningCount3d: number;
  recentCrossCount3d: number;
  recentHighIntensityCount3d: number;
}): DailyReadinessResult {
  const {
    latestWellness,
    todayStr,
    recentStrengthCount3d,
    recentRunningCount3d,
    recentCrossCount3d,
    recentHighIntensityCount3d,
  } = params;

  const hasWellnessToday = latestWellness?.date === todayStr;

  // 1. Sleep Score (0..35 pts, baseline 7.5h = 32 pts, >= 8h = 35 pts)
  const sleepHours = latestWellness?.sleepHours ?? 7.2;
  const sleepScore = Math.max(
    8,
    Math.min(35, Math.round((sleepHours / 8.0) * 35))
  );

  // 2. Subjective Wellness Score (0..45 pts)
  // Fatigue (1=low..5=high), Soreness (1..5), Stress (1..5), Energy (1=low..5=high)
  const fatigue = latestWellness?.fatigueLevel ?? 2.5;
  const soreness = latestWellness?.sorenessLevel ?? 2.5;
  const stress = latestWellness?.stressLevel ?? 2.5;
  const energy = latestWellness?.energyLevel ?? 3.5;

  const invFatigue = 6 - Math.min(5, Math.max(1, fatigue)); // 1..5
  const invSoreness = 6 - Math.min(5, Math.max(1, soreness)); // 1..5
  const invStress = 6 - Math.min(5, Math.max(1, stress)); // 1..5
  const clampedEnergy = Math.min(5, Math.max(1, energy)); // 1..5

  const rawWellnessSum = invFatigue * 3 + invSoreness * 2.5 + clampedEnergy * 2.5 + invStress * 1; // max 45
  const recoveryWellnessScore = Math.round(Math.max(10, Math.min(45, rawWellnessSum)));

  // 3. Base 20 pts minus Acute 3-Day Multi-Sport Load Penalty
  const totalSessions3d = recentStrengthCount3d + recentRunningCount3d + recentCrossCount3d;
  const rawLoadPenalty = Math.max(0, (totalSessions3d - 2) * 4 + recentHighIntensityCount3d * 3);
  const acuteLoadPenalty = Math.min(22, rawLoadPenalty);

  // 4. Nutrition / Metabolic Availability adjustment (-6 to +5 pts)
  let nutritionBonusOrPenalty = 0;
  if (
    latestWellness?.caloriesConsumed &&
    latestWellness?.calorieTarget &&
    latestWellness.calorieTarget > 0
  ) {
    const ratio = latestWellness.caloriesConsumed / latestWellness.calorieTarget;
    if (ratio >= 0.88 && ratio <= 1.15) {
      nutritionBonusOrPenalty = 4;
    } else if (ratio < 0.7) {
      nutritionBonusOrPenalty = -6;
    }
  }

  const rawTotal = 20 + sleepScore + recoveryWellnessScore - acuteLoadPenalty + nutritionBonusOrPenalty;
  const score = Math.max(15, Math.min(100, Math.round(rawTotal)));

  let status: DailyReadinessResult['status'] = 'green';
  let label = 'Prontidão Alta — Sinal Verde para Sobrecarga';
  let recommendation =
    'Sistema nervoso e recuperação muscular alinhados. Excelente dia para buscar progressão de carga ou repetições dentro do RPE alvo.';

  if (score < 55) {
    status = 'red';
    label = 'Prontidão Baixa — Priorizar Auto-Regulação';
    recommendation =
      'Fadiga aguda ou déficit de sono detectado. Considere manter as cargas atuais, deixar +1 repetição na reserva (RPE -1) ou priorizar máquinas guiadas.';
  } else if (score < 76) {
    status = 'yellow';
    label = 'Prontidão Moderada — Treino Consistente';
    recommendation =
      'Boa condição para cumprir a planilha prescrita. Evite falhas concêntricas precoces nas primeiras séries dos exercícios compostos.';
  }

  return {
    score,
    status,
    label,
    recommendation,
    hasWellnessToday,
    acuteSessionsLast3Days: totalSessions3d,
    breakdown: {
      sleepScore,
      recoveryWellnessScore,
      acuteLoadPenalty,
      nutritionBonusOrPenalty,
    },
  };
}

export function computeWeeklyReview(params: {
  currentWeekLabel: string;
  previousWeekLabel: string;
  currentAdherencePercent: number;
  previousAdherencePercent: number;
  currentTonnageKg: number;
  previousTonnageKg: number;
  currentSets: number;
  previousSets: number;
  currentRunningKm: number;
  previousRunningKm: number;
  currentCrossSessions: number;
  previousCrossSessions: number;
  currentCaloriesBurned: number;
  previousCaloriesBurned: number;
  avgSleepHours: number | null;
  underMevMuscles: string[];
}): WeeklyReviewSummary {
  const {
    currentWeekLabel,
    previousWeekLabel,
    currentAdherencePercent,
    previousAdherencePercent,
    currentTonnageKg,
    previousTonnageKg,
    currentSets,
    previousSets,
    currentRunningKm,
    previousRunningKm,
    currentCrossSessions,
    previousCrossSessions,
    currentCaloriesBurned,
    previousCaloriesBurned,
    avgSleepHours,
    underMevMuscles,
  } = params;

  const tonnageDeltaPercent =
    previousTonnageKg > 0
      ? Math.round(((currentTonnageKg - previousTonnageKg) / previousTonnageKg) * 1000) / 10
      : null;

  const focusPoints: string[] = [];

  if (tonnageDeltaPercent !== null && tonnageDeltaPercent > 0) {
    focusPoints.push(
      `Sobrecarga progressiva positiva (+${tonnageDeltaPercent}% de tonelagem vs. semana passada). Mantenha a execução limpa antes de subir cargas.`
    );
  } else if (currentSets > 0) {
    focusPoints.push(
      'Foque em ganhar +1 repetição dentro da faixa alvo nos compostos principais antes do próximo incremento de carga.'
    );
  } else {
    focusPoints.push(
      'Inicie a semana garantindo o primeiro treino de força logo nos primeiros dias disponíveis do calendário.'
    );
  }

  if (underMevMuscles.length > 0) {
    focusPoints.push(
      `Atenção ao volume mínimo (MEV) para: ${underMevMuscles.slice(0, 3).join(', ')}. Evite pular os exercícios acessórios desses grupamentos.`
    );
  }

  if (avgSleepHours !== null && avgSleepHours < 6.8) {
    focusPoints.push(
      `Sua média de sono foi de ${avgSleepHours.toFixed(1)}h. Buscar ≥ 7.5h elevará diretamente sua síntese proteica e recuperação entre Corrida/CrossFit e Musculação.`
    );
  } else {
    focusPoints.push(
      'Mantenha pelo menos 24–48h de distância entre sessões intensas de membros inferiores (Leg Day) e treinos longos ou tiros de corrida.'
    );
  }

  return {
    currentWeekLabel,
    previousWeekLabel,
    adherencePercent: {
      current: currentAdherencePercent,
      previous: previousAdherencePercent,
      delta: currentAdherencePercent - previousAdherencePercent,
    },
    strengthTonnageKg: {
      current: Math.round(currentTonnageKg),
      previous: Math.round(previousTonnageKg),
      deltaPercent: tonnageDeltaPercent,
    },
    strengthSets: {
      current: currentSets,
      previous: previousSets,
    },
    runningKm: {
      current: Math.round(currentRunningKm * 10) / 10,
      previous: Math.round(previousRunningKm * 10) / 10,
      deltaKm: Math.round((currentRunningKm - previousRunningKm) * 10) / 10,
    },
    crossTrainingSessions: {
      current: currentCrossSessions,
      previous: previousCrossSessions,
    },
    caloriesBurnedTotal: {
      current: Math.round(currentCaloriesBurned),
      previous: Math.round(previousCaloriesBurned),
    },
    avgSleepHours: avgSleepHours !== null ? Math.round(avgSleepHours * 10) / 10 : null,
    automatedFocusPoints: focusPoints.slice(0, 3),
  };
}
