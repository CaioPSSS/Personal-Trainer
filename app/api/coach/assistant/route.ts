import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAuthorized } from '@/lib/auth';
import { Prisma } from '@prisma/client';
import { todayISO } from '@/lib/dates';
import {
  assistantOutputSchema,
  ASSISTANT_OUTPUT_SCHEMA_VERSION,
  AssistantOutput,
  AssistantRecommendation,
} from '@/lib/ai/contracts';
import { generateStructuredOutput } from '@/lib/ai/openrouter';
import { buildAssistantCoachPrompts } from '@/lib/ai/prompts';
import {
  findSavedSwapSuggestions,
  getBiomechanicalSwapFallback,
  isSameExerciseName,
  parseRecommendationsJson,
  parseSubstitutionHints,
  recordSwapSelectionInSuggestions,
  slugifyExerciseKey,
  tagRecommendationsWithObjective,
} from '@/lib/ai/exercise-swap';
import {
  calculateProgressiveOverload,
  ExercisePreviousPerformanceData,
  isCompoundExercise,
} from '@/lib/progression/load-calculator';

export const maxDuration = 300;

interface AssistantRequestBody {
  mode: 'exercise_swap' | 'fatigue_alert';
  payload: Record<string, unknown>;
  workoutExecutionId?: string;
  exerciseExecutionId?: string;
}

interface ApplySwapRequestBody {
  swapSuggestionId?: string | null;
  exercisePrescriptionId?: string | null;
  requestedExercise: string;
  selectedTitle: string;
  selectedReason?: string;
  movementPattern?: string | null;
  objective?: string | null;
  applyScope: 'today' | 'always';
  recommendations?: AssistantRecommendation[];
}

