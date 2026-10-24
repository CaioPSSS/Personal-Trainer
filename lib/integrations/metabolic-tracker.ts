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

// ============================================
// DAILY AGGREGATE SYNC
// ============================================
//
// O endpoint /api/integrations/trainer/activity do Rastreador faz UPSERT por data e
// SOBRESCREVE `caloriesBurned` e `trainingType`. Portanto, nunca devemos enviar o gasto de
// uma única sessão: cada sync precisa carregar o TOTAL consolidado do dia (musculação +
// corrida + cross-training), senão a última atividade salva apaga as anteriores.

export type DailyActivityKind = 'strength' | 'running' | 'cross';

export interface DailyActivityAggregate {
  date: string;
  caloriesBurned: number;
  trainingType: ActivitySyncPayload['trainingType'];
  workoutTitle: string;
  durationMinutes?: number;
  sessionRpe?: number;
  activityCount: number;
}

/**
 * Pure helper: derives the tracker training type label from the set of activity kinds of the day.
 */
export function deriveDailyTrainingType(kinds: Iterable<DailyActivityKind>): string {
  const set = new Set(kinds);
  if (set.size === 0) return 'Descanso';
  if (set.size > 1) return 'Híbrido';
  const [only] = Array.from(set);
  if (only === 'strength') return 'Musculação';
  if (only === 'running') return 'Corrida';
  return 'Cross-Training';
}

/**
 * Builds the consolidated activity summary for a single day from the source-of-truth tables
 * (WorkoutExecution, RunningExecution, CrossTrainingActivity). Returns null if no activity.
 */
export async function buildDailyActivityAggregate(
  date: string
): Promise<DailyActivityAggregate | null> {
  const [workouts, runs, crossActivities] = await Promise.all([
    prisma.workoutExecution.findMany({
      where: { athleteProfileId: 'singleton', date, status: 'completed' },
      select: { caloriesBurned: true, durationMinutes: true, sessionRpe: true },
    }),
    prisma.runningExecution.findMany({
      where: { runningProfileId: 'singleton', date },
      select: {
        caloriesBurned: true,
        durationSeconds: true,
        sessionRpe: true,
        distanceKm: true,
      },
    }),
    prisma.crossTrainingActivity.findMany({
      where: { athleteProfileId: 'singleton', date, status: 'completed' },
      select: { caloriesBurned: true, durationMinutes: true, sessionRpe: true, title: true },
    }),
  ]);

  const activityCount = workouts.length + runs.length + crossActivities.length;
  if (activityCount === 0) return null;

  const kinds: DailyActivityKind[] = [];
  const titles: string[] = [];
  let calories = 0;
  let duration = 0;
  let rpeWeighted = 0;
  let rpeWeight = 0;

  for (const w of workouts) {
    kinds.push('strength');
    titles.push('Musculação');
    calories += w.caloriesBurned ?? 0;
    duration += w.durationMinutes ?? 0;
    if (w.sessionRpe != null && w.durationMinutes) {
      rpeWeighted += w.sessionRpe * w.durationMinutes;
      rpeWeight += w.durationMinutes;
    }
  }

  for (const r of runs) {
    kinds.push('running');
    titles.push(`Corrida ${r.distanceKm.toFixed(1)} km`);
    calories += r.caloriesBurned ?? 0;
    const min = Math.round(r.durationSeconds / 60);
    duration += min;
    if (r.sessionRpe != null && min > 0) {
      rpeWeighted += r.sessionRpe * min;
      rpeWeight += min;
    }
  }

  for (const c of crossActivities) {
    kinds.push('cross');
    titles.push(c.title || 'Cross-Training');
    calories += c.caloriesBurned ?? 0;
    duration += c.durationMinutes ?? 0;
    if (c.sessionRpe != null && c.durationMinutes) {
      rpeWeighted += c.sessionRpe * c.durationMinutes;
      rpeWeight += c.durationMinutes;
    }
  }

  return {
    date,
    caloriesBurned: Math.round(calories),
    trainingType: deriveDailyTrainingType(kinds),
    workoutTitle: titles.join(' + '),
    durationMinutes: duration > 0 ? duration : undefined,
    sessionRpe: rpeWeight > 0 ? Number((rpeWeighted / rpeWeight).toFixed(1)) : undefined,
    activityCount,
  };
}

