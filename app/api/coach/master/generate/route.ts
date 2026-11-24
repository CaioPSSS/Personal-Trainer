import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAuthorized } from '@/lib/auth';
import { todayISO, shiftISODate } from '@/lib/dates';

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
import { fetchHybridCoachingContext } from '@/lib/ai/hybrid-context';
import { saveMasterPlanToDb } from '@/lib/db/hypertrophyMappers';
import { scheduleMesocycleWorkouts } from '@/lib/scheduling/strength-scheduler';
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

    const today = todayISO();
    const thirtyDaysAgoStr = shiftISODate(today, -30);

    const [
      athleteProfile,
      recentWorkouts,
      recentWellness,
      recentBrains,
      activeMesocycle,
      recentCrossTraining,
      swapSuggestions,
      hybridContext,
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
      prisma.coachBrainEntry.findMany({
        orderBy: { createdAt: 'desc' },
        take: 3,
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
          date: { gte: thirtyDaysAgoStr },
        },
        orderBy: { date: 'desc' },
      }),
      prisma.exerciseSwapSuggestion.findMany({
        orderBy: { createdAt: 'desc' },
        take: 60,
      }),
      fetchHybridCoachingContext(today),
    ]);

    const brainDecayWeights = [1.0, 0.7, 0.4];
    const previousCoachBrains = recentBrains.map((entry, idx) => ({
      version: entry.version,
      decayWeight: brainDecayWeights[idx] ?? 0.2,
      hypotheses: entry.hypotheses,
      retrospective: entry.retrospective,
      createdAt: entry.createdAt.toISOString(),
    }));
    const previousBrain = recentBrains[0] ?? null;
    const isBaselinePhase = recentWorkouts.length < 3;

    const exerciseSubstitutionSummary = buildExerciseSubstitutionSummary({
      swapSuggestions,
      activeMesocycle,
      recentWorkouts,
    });

    let analystData: DataAnalystReport;
    let analystRunLogId: string = 'bypass';
    let analystModelUsed = 'bypass';
    let analystAttempts = 0;

    if (isBaselinePhase) {
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
        runningSummary: hybridContext.runningSummary,
        crossTrainingSummary:
          recentCrossTraining.length > 0 ? recentCrossTraining : hybridContext.crossTrainingSummary,
        readinessSummary: hybridContext.readinessSummary,
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
      previousCoachBrains,
      recentWorkouts,
      recentWellness,
      crossTrainingSummary:
        recentCrossTraining.length > 0 ? recentCrossTraining : hybridContext.crossTrainingSummary,
      runningSummary: hybridContext.runningSummary,
      readinessSummary: hybridContext.readinessSummary,
      isBaselinePhase,
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

    const createdPlan = await saveMasterPlanToDb('singleton', result.data, runLog.id, {
      movementRestrictions: athleteProfile?.movementRestrictions,
      injuryHistory: hybridContext.runningProfile?.injuryHistory,
      availableEquipment: athleteProfile?.availableEquipment,
    });

    // Deterministically schedule workouts across the active mesocycle into CalendarEvent
    await scheduleMesocycleWorkouts('singleton');

    return NextResponse.json({
      success: true,
      mesocyclePlanId: String(createdPlan.id),
      modelUsed: result.modelUsed,
      analystModelUsed: analystModelUsed,
      attempts: result.attempts,
      analystAttempts: analystAttempts,
    });
  } catch (error) {
    console.error('[Master Coach] Error during generation:', error);
    const message = error instanceof Error ? error.message : String(error);

    try {
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
    } catch (logErr) {
      console.error('[Master Coach] Failed to persist AiRunLog:', logErr);
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to generate mesocycle plan.',
      },
      { status: 500 },
    );
  }
}
