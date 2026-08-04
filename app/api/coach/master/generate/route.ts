import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAuthorized } from '@/lib/auth';

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
import { saveMasterPlanToDb } from '@/lib/db/hypertrophyMappers';
import { Prisma } from '@prisma/client';


export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const masterCascade = (process.env.MASTER_COACH_CASCADE ?? 'openai/gpt-5.6-luna,deepseek/deepseek-v4-pro,z-ai/glm-5.2,nvidia/nemotron-3-ultra-550b-a55b:free').split(',');
  const analystCascade = (process.env.DATA_ANALYST_CASCADE ?? 'deepseek/deepseek-v4-flash,google/gemini-2.5-flash,meta-llama/llama-3.3-70b-instruct:free').split(',');

  try {
    await prisma.athleteProfile.upsert({
      where: { id: 'singleton' },
      update: {},
      create: {
        id: 'singleton',
        sessionDurationMin: 60,
      },
    });

    const [athleteProfile, recentWorkouts, recentWellness, previousBrain, activeMesocycle] = await Promise.all([
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
    ]);

    let analystData: DataAnalystReport;
    let analystRunLogId: string = 'bypass';
    let analystModelUsed = 'bypass';
    let analystAttempts = 0;

    if (recentWorkouts.length < 3) {
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
        ],
      };
    } else {
      const analystPrompts = buildDataAnalystPrompts({
        athleteProfile,
        activeMesocycle,
        recentWorkouts,
        recentWellness,
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
          },
        } as unknown as Prisma.InputJsonValue,
        responsePayload: result.data as unknown as Prisma.InputJsonValue,
      },
    });

    const createdPlan = await saveMasterPlanToDb('singleton', result.data, runLog.id);

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
