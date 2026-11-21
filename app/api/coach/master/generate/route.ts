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
} from '@/lib/ai/contracts';
import { generateStructuredOutput } from '@/lib/ai/openrouter';
import { buildDataAnalystPrompts, buildMasterCoachPrompts } from '@/lib/ai/prompts';
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

  const masterCascade = (process.env.MASTER_COACH_CASCADE ?? 'deepseek/deepseek-v4-pro,qwen/qwen3.7-plus,minimax/minimax-m3,deepseek/deepseek-v4-flash-0731').split(',');
  const analystCascade = (process.env.DATA_ANALYST_CASCADE ?? 'deepseek/deepseek-v4-flash-0731,deepseek/deepseek-v4-flash,minimax/minimax-m3').split(',');

  try {
    await prisma.athleteProfile.upsert({
      where: { id: 'singleton' },
      update: {},
      create: {
        id: 'singleton',
        sessionDurationMin: 60,
      },
    });

    const fourteenDaysAgoStr = shiftISODate(todayISO(), -14);

    const [
      athleteProfile,
      recentWorkouts,
      recentWellness,
      previousBrain,
      activeMesocycle,
      recentCrossTraining,
      swapSuggestions,
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
        take: 56,
      }),
      prisma.coachBrainEntry.findFirst({
        orderBy: { createdAt: 'desc' },
      }),
      prisma.mesocyclePlan.findFirst({
        where: {
          athleteProfileId: 'singleton',
          status: 'active',
        },
        include: {
          workoutDays: {
            include: {
              prescriptions: true,
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
    ]);

    const exerciseSubstitutionSummary = buildExerciseSubstitutionSummary({
      swapSuggestions,
      activeMesocycle,
      recentWorkouts,
    });

    let analystData: DataAnalystReport;
    let analystRunLogId: string = 'bypass';
    let analystModelUsed = 'bypass';
    let analystAttempts = 0;

    if (recentWorkouts.length < 3) {
      const permanentNotes = exerciseSubstitutionSummary.permanentSwaps.map(
        (s) => `Respect permanent substitution: use "${s.replacementExercise}" instead of "${s.originalExercise}"`
      );
      analystData = {
        executiveSummary: "Baseline phase. No prior data available. Design an introductory hypertrophy block based solely on athlete profile.",
        exercisePerformance: [],
        progressionSignals: {
          progressionCompliance: 'moderate',
          keyBottlenecks: ['N/A - Baseline phase'],
          recoveryConstraints: ['N/A - Baseline phase'],
        },
        recommendationsForMaster: [
          'Establish baseline progressive overload',
          'Focus on movement pattern mastery',
          'Rely entirely on Athlete Profile for constraints',
          ...permanentNotes,
        ],
      };
    } else {
      const analystPrompts = buildDataAnalystPrompts({
        athleteProfile,
        activeMesocycle,
        recentWorkouts,
        recentWellness,
        exerciseSubstitutionSummary,
      });

      const analystResult = await generateStructuredOutput<DataAnalystReport>({
        schemaId: `data-analyst-report-${DATA_ANALYST_REPORT_SCHEMA_VERSION}`,
        schema: dataAnalystReportSchema,
        systemPrompt: analystPrompts.systemPrompt,
        userPrompt: analystPrompts.userPrompt,
        modelCascade: analystCascade,
        maxRetries: 2,
        temperature: 0.15,
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
              wellness: recentWellness.length,
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
      athleteProfile,
      analystReport: analystData,
      previousCoachBrain: previousBrain,
      recentWorkouts,
      recentWellness,
      crossTrainingSummary: recentCrossTraining,
      exerciseSubstitutionSummary,
    });

    const result = await generateStructuredOutput<MasterPlanOutput>({
      schemaId: `master-plan-${MASTER_PLAN_SCHEMA_VERSION}`,
      schema: masterPlanOutputSchema,
      systemPrompt: masterPrompts.systemPrompt,
      userPrompt: masterPrompts.userPrompt,
      modelCascade: masterCascade,
      maxRetries: 2,
      temperature: 0.1,
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
            wellness: recentWellness.length,
            permanentSwaps: exerciseSubstitutionSummary.permanentSwaps.length,
            frequentSwaps: exerciseSubstitutionSummary.frequentSwaps.length,
          },
        } as unknown as Prisma.InputJsonValue,
        responsePayload: result.data as unknown as Prisma.InputJsonValue,
      },
    });

    let requestedStartDate: string | null = null;
    try {
      const body = (await request.json()) as { startDate?: string };
      if (typeof body?.startDate === 'string' && isISODate(body.startDate)) {
        requestedStartDate = body.startDate;
      }
    } catch {
      // Empty or no body passed
    }

    const today = todayISO();
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
