import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  masterPlanOutputSchema,
  MASTER_PLAN_SCHEMA_VERSION,
  MasterPlanOutput,
} from '@/lib/ai/contracts';
import { generateStructuredOutput } from '@/lib/ai/openrouter';

type GenericModel = {
  upsert: (args: unknown) => Promise<unknown>;
  findMany: (args: unknown) => Promise<unknown[]>;
  findFirst: (args: unknown) => Promise<unknown>;
  create: (args: unknown) => Promise<Record<string, unknown>>;
};

const db = prisma as unknown as {
  athleteProfile: Pick<GenericModel, 'upsert'>;
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

function buildMasterPrompts(context: {
  recentWorkouts: unknown[];
  recentWellness: unknown[];
  previousBrain: unknown | null;
}) {
  const systemPrompt = [
    'You are an elite hypertrophy coach focused on efficient 60-minute sessions.',
    'Return strictly valid JSON only. No markdown, no prose outside JSON.',
    'Design a mesocycle with evidence-based volume progression and fatigue management.',
    'Use 4-6 weeks and include deload logic when needed.',
  ].join(' ');

  const userPrompt = [
    'Generate the next mesocycle plan using the schema constraints.',
    'Athlete context and previous block data are below as JSON.',
    JSON.stringify(context),
  ].join('\n\n');

  return { systemPrompt, userPrompt };
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const primaryModel = process.env.MASTER_COACH_MODEL ?? 'openai/gpt-4.1-mini';
  const fallbackModel = process.env.MASTER_COACH_FALLBACK_MODEL ?? 'google/gemma-3-27b-it';

  try {
    await db.athleteProfile.upsert({
      where: { id: 'singleton' },
      update: {},
      create: {
        id: 'singleton',
        sessionDurationMin: 60,
      },
    });

    const [recentWorkouts, recentWellness, previousBrain] = await Promise.all([
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

    const prompts = buildMasterPrompts({
      recentWorkouts,
      recentWellness,
      previousBrain,
    });

    const result = await generateStructuredOutput<MasterPlanOutput>({
      schemaId: `master-plan-${MASTER_PLAN_SCHEMA_VERSION}`,
      schema: masterPlanOutputSchema,
      systemPrompt: prompts.systemPrompt,
      userPrompt: prompts.userPrompt,
      primaryModel,
      fallbackModel,
      maxRetries: 2,
      temperature: 0.2,
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
        primaryModel,
        fallbackModel,
        attemptCount: result.attempts,
        latencyMs: result.latencyMs,
        requestPayload: {
          schemaVersion: MASTER_PLAN_SCHEMA_VERSION,
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
      },
    });

    return NextResponse.json({
      success: true,
      mesocyclePlanId: String(createdPlan.id),
      modelUsed: result.modelUsed,
      attempts: result.attempts,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await db.aiRunLog.create({
      data: {
        runType: 'master_coach_generation',
        mode: 'mesocycle_generation',
        status: 'failed',
        primaryModel,
        fallbackModel,
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
