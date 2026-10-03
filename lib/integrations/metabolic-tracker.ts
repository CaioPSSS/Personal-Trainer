import { prisma } from '@/lib/prisma';

export interface ActivitySyncPayload {
  date: string; // ISO "YYYY-MM-DD"
  caloriesBurned?: number;
  trainingType?: 'Musculação' | 'Corrida' | 'Híbrido' | 'Cross-Training' | 'Descanso' | string;
  workoutTitle?: string;
  durationMinutes?: number;
  sessionRpe?: number;
  sleepHours?: number | null;
  bodyWeightKg?: number | null;
  stressLevel?: number | null;
}

export interface DailyNutritionData {
  date: string;
  caloriesConsumed: number | null;
  proteinConsumed: number | null;
  currentCalorieTarget: number | null;
  dietGoal: 'loss' | 'maintenance' | 'gain' | string | null;
  weight: number | null;
  sleepHours?: number | null;
  stressLevel?: number | null;
  trainingType?: string | null;
  caloriesBurned?: number | null;
}

export interface SyncResult {
  success: boolean;
  offline?: boolean;
  error?: string;
  nutrition?: DailyNutritionData | null;
}

export const DEFAULT_METABOLIC_URL = 'https://meu-rastreador-metabolico-p7xl.vercel.app';

export async function getSyncConfig() {
  let url = process.env.METABOLIC_TRACKER_URL?.replace(/\/$/, '');

  // Se a env var foi configurada com o próprio domínio do Personal Trainer, descarta para evitar loop/404
  if (url && (url.includes('personal-trainer') || url.includes('localhost:3000'))) {
    url = undefined;
  }

  if (!url) {
    try {
      const profile = await prisma.athleteProfile.findUnique({
        where: { id: 'singleton' },
        select: { metabolicTrackerUrl: true },
      });
      if (profile?.metabolicTrackerUrl && !profile.metabolicTrackerUrl.includes('personal-trainer')) {
        url = profile.metabolicTrackerUrl.replace(/\/$/, '');
      }
    } catch {
      // ignore
    }
  }
  url = url || DEFAULT_METABOLIC_URL;
  const secret = process.env.ECOSYSTEM_SYNC_SECRET || 'dev_sync_secret_metabolic';
  return { url, secret };
}

/**
 * Envia as atividades físicas e calorias gastas para o Meu Rastreador Metabólico.
 * Execução não-bloqueante e segura (timeout de 4s, nunca propaga exceção para a UI).
 */
export async function syncActivityToMetabolicTracker(
  payload: ActivitySyncPayload
): Promise<SyncResult> {
  const { url, secret } = await getSyncConfig();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(`${url}/api/integrations/trainer/activity`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
        'x-source-app': 'Personal-Trainer',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (!response.ok) {
      console.warn(
        `[MetabolicSync] Falha no endpoint do Rastreador Metabólico (${response.status}): ${response.statusText}`
      );
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();

    // Se o Rastreador devolveu dados de nutrição e recuperação do dia, atualiza o cache local
    if (data.nutrition) {
      const n: DailyNutritionData = data.nutrition;
      try {
        await prisma.wellnessDaily.upsert({
          where: { date: payload.date },
          update: {
            caloriesConsumed: n.caloriesConsumed,
            proteinConsumed: n.proteinConsumed,
            calorieTarget: n.currentCalorieTarget,
            dietGoal: n.dietGoal,
            bodyWeightKg: n.weight ?? undefined,
            sleepHours: n.sleepHours ?? undefined,
            stressLevel: n.stressLevel ?? undefined,
          },
          create: {
            date: payload.date,
            athleteProfileId: 'singleton',
            caloriesConsumed: n.caloriesConsumed,
            proteinConsumed: n.proteinConsumed,
            calorieTarget: n.currentCalorieTarget,
            dietGoal: n.dietGoal,
            bodyWeightKg: n.weight,
            sleepHours: n.sleepHours,
            stressLevel: n.stressLevel,
          },
        });
      } catch (cacheErr) {
        console.warn('[MetabolicSync] Falha ao atualizar cache local de nutrição/wellness:', cacheErr);
      }
    }

    return {
      success: true,
      nutrition: data.nutrition || null,
    };
  } catch (err: unknown) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    console.warn(
      `[MetabolicSync] Rastreador Metabólico inacessível (${isAbort ? 'Timeout' : 'Offline'}):`,
      err instanceof Error ? err.message : err
    );
    return { success: false, offline: true };
  }
}

/**
 * Consulta os dados de nutrição e recuperação de um dia específico no Rastreador Metabólico.
 */
