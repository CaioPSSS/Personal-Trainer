import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  DataAnalystReport,
  dataAnalystReportSchema,
  DATA_ANALYST_REPORT_SCHEMA_VERSION,
} from '@/lib/ai/contracts';
import { generateStructuredOutput } from '@/lib/ai/openrouter';
import { buildDataAnalystPrompts } from '@/lib/ai/prompts';

type GenericModel = {
  upsert: (args: unknown) => Promise<unknown>;
  findUnique: (args: unknown) => Promise<unknown>;
  findMany: (args: unknown) => Promise<unknown[]>;
  create: (args: unknown) => Promise<Record<string, unknown>>;
};

const db = prisma as unknown as {
  athleteProfile: Pick<GenericModel, 'upsert' | 'findUnique'>;
  workoutExecution: Pick<GenericModel, 'findMany'>;
  wellnessDaily: Pick<GenericModel, 'findMany'>;
  aiRunLog: Pick<GenericModel, 'create'>;
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

  const primaryModel = process.env.DATA_ANALYST_MODEL ?? 'openai/gpt-oss-120b';
  const fallbackModel = process.env.DATA_ANALYST_FALLBACK_MODEL;

  try {
    await db.athleteProfile.upsert({
      where: { id: 'singleton' },
      update: {},
      create: {
        id: 'singleton',
        sessionDurationMin: 60,
      },
    });

    const [athleteProfile, recentWorkouts, recentWellness] = await Promise.all([
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
    ]);

    const prompts = buildDataAnalystPrompts({
      athleteProfile,
      recentWorkouts,
      recentWellness,
    });

    const result = await generateStructuredOutput<DataAnalystReport>({
      schemaId: `data-analyst-report-${DATA_ANALYST_REPORT_SCHEMA_VERSION}`,
      schema: dataAnalystReportSchema,
      systemPrompt: prompts.systemPrompt,
      userPrompt: prompts.userPrompt,
      primaryModel,
      fallbackModel,
      maxRetries: 2,
      temperature: 0.15,
    });

    await db.aiRunLog.create({
      data: {
        runType: 'data_analyst_cycle_review',
        mode: 'cycle_analysis',
        status: 'success',
        primaryModel,
        fallbackModel,
        attemptCount: result.attempts,
        latencyMs: result.latencyMs,
        requestPayload: {
          schemaVersion: DATA_ANALYST_REPORT_SCHEMA_VERSION,
          contextSizes: {
            workouts: recentWorkouts.length,
            wellness: recentWellness.length,
          },
        },
        responsePayload: result.data,
      },
    });

    return NextResponse.json({
      success: true,
      report: result.data,
      modelUsed: result.modelUsed,
      attempts: result.attempts,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await db.aiRunLog.create({
      data: {
        runType: 'data_analyst_cycle_review',
        mode: 'cycle_analysis',
        status: 'failed',
        primaryModel,
        fallbackModel,
        errorMessage: message,
      },
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Data analyst request failed.',
        detail: message,
      },
      { status: 500 },
    );
  }
}
