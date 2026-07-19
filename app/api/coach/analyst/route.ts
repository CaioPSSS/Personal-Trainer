import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAuthorized } from '@/lib/auth';

export const maxDuration = 300;
import {
  DataAnalystReport,
  dataAnalystReportSchema,
  DATA_ANALYST_REPORT_SCHEMA_VERSION,
} from '@/lib/ai/contracts';
import { generateStructuredOutput } from '@/lib/ai/openrouter';
import { buildDataAnalystPrompts } from '@/lib/ai/prompts';
import { Prisma } from '@prisma/client';

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const primaryModel = process.env.DATA_ANALYST_MODEL ?? 'openai/gpt-oss-120b';
  const fallbackModel = process.env.DATA_ANALYST_FALLBACK_MODEL ?? 'google/gemma-4-31b-it:free';

  try {
    await prisma.athleteProfile.upsert({
      where: { id: 'singleton' },
      update: {},
      create: {
        id: 'singleton',
        sessionDurationMin: 60,
      },
    });

    const [athleteProfile, recentWorkouts, recentWellness, activeMesocycle] = await Promise.all([
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
    ]);

    const prompts = buildDataAnalystPrompts({
      athleteProfile,
      activeMesocycle,
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

    await prisma.aiRunLog.create({
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
        primaryModel,
        fallbackModel,
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
