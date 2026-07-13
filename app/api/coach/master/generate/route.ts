import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
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

type GenericModel = {
  upsert: (args: unknown) => Promise<unknown>;
  findMany: (args: unknown) => Promise<unknown[]>;
  findFirst: (args: unknown) => Promise<unknown>;
  findUnique: (args: unknown) => Promise<unknown>;
  create: (args: unknown) => Promise<Record<string, unknown>>;
};

const db = prisma as unknown as {
  athleteProfile: Pick<GenericModel, 'upsert' | 'findUnique'>;
  workoutExecution: Pick<GenericModel, 'findMany'>;
  wellnessDaily: Pick<GenericModel, 'findMany'>;
  coachBrainEntry: Pick<GenericModel, 'findFirst' | 'create'>;
  aiRunLog: Pick<GenericModel, 'create'>;
  mesocyclePlan: Pick<GenericModel, 'create'>;
};

function isAuthorized(request: NextRequest): boolean {
  const expectedToken = process.env.CRON_SECRET;
  if (!expectedToken) {
    return true;
  }

  const authHeader = request.headers.get('authorization');
  const internalHeader = request.headers.get('x-internal-token');
  return authHeader === `Bearer ${expectedToken}` || internalHeader === expectedToken;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const masterPrimaryModel = process.env.MASTER_COACH_MODEL ?? 'nvidia/nemotron-3-ultra-550b-a55b:free';
  const masterFallbackModel = process.env.MASTER_COACH_FALLBACK_MODEL;
  const analystPrimaryModel = process.env.DATA_ANALYST_MODEL ?? 'openai/gpt-oss-120b';
  const analystFallbackModel = process.env.DATA_ANALYST_FALLBACK_MODEL;

  try {
    await db.athleteProfile.upsert({
      where: { id: 'singleton' },
      update: {},
      create: {
        id: 'singleton',
        sessionDurationMin: 60,
      },
    });

    const [athleteProfile, recentWorkouts, recentWellness, previousBrain] = await Promise.all([
      db.athleteProfile.findUnique({ where: { id: 'singleton' } }),
      db.workoutExecution.findMany({
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
      db.wellnessDaily.findMany({
        where: { athleteProfileId: 'singleton' },
        orderBy: { date: 'desc' },
        take: 56,
      }),
      db.coachBrainEntry.findFirst({
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const analystPrompts = buildDataAnalystPrompts({
      athleteProfile,
      recentWorkouts,
      recentWellness,
    });

    const analystResult = await generateStructuredOutput<DataAnalystReport>({
      schemaId: `data-analyst-report-${DATA_ANALYST_REPORT_SCHEMA_VERSION}`,
      schema: dataAnalystReportSchema,
      systemPrompt: analystPrompts.systemPrompt,
      userPrompt: analystPrompts.userPrompt,
      primaryModel: analystPrimaryModel,
      fallbackModel: analystFallbackModel,
      maxRetries: 2,
      temperature: 0.15,
    });

    const analystRunLog = await db.aiRunLog.create({
      data: {
        runType: 'data_analyst_cycle_review',
        mode: 'cycle_analysis',
        status: 'success',
        primaryModel: analystPrimaryModel,
        fallbackModel: analystFallbackModel,
        attemptCount: analystResult.attempts,
        latencyMs: analystResult.latencyMs,
        requestPayload: {
          schemaVersion: DATA_ANALYST_REPORT_SCHEMA_VERSION,
          contextSizes: {
            workouts: recentWorkouts.length,
            wellness: recentWellness.length,
          },
        },
        responsePayload: analystResult.data,
      },
    });

    const masterPrompts = buildMasterCoachPrompts({
      athleteProfile,
      analystReport: analystResult.data,
      previousCoachBrain: previousBrain,
      recentWorkouts,
      recentWellness,
    });

    const result = await generateStructuredOutput<MasterPlanOutput>({
      schemaId: `master-plan-${MASTER_PLAN_SCHEMA_VERSION}`,
      schema: masterPlanOutputSchema,
      systemPrompt: masterPrompts.systemPrompt,
      userPrompt: masterPrompts.userPrompt,
      primaryModel: masterPrimaryModel,
      fallbackModel: masterFallbackModel,
      maxRetries: 2,
      temperature: 0.1,
    });

    const createdPlan = await db.mesocyclePlan.create({
      data: {
        athleteProfileId: 'singleton',
        title: result.data.mesocycle.title,
        objective: result.data.mesocycle.objective,
        split: result.data.mesocycle.split,
        durationWeeks: result.data.mesocycle.durationWeeks,
        targetSessionMinutes: result.data.mesocycle.targetSessionMinutes,
        status: 'active',
        rawPlan: result.data,
        weeks: {
          create: result.data.mesocycle.weeks.map((week) => ({
            weekNumber: week.weekNumber,
            isDeload: week.isDeload,
            targetVolume: { notes: week.targetVolumeNotes },
          })),
        },
        workoutDays: {
          create: result.data.mesocycle.days.map((day) => ({
            dayOrder: day.dayOrder,
            label: day.label,
            estimatedDurationMin: day.estimatedDurationMin,
            prescriptions: {
              create: day.exercises.map((exercise, index) => ({
                exerciseKey: exercise.exerciseKey,
                exerciseName: exercise.exerciseName,
                movementPattern: exercise.movementPattern,
                sortOrder: index + 1,
                targetSets: exercise.targetSets,
                targetRepMin: exercise.targetRepMin,
                targetRepMax: exercise.targetRepMax,
                targetRpeMin: exercise.targetRpeMin,
                targetRpeMax: exercise.targetRpeMax,
                restSeconds: exercise.restSeconds,
                advancedTechnique: exercise.advancedTechnique,
              })),
            },
          })),
        },
      },
    });

    const runLog = await db.aiRunLog.create({
      data: {
        runType: 'master_coach_generation',
        mode: 'mesocycle_generation',
        status: 'success',
        primaryModel: masterPrimaryModel,
        fallbackModel: masterFallbackModel,
        attemptCount: result.attempts,
        latencyMs: result.latencyMs,
        requestPayload: {
          schemaVersion: MASTER_PLAN_SCHEMA_VERSION,
          analystRunLogId: String(analystRunLog.id),
          analystSummary: analystResult.data.executiveSummary,
          contextSizes: {
            workouts: recentWorkouts.length,
            wellness: recentWellness.length,
          },
        },
        responsePayload: result.data,
      },
    });

    await db.coachBrainEntry.create({
      data: {
        mesocyclePlanId: String(createdPlan.id),
        aiRunLogId: String(runLog.id),
        version: 1,
        hypotheses: {
          hypotheses: result.data.coachBrain.hypotheses,
          rationale: result.data.coachBrain.rationale,
          nextCycleWatchouts: result.data.coachBrain.nextCycleWatchouts,
        },
        retrospective: result.data.coachBrain.retrospective,
      },
    });

    return NextResponse.json({
      success: true,
      mesocyclePlanId: String(createdPlan.id),
      modelUsed: result.modelUsed,
      analystModelUsed: analystResult.modelUsed,
      attempts: result.attempts,
      analystAttempts: analystResult.attempts,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await db.aiRunLog.create({
      data: {
        runType: 'master_coach_generation',
        mode: 'mesocycle_generation',
        status: 'failed',
        primaryModel: masterPrimaryModel,
        fallbackModel: masterFallbackModel,
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