function buildAssistantModelCascade(): string[] {
  const configured = [
    ...(process.env.ASSISTANT_COACH_CASCADE ?? '').split(','),
    ...(process.env.DATA_ANALYST_CASCADE ?? '').split(','),
    'google/gemini-2.5-flash',
    'deepseek/deepseek-chat',
    'openai/gpt-4o-mini',
    'deepseek/deepseek-v4-flash-0731',
    'qwen/qwen3.7-plus',
  ]
    .map((m) => m.trim())
    .filter(Boolean);

  return Array.from(new Set(configured));
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const assistantCascade = buildAssistantModelCascade();

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

    const [athleteProfile, activeMesocycle] = await Promise.all([
      prisma.athleteProfile.findUnique({ where: { id: 'singleton' } }),
      prisma.mesocyclePlan.findFirst({
        where: { athleteProfileId: 'singleton', status: 'active' },
        select: { id: true, objective: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const currentObjective =
      typeof body.payload.objective === 'string' && body.payload.objective.trim()
        ? body.payload.objective.trim()
        : activeMesocycle?.objective ?? 'Hipertrofia Geral';

    if (body.mode === 'exercise_swap') {
      const exerciseName = String(body.payload.exerciseName ?? '').trim();
      const movementPattern =
        typeof body.payload.movementPattern === 'string' ? body.payload.movementPattern : null;
      const exercisePrescriptionId =
        typeof body.payload.exercisePrescriptionId === 'string' && body.payload.exercisePrescriptionId.trim()
          ? body.payload.exercisePrescriptionId.trim()
          : null;
      const forceRefresh = Boolean(body.payload.forceRefresh);

      if (!exerciseName) {
        return NextResponse.json({ error: 'exerciseName is required for exercise_swap.' }, { status: 400 });
      }

      const [prescription, swapHistory] = await Promise.all([
        exercisePrescriptionId
          ? prisma.exercisePrescription.findUnique({
              where: { id: exercisePrescriptionId },
              select: { id: true, exerciseName: true, substitutionHints: true },
            })
          : Promise.resolve(null),
        prisma.exerciseSwapSuggestion.findMany({
          orderBy: { createdAt: 'desc' },
          take: 60,
        }),
      ]);

      const existingHints = parseSubstitutionHints(prescription?.substitutionHints);
      const lookupExerciseName = existingHints?.originalExerciseName || exerciseName;

      const savedMatch = findSavedSwapSuggestions({
        exerciseName: lookupExerciseName,
        objective: currentObjective,
        prescriptionHints: prescription?.substitutionHints,
        swapHistory,
      });

      if (!forceRefresh && savedMatch && savedMatch.recommendations.length > 0) {
        return NextResponse.json({
          success: true,
          fromCache: true,
          swapSuggestionId: savedMatch.swapSuggestionId,
          objective: currentObjective,
          permanentReplacement: savedMatch.permanentReplacement ?? null,
          output: {
            mode: 'exercise_swap',
            recommendations: savedMatch.recommendations,
          },
          modelUsed: 'saved_preferences_cache',
          attempts: 0,
        });
      }

      // Generate swap recommendations via AI cascade, with deterministic biomechanical fallback
      let recommendations: AssistantRecommendation[] = [];
      let modelUsed = 'biomechanical_smartfit_fallback';
      let attempts = 1;
      let latencyMs = 0;
      let usage:
        | { promptTokens: number; completionTokens: number; totalTokens: number }
        | undefined;

      try {
        const prompts = buildAssistantCoachPrompts({
          mode: 'exercise_swap',
          payload: {
            ...body.payload,
            exerciseName: lookupExerciseName,
            movementPattern,
          },
          athleteProfile,
          objective: currentObjective,
        });

        const aiResult = await generateStructuredOutput<AssistantOutput>({
          schemaId: `assistant-output-${ASSISTANT_OUTPUT_SCHEMA_VERSION}`,
          schema: assistantOutputSchema,
          systemPrompt: prompts.systemPrompt,
          userPrompt: prompts.userPrompt,
          modelCascade: assistantCascade,
          maxRetries: 1,
          temperature: 0.15,
        });

        recommendations = tagRecommendationsWithObjective(
          aiResult.data.recommendations,
          currentObjective,
          savedMatch?.recommendations
        );
        modelUsed = aiResult.modelUsed;
        attempts = aiResult.attempts;
        latencyMs = aiResult.latencyMs;
        usage = aiResult.usage;
      } catch (aiErr) {
        console.warn('[Assistant Coach] AI cascade failed, using SmartFit biomechanical fallback:', aiErr);
        recommendations = getBiomechanicalSwapFallback(
          lookupExerciseName,
          movementPattern,
          currentObjective
        );
      }

      if (recommendations.length === 0) {
        recommendations = getBiomechanicalSwapFallback(
          lookupExerciseName,
          movementPattern,
          currentObjective
        );
      }

      const createdSwap = await prisma.exerciseSwapSuggestion.create({
        data: {
          workoutExecutionId: body.workoutExecutionId ?? null,
          exerciseExecutionId: body.exerciseExecutionId ?? null,
          requestedExercise: lookupExerciseName,
          requestedPattern: movementPattern,
          suggestions: recommendations as unknown as Prisma.InputJsonValue,
        },
      });

      if (prescription) {
        const updatedHints = {
          objective: currentObjective,
          originalExerciseName: existingHints?.originalExerciseName || prescription.exerciseName,
          permanentReplacement: existingHints?.permanentReplacement ?? null,
          savedSuggestions: recommendations,
        };
        await prisma.exercisePrescription.update({
          where: { id: prescription.id },
          data: {
            substitutionHints: updatedHints as unknown as Prisma.InputJsonValue,
          },
        });
      }

      await prisma.aiRunLog.create({
        data: {
          runType: 'assistant_coach',
          mode: 'exercise_swap',
          status: 'success',
          primaryModel: modelUsed,
          fallbackModel: assistantCascade.find((m) => m !== modelUsed) ?? null,
          attemptCount: attempts,
          latencyMs,
          requestPayload: {
            schemaVersion: ASSISTANT_OUTPUT_SCHEMA_VERSION,
            cascadeConfig: assistantCascade,
            usage,
            mode: body.mode,
            objective: currentObjective,
            payload: body.payload,
          } as unknown as Prisma.InputJsonValue,
          responsePayload: {
            mode: 'exercise_swap',
            recommendations,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      return NextResponse.json({
        success: true,
        fromCache: false,
        swapSuggestionId: createdSwap.id,
        objective: currentObjective,
        permanentReplacement: existingHints?.permanentReplacement ?? null,
        output: {
          mode: 'exercise_swap',
          recommendations,
        },
        modelUsed,
        attempts,
      });
    }

    // Mode: fatigue_alert
    const prompts = buildAssistantCoachPrompts({
      mode: body.mode,
      payload: body.payload,
      athleteProfile,
      objective: currentObjective,
    });

    const result = await generateStructuredOutput<AssistantOutput>({
      schemaId: `assistant-output-${ASSISTANT_OUTPUT_SCHEMA_VERSION}`,
      schema: assistantOutputSchema,
      systemPrompt: prompts.systemPrompt,
      userPrompt: prompts.userPrompt,
      modelCascade: assistantCascade,
      maxRetries: 2,
      temperature: 0.15,
    });

    if (result.data.mode === 'fatigue_alert' && result.data.alert) {
      const fatigueDate = typeof body.payload.date === 'string' ? body.payload.date : todayISO();
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

    await prisma.aiRunLog.create({
      data: {
        runType: 'assistant_coach',
        mode: body.mode,
        status: 'success',
        primaryModel: result.modelUsed,
        fallbackModel: assistantCascade.find((m) => m !== result.modelUsed) ?? null,
        attemptCount: result.attempts,
        latencyMs: result.latencyMs,
        requestPayload: {
          schemaVersion: ASSISTANT_OUTPUT_SCHEMA_VERSION,
          cascadeConfig: assistantCascade,
          usage: result.usage,
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
        primaryModel: assistantCascade[0] ?? 'unknown',
        fallbackModel: assistantCascade[1] ?? null,
        errorMessage: message,
      },
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Assistant coach request failed.',
        detail: message,
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as ApplySwapRequestBody;
    const requestedExercise = String(body?.requestedExercise ?? '').trim();
    const selectedTitle = String(body?.selectedTitle ?? '').trim();
    const applyScope = body?.applyScope === 'always' ? 'always' : 'today';

    if (!requestedExercise || !selectedTitle) {
      return NextResponse.json(
        { error: 'requestedExercise and selectedTitle are required.' },
        { status: 400 }
      );
    }

    const activeMesocycle = await prisma.mesocyclePlan.findFirst({
      where: { athleteProfileId: 'singleton', status: 'active' },
      select: { id: true, objective: true },
      orderBy: { createdAt: 'desc' },
    });

    const currentObjective =
      typeof body.objective === 'string' && body.objective.trim()
        ? body.objective.trim()
        : activeMesocycle?.objective ?? 'Hipertrofia Geral';

    const nowISO = new Date().toISOString();

    // 1. Find existing ExerciseSwapSuggestion to update selection metadata
    let targetSuggestion = body.swapSuggestionId
      ? await prisma.exerciseSwapSuggestion.findUnique({ where: { id: body.swapSuggestionId } })
      : null;

    if (!targetSuggestion) {
      const recentSwaps = await prisma.exerciseSwapSuggestion.findMany({
        orderBy: { createdAt: 'desc' },
        take: 40,
      });
      targetSuggestion =
        recentSwaps.find((s) => isSameExerciseName(s.requestedExercise, requestedExercise)) ?? null;
    }

    const baseRecommendations =
      targetSuggestion
        ? parseRecommendationsJson(targetSuggestion.suggestions)
        : Array.isArray(body.recommendations)
          ? parseRecommendationsJson(body.recommendations)
          : [];

    const { updatedRecommendations, selectedIndex } = recordSwapSelectionInSuggestions({
      recommendations: baseRecommendations,
      selectedTitle,
      selectedReason: body.selectedReason,
      objective: currentObjective,
      isPermanent: applyScope === 'always',
      nowISO,
    });

    if (targetSuggestion) {
      targetSuggestion = await prisma.exerciseSwapSuggestion.update({
        where: { id: targetSuggestion.id },
        data: {
          suggestions: updatedRecommendations as unknown as Prisma.InputJsonValue,
          selectedIndex,
        },
      });
    } else {
      targetSuggestion = await prisma.exerciseSwapSuggestion.create({
        data: {
          requestedExercise,
          requestedPattern: body.movementPattern ?? null,
          suggestions: updatedRecommendations as unknown as Prisma.InputJsonValue,
          selectedIndex,
        },
      });
    }

    // 2. Update ExercisePrescription hints (and replace exerciseName if applyScope === 'always')
    const updatedPrescriptionIds: string[] = [];
    let targetRxForProgression: {
      id: string;
      movementPattern: string;
      targetRepMin: number;
      targetRepMax: number;
      targetRpeMin: number | null;
      targetRpeMax: number | null;
    } | null = null;

    if (body.exercisePrescriptionId) {
      const rx = await prisma.exercisePrescription.findUnique({
        where: { id: body.exercisePrescriptionId },
      });

      if (rx) {
        targetRxForProgression = rx;
        const prevHints = parseSubstitutionHints(rx.substitutionHints);
        const canonicalOriginalName = prevHints?.originalExerciseName || requestedExercise || rx.exerciseName;

        const nextHints = {
          objective: currentObjective,
          originalExerciseName: canonicalOriginalName,
          permanentReplacement:
            applyScope === 'always'
              ? {
                  fromExercise: canonicalOriginalName,
                  toExercise: selectedTitle,
                  objective: currentObjective,
                  updatedAt: nowISO,
                }
              : prevHints?.permanentReplacement ?? null,
          savedSuggestions: updatedRecommendations,
        };

        await prisma.exercisePrescription.update({
          where: { id: rx.id },
          data: {
            ...(applyScope === 'always'
              ? {
                  exerciseName: selectedTitle,
                  exerciseKey: slugifyExerciseKey(selectedTitle),
                }
              : {}),
            substitutionHints: nextHints as unknown as Prisma.InputJsonValue,
          },
        });
        updatedPrescriptionIds.push(rx.id);

        // If 'always', also update any other prescription in the active mesocycle that has the same original exercise
        if (applyScope === 'always' && activeMesocycle) {
          const allActivePrescriptions = await prisma.exercisePrescription.findMany({
            where: {
              workoutDayTemplate: {
                mesocyclePlanId: activeMesocycle.id,
              },
              id: { not: rx.id },
            },
          });

          const matchingOtherRx = allActivePrescriptions.filter((other) => {
            const otherHints = parseSubstitutionHints(other.substitutionHints);
            return (
              isSameExerciseName(other.exerciseName, canonicalOriginalName) ||
              isSameExerciseName(otherHints?.originalExerciseName, canonicalOriginalName)
            );
          });

          for (const other of matchingOtherRx) {
            await prisma.exercisePrescription.update({
              where: { id: other.id },
              data: {
                exerciseName: selectedTitle,
                exerciseKey: slugifyExerciseKey(selectedTitle),
                substitutionHints: nextHints as unknown as Prisma.InputJsonValue,
              },
            });
            updatedPrescriptionIds.push(other.id);
          }
        }
      }
    }

    // 3. Look up historical performance for the newly selected exercise so the UI can prefill load
    let replacementProgression: ExercisePreviousPerformanceData | null = null;
    let replacementPreviousPerformanceText: string | null = null;

    const lastExec = await prisma.exerciseExecution.findFirst({
      where: {
        exerciseName: { equals: selectedTitle, mode: 'insensitive' },
        workoutExecution: {
          athleteProfileId: 'singleton',
          status: 'completed',
        },
      },
      orderBy: { createdAt: 'desc' },
      include: { setExecutions: true },
    });

    if (lastExec && lastExec.setExecutions.length > 0) {
      const validSets = lastExec.setExecutions.filter((s) => s.reps > 0);
      const bestSet =
        validSets.length > 0
          ? validSets.reduce((prev, curr) => ((curr.loadKg || 0) > (prev.loadKg || 0) ? curr : prev))
          : lastExec.setExecutions[0];

      replacementPreviousPerformanceText = `${bestSet.loadKg || 0}kg x ${bestSet.reps} reps (RPE ${bestSet.rpe ?? '?'})`;

      const pattern = targetRxForProgression?.movementPattern ?? body.movementPattern ?? lastExec.movementPattern ?? '';
      const prog = calculateProgressiveOverload({
        exerciseName: selectedTitle,
        movementPattern: pattern,
        isCompound: isCompoundExercise(selectedTitle, pattern),
        targetRepMin: targetRxForProgression?.targetRepMin || 8,
        targetRepMax: targetRxForProgression?.targetRepMax || 12,
        targetRpeMin: targetRxForProgression?.targetRpeMin ?? 7,
        targetRpeMax: targetRxForProgression?.targetRpeMax ?? 8.5,
        completedSets: lastExec.setExecutions.map((s) => ({
          setNumber: s.setNumber,
          loadKg: s.loadKg || 0,
          reps: s.reps || 0,
          rpe: s.rpe,
          isFailure: s.isFailure,
        })),
      });

      replacementProgression = {
        lastLoadKg: prog.previousMaxLoadKg,
        suggestedLoadKg: prog.suggestedLoadKg,
        deltaKg: prog.deltaKg,
        lastReps: bestSet.reps,
        lastRpe: bestSet.rpe ?? null,
        action: prog.action,
        reason: prog.progressionReason,
        progressionReason: prog.progressionReason,
      };
    }

    return NextResponse.json({
      success: true,
      applyScope,
      swapSuggestionId: targetSuggestion.id,
      updatedPrescriptionIds,
      recommendations: updatedRecommendations,
      replacementProgression,
      replacementPreviousPerformanceText,
    });
  } catch (error) {
    console.error('[Assistant Coach PATCH] Error applying swap:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: 'Failed to record exercise swap preference.', detail: message },
      { status: 500 }
    );
  }
}
