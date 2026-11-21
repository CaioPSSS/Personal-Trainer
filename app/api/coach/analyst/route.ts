import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAuthorized } from '@/lib/auth';
import { shiftISODate, todayISO } from '@/lib/dates';

export const maxDuration = 300;

import {
  DataAnalystReport,
  dataAnalystReportSchema,
  DATA_ANALYST_REPORT_SCHEMA_VERSION,
} from '@/lib/ai/contracts';
import {
  DATA_ANALYST_DEFAULT_CASCADE,
  resolveModelCascade,
} from '@/lib/ai/models';
import { generateStructuredOutput } from '@/lib/ai/openrouter';
import { buildDataAnalystPrompts } from '@/lib/ai/prompts';
import {
  buildCompactAthleteProfile,
  buildCompactMesocycleSummary,
  buildConcurrentRunningDigest,
  buildWellnessNutritionDigest,
  buildWorkoutHistoryDigest,
} from '@/lib/ai/context-builders';
import { buildExerciseSubstitutionSummary } from '@/lib/ai/exercise-swap';
import { Prisma } from '@prisma/client';

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const analystCascade = resolveModelCascade(
    process.env.DATA_ANALYST_CASCADE,
    DATA_ANALYST_DEFAULT_CASCADE
  );

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
      activeMesocycle,
      swapSuggestions,
      runningProfile,
      activeRunningPlan,
      recentRuns,
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
        where: { runningProfileId: 'singleton', status: 'active' },
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
        where: { runningProfileId: 'singleton', date: { gte: fourteenDaysAgoStr } },
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
      recentRuns,
    });

    const prompts = buildDataAnalystPrompts({
      athleteProfile: compactProfile,
      activeMesocycle: compactMesocycle,
      recentWorkouts: [],
      recentWellness: [],
      workoutHistoryDigest,
      wellnessNutritionDigest,
      concurrentRunningDigest,
      exerciseSubstitutionSummary,
    });

    const result = await generateStructuredOutput<DataAnalystReport>({
      schemaId: `data-analyst-report-${DATA_ANALYST_REPORT_SCHEMA_VERSION}`,
      schema: dataAnalystReportSchema,
      systemPrompt: prompts.systemPrompt,
      userPrompt: prompts.userPrompt,
      modelCascade: analystCascade,
      maxRetries: 1,
      temperature: 0.15,
      reasoningEffort: 'medium',
      maxTokens: 4500,
      perModelTimeoutsMs: [55_000, 35_000],
      totalBudgetMs: 95_000,
    });

    await prisma.aiRunLog.create({
      data: {
        runType: 'data_analyst_cycle_review',
        mode: 'cycle_analysis',
        status: 'success',
        primaryModel: result.modelUsed,
        fallbackModel: analystCascade.find((m) => m !== result.modelUsed) ?? null,
        attemptCount: result.attempts,
        latencyMs: result.latencyMs,
        requestPayload: {
          schemaVersion: DATA_ANALYST_REPORT_SCHEMA_VERSION,
          cascadeConfig: analystCascade,
          usage: result.usage,
          contextSizes: {
            workouts: recentWorkouts.length,
            exercisesDigested: workoutHistoryDigest.exercises.length,
            wellnessDays: wellnessNutritionDigest.daysLogged,
            permanentSwaps: exerciseSubstitutionSummary.permanentSwaps.length,
            frequentSwaps: exerciseSubstitutionSummary.frequentSwaps.length,
          },
        },
        responsePayload: result.data as unknown as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({
      success: true,
      report: result.data,
      modelUsed: result.modelUsed,
      attempts: result.attempts,
    });
  } catch (error) {
    console.error('[Data Analyst] Error during analysis:', error);
    const message = error instanceof Error ? error.message : String(error);

    await prisma.aiRunLog.create({
      data: {
        runType: 'data_analyst_cycle_review',
        mode: 'cycle_analysis',
        status: 'failed',
        primaryModel: analystCascade[0] ?? 'unknown',
        fallbackModel: analystCascade[1] ?? null,
        errorMessage: message,
      },
    });

    return NextResponse.json(
      {
        success: false,
        error: 'data analyst request failed.',
        detail: message,
      },
      { status: 500 },
    );
  }
}
