import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAuthorized } from '@/lib/auth';
import { isISODate, todayISO, shiftISODate } from '@/lib/dates';

export const maxDuration = 300;

import {
  DataAnalystReport,
  dataAnalystReportSchema,
  DATA_ANALYST_REPORT_SCHEMA_VERSION,
  masterPlanOutputSchema,
  MASTER_PLAN_SCHEMA_VERSION,
  MasterPlanOutput,
  validateMasterPlanSemantics,
} from '@/lib/ai/contracts';
import {
  DATA_ANALYST_DEFAULT_CASCADE,
  MASTER_COACH_DEFAULT_CASCADE,
  resolveModelCascade,
} from '@/lib/ai/models';
import { generateStructuredOutput } from '@/lib/ai/openrouter';
import { buildDataAnalystPrompts, buildMasterCoachPrompts } from '@/lib/ai/prompts';
import {
  buildCompactAthleteProfile,
  buildCompactCrossTrainingDigest,
  buildCompactMesocycleSummary,
  buildConcurrentRunningDigest,
  buildWellnessNutritionDigest,
  buildWorkoutHistoryDigest,
} from '@/lib/ai/context-builders';
import { buildExerciseSubstitutionSummary } from '@/lib/ai/exercise-swap';
import { saveMasterPlanToDb } from '@/lib/db/hypertrophyMappers';
import {
  parseAvailableDayIndices,
  scheduleMesocycleWorkouts,
} from '@/lib/scheduling/strength-scheduler';
import {
  computeCycleEndDate,
  resolveCycleAnchorMonday,
} from '@/lib/scheduling/plan-dates';
import { Prisma } from '@prisma/client';

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const masterCascade = resolveModelCascade(
    process.env.MASTER_COACH_CASCADE,
    MASTER_COACH_DEFAULT_CASCADE
  );
  const analystCascade = resolveModelCascade(
    process.env.DATA_ANALYST_CASCADE,
    DATA_ANALYST_DEFAULT_CASCADE
  );

  const requestStartMs = Date.now();

  let requestedStartDate: string | null = null;
  try {
    const body = (await request.json()) as { startDate?: string };
    if (typeof body?.startDate === 'string' && isISODate(body.startDate)) {
      requestedStartDate = body.startDate;
    }
  } catch {
    // Empty or no body passed
  }

  try {
    await prisma.athleteProfile.upsert({
      where: { id: 'singleton' },
      update: {},
      create: {
        id: 'singleton',
        sessionDurationMin: 60,
      },
    });

    const today = todayISO();
    const fourteenDaysAgoStr = shiftISODate(today, -14);

    const [
      athleteProfile,
      recentWorkouts,
      recentWellness,
      previousBrain,
      activeMesocycle,
      recentCrossTraining,
      swapSuggestions,
      runningProfile,
      activeRunningPlan,
      recentRunningExecutions,
    ] = await Promise.all([
      prisma.athleteProfile.findUnique({ where: { id: 'singleton' } }),
      prisma.workoutExecution.findMany({
        where: { athleteProfileId: 'singleton' },
        orderBy: { date: 'desc' },
        take: 56,
        include: {
          exerciseExecutions: {
            include: {
              setExecutions: true,
            },
          },
        },
      }),
      prisma.wellnessDaily.findMany({
        where: { athleteProfileId: 'singleton' },
        orderBy: { date: 'desc' },
        take: 28,
      }),
      prisma.coachBrainEntry.findFirst({
        orderBy: { createdAt: 'desc' },
        select: {
          version: true,
          hypotheses: true,
          retrospective: true,
          createdAt: true,
        },
      }),
      prisma.mesocyclePlan.findFirst({
        where: {
          athleteProfileId: 'singleton',
          status: 'active',
        },
        include: {
          workoutDays: {
            orderBy: { dayOrder: 'asc' },
            include: {
              prescriptions: {
                orderBy: { sortOrder: 'asc' },
              },
            },
          },
        },
      }),
      prisma.crossTrainingActivity.findMany({
        where: {
          athleteProfileId: 'singleton',
          date: { gte: fourteenDaysAgoStr },
        },
        orderBy: { date: 'desc' },
      }),
      prisma.exerciseSwapSuggestion.findMany({
        orderBy: { createdAt: 'desc' },
        take: 60,
      }),
      prisma.runningProfile.findUnique({
        where: { id: 'singleton' },
        select: {
          primaryObjective: true,
          weeklyRunsTarget: true,
          availableDays: true,
          currentPace5kSec: true,
        },
      }),
      prisma.runningPlan.findFirst({
        where: {
          runningProfileId: 'singleton',
          status: 'active',
        },
        orderBy: { createdAt: 'desc' },
        select: {
          title: true,
          phase: true,
          weeklyTargetKm: true,
          sessions: {
            orderBy: [{ weekNumber: 'asc' }, { scheduledDate: 'asc' }],
            select: {
              weekNumber: true,
              dayOfWeek: true,
              sessionType: true,
              title: true,
              totalDistanceKm: true,
            },
          },
        },
      }),
      prisma.runningExecution.findMany({
        where: {
          runningProfileId: 'singleton',
          date: { gte: fourteenDaysAgoStr },
        },
        orderBy: { date: 'desc' },
        select: {
          date: true,
          distanceKm: true,
          sessionRpe: true,
          caloriesBurned: true,
        },
      }),
    ]);

    const exerciseSubstitutionSummary = buildExerciseSubstitutionSummary({
      swapSuggestions,
      activeMesocycle,
      recentWorkouts,
    });

    const compactProfile = buildCompactAthleteProfile(
      athleteProfile as unknown as Record<string, unknown> | null
    );
    const compactMesocycle = buildCompactMesocycleSummary(activeMesocycle);
    const workoutHistoryDigest = buildWorkoutHistoryDigest(recentWorkouts);
    const wellnessNutritionDigest = buildWellnessNutritionDigest(
      recentWellness,
      athleteProfile?.bodyWeightKg
    );
    const concurrentRunningDigest = buildConcurrentRunningDigest({
      runningProfile,
      activeRunningPlan,
      recentRuns: recentRunningExecutions,
    });
    const compactCrossTraining = buildCompactCrossTrainingDigest(recentCrossTraining);

    let analystData: DataAnalystReport;
    let analystRunLogId: string = 'bypass';
    let analystModelUsed = 'bypass';
    let analystAttempts = 0;

    if (recentWorkouts.length < 3) {
      const permanentNotes = exerciseSubstitutionSummary.permanentSwaps.map(
        (s) => `Respeitar substituição permanente: usar "${s.replacementExercise}" em vez de "${s.originalExercise}"`
      );
      analystData = {
        executiveSummary:
          'Baseline phase. Sem histórico suficiente para análise estatística; projetar bloco inicial de hipertrofia com alto SFR baseado no perfil do atleta, corrida concorrente e recuperação.',
        exercisePerformance: [],
        progressionSignals: {
          progressionCompliance: 'moderate',
          keyBottlenecks: ['N/A - Fase inicial (Baseline)'],
          recoveryConstraints: ['N/A - Fase inicial (Baseline)'],
        },
        recommendationsForMaster: [
          'Estabelecer dupla progressão limpa com RIR bem calibrado',
          'Priorizar exercícios de alto SFR e estabilidade mecânica',
          'Calibrar volume conforme perfil, sono, dieta e carga concorrente de corrida/CrossFit',
          ...permanentNotes,
        ],
      };
    } else {
      const analystPrompts = buildDataAnalystPrompts({
        athleteProfile: compactProfile,
        activeMesocycle: compactMesocycle,
        recentWorkouts: [],
        recentWellness: [],
        workoutHistoryDigest,
        wellnessNutritionDigest,
        concurrentRunningDigest,
        exerciseSubstitutionSummary,
      });

      const analystResult = await generateStructuredOutput<DataAnalystReport>({
        schemaId: `data-analyst-report-${DATA_ANALYST_REPORT_SCHEMA_VERSION}`,
        schema: dataAnalystReportSchema,
        systemPrompt: analystPrompts.systemPrompt,
        userPrompt: analystPrompts.userPrompt,
        modelCascade: analystCascade,
        maxRetries: 1,
        temperature: 0.15,
        reasoningEffort: 'low',
        maxTokens: 12000,
        perModelTimeoutsMs: [40_000, 25_000],
        totalBudgetMs: 65_000,
      });

      const analystRunLog = await prisma.aiRunLog.create({
        data: {
          runType: 'data_analyst_cycle_review',
          mode: 'cycle_analysis',
          status: 'success',
          primaryModel: analystResult.modelUsed,
          fallbackModel: analystCascade.find((m) => m !== analystResult.modelUsed) ?? null,
          attemptCount: analystResult.attempts,
          latencyMs: analystResult.latencyMs,
          requestPayload: {
            schemaVersion: DATA_ANALYST_REPORT_SCHEMA_VERSION,
            cascadeConfig: analystCascade,
            usage: analystResult.usage,
            contextSizes: {
              workouts: recentWorkouts.length,
              exercisesDigested: workoutHistoryDigest.exercises.length,
              wellnessDays: wellnessNutritionDigest.daysLogged,
              hasConcurrentRunning: Boolean(concurrentRunningDigest),
              permanentSwaps: exerciseSubstitutionSummary.permanentSwaps.length,
              frequentSwaps: exerciseSubstitutionSummary.frequentSwaps.length,
            },
          } as unknown as Prisma.InputJsonValue,
          responsePayload: analystResult.data as unknown as Prisma.InputJsonValue,
        },
      });

      analystData = analystResult.data;
      analystRunLogId = String(analystRunLog.id);
      analystModelUsed = analystResult.modelUsed;
      analystAttempts = analystResult.attempts;
    }

    const masterPrompts = buildMasterCoachPrompts({
      athleteProfile: compactProfile,
      analystReport: analystData,
      previousCoachBrain: previousBrain,
      recentWorkouts: [],
      recentWellness: [],
      workoutHistoryDigest,
      wellnessNutritionDigest,
      concurrentRunningDigest,
      crossTrainingSummary: compactCrossTraining,
      exerciseSubstitutionSummary,
    });

    // Reserve generous time for the flagship model (~180s) while keeping fallback headroom inside Vercel's 300s cap
    const elapsedBeforeMasterMs = Date.now() - requestStartMs;
    const masterBudgetMs = Math.max(90_000, 275_000 - elapsedBeforeMasterMs);
    const expectedDaysCount =
      athleteProfile?.weeklyWorkoutsTarget &&
      athleteProfile.weeklyWorkoutsTarget >= 2 &&
      athleteProfile.weeklyWorkoutsTarget <= 6
        ? athleteProfile.weeklyWorkoutsTarget
        : null;

    const result = await generateStructuredOutput<MasterPlanOutput>({
      schemaId: `master-plan-${MASTER_PLAN_SCHEMA_VERSION}`,
      schema: masterPlanOutputSchema,
      systemPrompt: masterPrompts.systemPrompt,
      userPrompt: masterPrompts.userPrompt,
      modelCascade: masterCascade,
      maxRetries: 1,
      temperature: 0.15,
      reasoningEffort: 'medium',
      maxTokens: 24000,
      perModelTimeoutsMs: [180_000, 65_000, 30_000],
      totalBudgetMs: masterBudgetMs,
      semanticValidator: (plan) => validateMasterPlanSemantics(plan, expectedDaysCount),
    });

    const runLog = await prisma.aiRunLog.create({
      data: {
        runType: 'master_coach_generation',
        mode: 'mesocycle_generation',
        status: 'success',
        primaryModel: result.modelUsed,
        fallbackModel: masterCascade.find((m) => m !== result.modelUsed) ?? null,
        attemptCount: result.attempts,
        latencyMs: result.latencyMs,
        requestPayload: {
          schemaVersion: MASTER_PLAN_SCHEMA_VERSION,
          cascadeConfig: masterCascade,
          usage: result.usage,
          analystRunLogId: analystRunLogId,
          analystSummary: analystData.executiveSummary,
          contextSizes: {
            workouts: recentWorkouts.length,
            wellnessDays: wellnessNutritionDigest.daysLogged,
            hasConcurrentRunning: Boolean(concurrentRunningDigest),
            permanentSwaps: exerciseSubstitutionSummary.permanentSwaps.length,
            frequentSwaps: exerciseSubstitutionSummary.frequentSwaps.length,
          },
        } as unknown as Prisma.InputJsonValue,
        responsePayload: result.data as unknown as Prisma.InputJsonValue,
      },
    });

    const availableDayIndices = parseAvailableDayIndices(athleteProfile?.availableDays);
    const weeklyTarget =
      athleteProfile?.weeklyWorkoutsTarget ?? Math.max(1, result.data.mesocycle.days.length);
    const anchor = resolveCycleAnchorMonday({
      today,
      availableDayIndices,
      weeklyTarget,
      requestedStartDate,
    });
    const endDate = computeCycleEndDate(anchor.anchorMonday, result.data.mesocycle.durationWeeks);

    const createdPlan = await saveMasterPlanToDb('singleton', result.data, runLog.id, {
      startDate: anchor.effectiveStartDate,
      endDate,
    });

    // Deterministically schedule workouts across the active mesocycle into CalendarEvent
    await scheduleMesocycleWorkouts('singleton', anchor.effectiveStartDate);

    return NextResponse.json({
      success: true,
      mesocyclePlanId: String(createdPlan.id),
      startDate: anchor.effectiveStartDate,
      endDate,
      anchorMonday: anchor.anchorMonday,
      rolledToNextWeek: anchor.rolledToNextWeek,
      modelUsed: result.modelUsed,
      analystModelUsed: analystModelUsed,
      attempts: result.attempts,
      analystAttempts: analystAttempts,
    });
  } catch (error) {
    console.error('[Master Coach] Error during generation:', error);
    const message = error instanceof Error ? error.message : String(error);

    await prisma.aiRunLog.create({
      data: {
        runType: 'master_coach_generation',
        mode: 'mesocycle_generation',
        status: 'failed',
        primaryModel: masterCascade[0] ?? 'unknown',
        fallbackModel: masterCascade[1] ?? null,
        errorMessage: message,
      },
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to generate mesocycle plan.',
        detail: message,
      },
      { status: 500 },
    );
  }
}
