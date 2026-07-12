import { DailyLog, UserSettings } from '@prisma/client';

type SetupData = {
  age: number;
  height: number;
  weight: number;
  gender: string;
  activityLevel: number;
  goal: string;
  weeklyRate: number;
};

// 1. Cálculo Inicial Baseado em Fórmulas Clínicas
export function calculateInitialTarget(data: SetupData): number {
  const bmr = 10 * data.weight + 6.25 * data.height - 5 * data.age + (data.gender === 'M' ? 5 : -161);
  const tdee = bmr * data.activityLevel;
  const dailyDeficitOrSurplus = (data.weeklyRate * 7700) / 7;
  return Math.round(tdee + dailyDeficitOrSurplus);
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function parseIsoDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

export function calculateWeightTrend(logs: DailyLog[]): number {
  const entries = logs
    .filter((log) => log.weight !== null)
    .map((log) => ({
      x: parseIsoDate(log.date).getTime() / 86400000,
      y: log.weight as number,
    }));

  if (entries.length < 2) {
    return 0;
  }

  const xMean = average(entries.map((entry) => entry.x));
  const yMean = average(entries.map((entry) => entry.y));

  const numerator = entries.reduce((sum, entry) => sum + (entry.x - xMean) * (entry.y - yMean), 0);
  const denominator = entries.reduce((sum, entry) => sum + Math.pow(entry.x - xMean, 2), 0);

  if (denominator === 0) {
    return 0;
  }

  return numerator / denominator;
}

function medianMood(logs: DailyLog[]) {
  const moodMap: Record<string, number> = {};
  logs.forEach((log) => {
    if (log.mood) moodMap[log.mood] = (moodMap[log.mood] || 0) + 1;
  });
  const sorted = Object.entries(moodMap).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] || 'Regular';
}

export function recalculateAdaptiveTarget(logs: DailyLog[], settings: UserSettings[]): number {
  if (logs.length < 14 || settings.length === 0) {
    return settings[0]?.currentCalorieTarget || 2000;
  }

  const config = settings[0];
  const sortedLogs = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  const last14Days = sortedLogs.slice(-14);
  const recentWeightWindow = sortedLogs.slice(-21);

  const calories = last14Days.map((l) => l.caloriesConsumed).filter((c): c is number => c !== null);
  const validWeightEntries = recentWeightWindow.filter((l) => l.weight !== null);

  if (validWeightEntries.length < 4 || calories.length < 10) {
    return config.currentCalorieTarget;
  }

  const weightTrendKgPerDay = calculateWeightTrend(recentWeightWindow);
  const avgCaloriesIn = average(calories);
  const realDailyEnergyDelta = weightTrendKgPerDay * 7700;
  const empiricalTDEE = avgCaloriesIn - realDailyEnergyDelta;

  const targetedChangeDelta = (config.weeklyRate * 7700) / 7;
  const rawTarget = empiricalTDEE + targetedChangeDelta;

  const smoothedTarget = Math.round(config.currentCalorieTarget * 0.45 + rawTarget * 0.55);
  const maxShift = 150;
  const adjustedTarget = clamp(smoothedTarget, config.currentCalorieTarget - maxShift, config.currentCalorieTarget + maxShift);

  if (Math.abs(weightTrendKgPerDay * 7) < 0.15 && Math.abs(avgCaloriesIn - config.currentCalorieTarget) < 100) {
    return config.currentCalorieTarget;
  }

  return clamp(adjustedTarget, 1200, 5000);
}

export function generateInsights(logs: DailyLog[], settings: UserSettings[]): string[] {
  if (!logs.length || settings.length === 0) {
    return ['Cadastre seus primeiros registros para receber recomendações automáticas.'];
  }

  const currentTarget = settings[0].currentCalorieTarget;
  const recent = [...logs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);

  const weekCalories = recent.map((l) => l.caloriesConsumed).filter((c): c is number => c !== null);
  const weekSleep = recent.map((l) => l.sleepHours).filter((s): s is number => s !== null);
  const weekWater = recent.map((l) => l.waterIntake).filter((w): w is number => w !== null);
  const weekStress = recent.map((l) => l.stressLevel).filter((s): s is number => s !== null);
  const weekProtein = recent.map((l) => l.proteinConsumed).filter((p): p is number => p !== null);
  const weekWeights = recent.map((l) => l.weight).filter((w): w is number => w !== null);

  const insights: string[] = [];

  if (weekCalories.length >= 4) {
    const avgCalories = average(weekCalories);
    if (avgCalories > currentTarget + 150) {
      insights.push('A média de ingestão está acima da meta. Ajuste refeições para reduzir o excesso calórico.');
    } else if (avgCalories < currentTarget - 150) {
      insights.push('A ingestão média está abaixo da meta. Atenção para não reduzir demais se houver desconforto.');
    } else {
      insights.push('A ingestão calórica média está alinhada com a meta atual.');
    }
  }

  if (weekProtein.length >= 3 && weekWeights.length >= 2) {
    const avgProtein = average(weekProtein);
    const avgWeight = average(weekWeights);
    const proteinPerKg = avgProtein / avgWeight;
    if (proteinPerKg < 1.6) {
      insights.push('Sua ingestão de proteína está abaixo de 1.6g/kg. Risco maior de perda de massa magra em dietas com treino intenso.');
    } else {
      insights.push('A ingestão proteica está adequada para preservar massa magra.');
    }
  }

  if (weekSleep.length >= 3) {
    const avgSleep = average(weekSleep);
    if (avgSleep < 7) {
      insights.push('O sono está abaixo de 7 horas na última semana. Sono ruim pode afetar o metabolismo.');
    } else {
      insights.push('O sono está satisfatório. Boa recuperação ajuda na adaptação metabólica.');
    }
  }

  if (weekWater.length >= 3) {
    const avgWater = average(weekWater);
    if (avgWater < 2000) {
      insights.push('A hidratação média está baixa. Beba mais água para apoiar o metabolismo e a recuperação.');
    } else {
      insights.push('A hidratação está boa. Continuar assim ajuda nos processos metabólicos.');
    }
  }

  if (weekStress.length >= 3) {
    const avgStress = average(weekStress);
    if (avgStress >= 4) {
      insights.push('O estresse está alto. Considere estratégias de relaxamento para melhorar o controle metabólico.');
    } else {
      insights.push('O nível de estresse está sob controle. Isso favorece a qualidade do progresso.');
    }
  }

  const mood = medianMood(recent);
  insights.push(`Humor predominante da semana: ${mood}.`);

  return insights;
}
                                                                                                                