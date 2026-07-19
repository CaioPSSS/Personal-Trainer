import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAuthorized } from '@/lib/auth';
import { Prisma } from '@prisma/client';
import {
  assistantOutputSchema,
  ASSISTANT_OUTPUT_SCHEMA_VERSION,
  AssistantOutput,
} from '@/lib/ai/contracts';
import { generateStructuredOutput } from '@/lib/ai/openrouter';
import { buildAssistantCoachPrompts } from '@/lib/ai/prompts';

interface AssistantRequestBody {
  mode: 'exercise_swap' | 'fatigue_alert';
  payload: Record<string, unknown>;
  workoutExecutionId?: string;
  exerciseExecutionId?: string;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const primaryModel = process.env.ASSISTANT_COACH_MODEL ?? 'openai/gpt-oss-120b';
  const fallbackModel = process.env.ASSISTANT_COACH_FALLBACK_MODEL;

  try {
    const body = (await request.json()) as AssistantRequestBody;

    if (!body?.mode || !body?.payload) {
      return NextResponse.json({ error: 'mode and payload are required.' }, { status: 400 });
    }

    await prisma.athleteProfile.upsert({
      where: { id: 'singleton' },
      update: {},
      create: {
        id: 'singleton',
        sessionDurationMin: 60,
      },
    });

    const athleteProfile = await prisma.athleteProfile.findUnique({ where: { id: 'singleton' } });
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
      await prisma.assistantAlert.create({
        data: {
          athleteProfileId: 'singleton',
          date: fatigueDate,
          alertType: result.data.alert.type,
          severity: result.data.alert.severity,
          message: result.data.alert.message,
          metadata: {
            action: result.data.alert.action,
            recommendations: result.data.recommendations,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    }

    if (result.data.mode === 'exercise_swap') {
      await prisma.exerciseSwapSuggestion.create({
        data: {
          workoutExecutionId: body.workoutExecutionId ?? null,
          exerciseExecutionId: body.exerciseExecutionId ?? null,
          requestedExercise: String(body.payload.exerciseName ?? 'unknown'),
          requestedPattern: typeof body.payload.movementPattern === 'string' ? body.payload.movementPattern : null,
          suggestions: result.data.recommendations as unknown as Prisma.InputJsonValue,
        },
      });
    }

    await prisma.aiRunLog.create({
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
        } as unknown as Prisma.InputJsonValue,
        responsePayload: result.data as unknown as Prisma.InputJsonValue,
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

    await prisma.aiRunLog.create({
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