export interface DaySyncExtras {
  sleepHours?: number | null;
  bodyWeightKg?: number | null;
  stressLevel?: number | null;
  /**
   * When true and the day has no activity left (e.g. a duplicated run was removed),
   * sends caloriesBurned=0 / 'Descanso' to clear stale values in the tracker.
   */
  clearIfEmpty?: boolean;
}

/**
 * Sends the consolidated (summed) activity of a day to the Metabolic Tracker.
 * Safe to call after any activity is created/updated/deleted. Never throws.
 */
export async function syncDayToMetabolicTracker(
  date: string,
  extras: DaySyncExtras = {}
): Promise<SyncResult> {
  try {
    const aggregate = await buildDailyActivityAggregate(date);
    const recovery = {
      ...(extras.sleepHours != null ? { sleepHours: extras.sleepHours } : {}),
      ...(extras.bodyWeightKg != null ? { bodyWeightKg: extras.bodyWeightKg } : {}),
      ...(extras.stressLevel != null ? { stressLevel: extras.stressLevel } : {}),
    };

    if (!aggregate) {
      if (extras.clearIfEmpty) {
        return await syncActivityToMetabolicTracker({
          date,
          caloriesBurned: 0,
          trainingType: 'Descanso',
          ...recovery,
        });
      }
      if (Object.keys(recovery).length > 0) {
        return await syncActivityToMetabolicTracker({ date, ...recovery });
      }
      return { success: true };
    }

    return await syncActivityToMetabolicTracker({
      date,
      caloriesBurned: aggregate.caloriesBurned,
      trainingType: aggregate.trainingType,
      workoutTitle: aggregate.workoutTitle,
      durationMinutes: aggregate.durationMinutes,
      sessionRpe: aggregate.sessionRpe,
      ...recovery,
    });
  } catch (err) {
    console.warn(`[MetabolicSync] Falha ao consolidar/sincronizar o dia ${date}:`, err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Sequentially syncs several days (deduplicated) to the Metabolic Tracker.
 */
export async function syncDaysToMetabolicTracker(
  dates: Iterable<string>,
  extras: Omit<DaySyncExtras, 'sleepHours' | 'bodyWeightKg' | 'stressLevel'> = {}
): Promise<number> {
  let ok = 0;
  for (const date of Array.from(new Set(dates)).sort()) {
    const res = await syncDayToMetabolicTracker(date, extras);
    if (res.success) ok++;
  }
  return ok;
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

  // 1. Descobre todos os dias com atividade no período (fontes de verdade, não o cache do calendário)
  const [workoutDays, runDays, crossDays, wellnessList] = await Promise.all([
    prisma.workoutExecution.findMany({
      where: { athleteProfileId: 'singleton', date: { gte: startDate, lte: endDate }, status: 'completed' },
      select: { date: true },
    }),
    prisma.runningExecution.findMany({
      where: { runningProfileId: 'singleton', date: { gte: startDate, lte: endDate } },
      select: { date: true },
    }),
    prisma.crossTrainingActivity.findMany({
      where: { athleteProfileId: 'singleton', date: { gte: startDate, lte: endDate }, status: 'completed' },
      select: { date: true },
    }),
    prisma.wellnessDaily.findMany({
      where: {
        athleteProfileId: 'singleton',
        date: { gte: startDate, lte: endDate },
      },
    }),
  ]);

  const wellnessMap = new Map(wellnessList.map((w) => [w.date, w]));
  const activeDates = new Set<string>([
    ...workoutDays.map((d) => d.date),
    ...runDays.map((d) => d.date),
    ...crossDays.map((d) => d.date),
  ]);

  // 2. Envia o total consolidado (soma de todas as atividades) de cada dia para o Rastreador
  for (const date of Array.from(activeDates).sort()) {
    const w = wellnessMap.get(date);
    const result = await syncDayToMetabolicTracker(date, {
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