export async function fetchDailyNutrition(
  date: string
): Promise<DailyNutritionData | null> {
  const { url, secret } = await getSyncConfig();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(`${url}/api/integrations/trainer/nutrition?date=${date}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${secret}`,
        'x-source-app': 'Personal-Trainer',
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (data.nutrition) {
      const n: DailyNutritionData = data.nutrition;
      // Atualiza cache local com nutrição e métricas de recuperação
      await prisma.wellnessDaily.upsert({
        where: { date },
        update: {
          caloriesConsumed: n.caloriesConsumed,
          proteinConsumed: n.proteinConsumed,
          calorieTarget: n.currentCalorieTarget,
          dietGoal: n.dietGoal,
          bodyWeightKg: n.weight ?? undefined,
          sleepHours: n.sleepHours ?? undefined,
          stressLevel: n.stressLevel ?? undefined,
        },
        create: {
          date,
          athleteProfileId: 'singleton',
          caloriesConsumed: n.caloriesConsumed,
          proteinConsumed: n.proteinConsumed,
          calorieTarget: n.currentCalorieTarget,
          dietGoal: n.dietGoal,
          bodyWeightKg: n.weight,
          sleepHours: n.sleepHours,
          stressLevel: n.stressLevel,
        },
      });
      return n;
    }
    return null;
  } catch {
    // Retorna do cache se o Rastreador estiver offline
    const cached = await prisma.wellnessDaily.findUnique({
      where: { date },
    });
    if (cached) {
      return {
        date,
        caloriesConsumed: cached.caloriesConsumed,
        proteinConsumed: cached.proteinConsumed,
        currentCalorieTarget: cached.calorieTarget,
        dietGoal: cached.dietGoal,
        weight: cached.bodyWeightKg,
        sleepHours: cached.sleepHours,
        stressLevel: cached.stressLevel,
      };
    }
    return null;
  }
}

/**
 * Reconcilia um período (ex: últimos 14 dias), enviando treinos pendentes
 * e importando dados de nutrição correspondentes.
 */
export async function reconcileEcosystemRange(
  startDate: string,
  endDate: string
): Promise<{
  syncedDaysCount: number;
  nutritionDaysImported: number;
  errors: string[];
}> {
  const { url, secret } = await getSyncConfig();
  const errors: string[] = [];
  let nutritionDaysImported = 0;
  let syncedDaysCount = 0;

  // 1. Busca eventos e treinos do período no Personal-Trainer
  const events = await prisma.calendarEvent.findMany({
    where: {
      athleteProfileId: 'singleton',
      date: { gte: startDate, lte: endDate },
      status: 'completed',
    },
  });

  const wellnessList = await prisma.wellnessDaily.findMany({
    where: {
      athleteProfileId: 'singleton',
      date: { gte: startDate, lte: endDate },
    },
  });

  const wellnessMap = new Map(wellnessList.map((w) => [w.date, w]));

  // Agrupa calorias gastas e tipo de treino por data
  const dateMap = new Map<string, { calories: number; types: Set<string>; title: string }>();

  for (const ev of events) {
    const existing = dateMap.get(ev.date) || {
      calories: 0,
      types: new Set<string>(),
      title: ev.title,
    };
    existing.calories += ev.caloriesBurned || 0;
    if (ev.eventType === 'strength') existing.types.add('Musculação');
    else if (ev.eventType === 'running') existing.types.add('Corrida');
    else if (ev.eventType === 'crosstraining') existing.types.add('Cross-Training');
    dateMap.set(ev.date, existing);
  }

  // 2. Envia os dias com atividade para o Rastreador
  for (const [date, info] of dateMap.entries()) {
    let tType: ActivitySyncPayload['trainingType'] = 'Musculação';
    if (info.types.has('Musculação') && info.types.has('Corrida')) {
      tType = 'Híbrido';
    } else if (info.types.has('Corrida')) {
      tType = 'Corrida';
    } else if (info.types.has('Cross-Training')) {
      tType = 'Cross-Training';
    }

    const w = wellnessMap.get(date);
    const result = await syncActivityToMetabolicTracker({
      date,
      caloriesBurned: info.calories,
      trainingType: tType,
      workoutTitle: info.title,
      sleepHours: w?.sleepHours,
      bodyWeightKg: w?.bodyWeightKg,
      stressLevel: w?.stressLevel,
    });

    if (result.success) {
      syncedDaysCount++;
    } else if (result.error) {
      errors.push(`${date}: ${result.error}`);
    }
  }

  // 3. Pede ao Rastreador o bloco de nutrição do intervalo
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(
      `${url}/api/integrations/trainer/nutrition?startDate=${startDate}&endDate=${endDate}`,
      {
        headers: {
          Authorization: `Bearer ${secret}`,
          'x-source-app': 'Personal-Trainer',
        },
        signal: controller.signal,
      }
    ).finally(() => clearTimeout(timeoutId));

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.items)) {
        for (const item of data.items as DailyNutritionData[]) {
          await prisma.wellnessDaily.upsert({
            where: { date: item.date },
            update: {
              caloriesConsumed: item.caloriesConsumed,
              proteinConsumed: item.proteinConsumed,
              calorieTarget: item.currentCalorieTarget,
              dietGoal: item.dietGoal,
              bodyWeightKg: item.weight ?? undefined,
              sleepHours: item.sleepHours ?? undefined,
              stressLevel: item.stressLevel ?? undefined,
            },
            create: {
              date: item.date,
              athleteProfileId: 'singleton',
              caloriesConsumed: item.caloriesConsumed,
              proteinConsumed: item.proteinConsumed,
              calorieTarget: item.currentCalorieTarget,
              dietGoal: item.dietGoal,
              bodyWeightKg: item.weight,
              sleepHours: item.sleepHours,
              stressLevel: item.stressLevel,
            },
          });
          nutritionDaysImported++;
        }
      }
    }
  } catch (err) {
    errors.push(`Falha ao importar nutrição: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    syncedDaysCount,
    nutritionDaysImported,
    errors,
  };
}
