import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  assistantOutputSchema,
  ASSISTANT_OUTPUT_SCHEMA_VERSION,
  AssistantOutput,
} from '@/lib/ai/contracts';
import { generateStructuredOutput } from '@/lib/ai/openrouter';
import { buildAssistantCoachPrompts } from '@/lib/ai/prompts';

type GenericModel = {
  upsert: (args: unknown) => Promise<unknown>;
  findUnique: (args: unknown) => Promise<unknown>;
  create: (args: unknown) => Promise<Record<string, unknown>>;
};

const db = prisma as unknown as {
  athleteProfile: Pick<GenericModel, 'upsert' | 'findUnique'>;
  assistantAlert: Pick<GenericModel, 'create'>;
  exerciseSwapSuggestion: Pick<GenericModel, 'create'>;
  aiRunLog: Pick<GenericModel, 'create'>;
};

interface AssistantRequestBody {
  mode: 'exercise_swap' | 'fatigue_alert';
  payload: Record<string, unknown>;
  workoutExecutionId?: string;
  exerciseExecutionId?: string;
}

export async function POST(request: NextRequest) {
  const primaryModel = process.env.ASSISTANT_COACH_MODEL ?? 'openai/gpt-oss-120b';
  const fallbackModel = process.env.ASSISTANT_COACH_FALLBACK_MODEL;

  try {
    const body = (await request.json()) as AssistantRequestBody;

    if (!body?.mode || !body?.payload) {
      return NextResponse.json({ error: 'mode and payload are required.' }, { status: 400 });
    }

    await db.athleteProfile.upsert({
      where: { id: 'singleton' },
      update: {},
      create: {
        id: 'singleton',
        sessionDurationMin: 60,
      },
    });

    const athleteProfile = await db.athleteProfile.findUnique({ where: { id: 'singleton' } });
    const prompts = buildAssistantCoachPrompts({
      mode: body.mode,
      payload: body.payload,
      athleteProfile,
    });
    const result = await generateStructuredOutput<AssistantOutput>({
      schemaId: `assistant-output-${ASSISTANT_OUTPUT_SCHEMA_VERSION}`,
      schema: assistantOutputSchema,
      systemPrompt: prompts.systemPrompt,
      userPrompt: prompts.userPrompt,
      primaryModel,
      fallbackModel,
      maxRetries: 2,
      temperature: 0.15,
    });

    if (result.data.mode === 'fatigue_alert' && result.data.alert) {
      const fatigueDate = typeof body.payload.date === 'string' ? body.payload.date : new Date().toISOString().slice(0, 10);
      await db.assistantAlert.create({
        data: {
          athleteProfileId: 'singleton',
          date: fatigueDate,
          alertType: result.data.alert.type,
          severity: result.data.alert.severity,
          message: result.data.alert.message,
          metadata: {
            action: result.data.alert.action,
            recommendations: result.data.recommendations,
          },
        },
      });
    }

    if (result.data.mode === 'exercise_swap') {
      await db.exerciseSwapSuggestion.create({
        data: {
          workoutExecutionId: body.workoutExecutionId ?? null,
          exerciseExecutionId: body.exerciseExecutionId ?? null,
          requestedExercise: String(body.payload.exerciseName ?? 'unknown'),
          requestedPattern: typeof body.payload.movementPattern === 'string' ? body.payload.movementPattern : null,
          suggestions: result.data.recommendations,
        },
      });
    }

    await db.aiRunLog.create({
      data: {
        runType: 'assistant_coach',
        mode: body.mode,
        status: 'success',
        primaryModel,
        fallbackModel,
        attemptCount: result.attempts,
        latencyMs: result.latencyMs,
        requestPayload: {
          schemaVersion: ASSISTANT_OUTPUT_SCHEMA_VERSION,
          mode: body.mode,
          payload: body.payload,
        },
        responsePayload: result.data,
      },
    });

    return NextResponse.json({
      success: true,
      output: result.data,
      modelUsed: result.modelUsed,
      attempts: result.attempts,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await db.aiRunLog.create({
      data: {
        runType: 'assistant_coach',
        mode: 'runtime',
        status: 'failed',
        primaryModel,
        fallbackModel,
        errorMessage: message,
      },
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Assistant coach request failed.',
        detail: message,
      },
      { status: 500 },
    );
  }
}
