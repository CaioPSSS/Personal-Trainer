import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAuthorized } from '@/lib/auth';
import { Prisma } from '@prisma/client';
import { todayISO, isISODate, diffISODaysSigned } from '@/lib/dates';
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
  filterSwapRecommendations,
  parseAvailableEquipment,
  parseRestrictionTags,
} from '@/lib/ai/safety-filter';
import { fetchHybridCoachingContext } from '@/lib/ai/hybrid-context';
import {
  calculateProgressiveOverload,
  ExercisePreviousPerformanceData,
  isCompoundExercise,
} from '@/lib/progression/load-calculator';

export const maxDuration = 300;

interface AssistantRequestBody {
  mode: 'exercise_swap' | 'fatigue_alert';
  payload?: Record<string, unknown>;
  workoutExecutionId?: string;
  exerciseExecutionId?: string;
}

interface ApplySwapRequestBody {
  action?: string;
  alertId?: string;
  swapSuggestionId?: string | null;
  exercisePrescriptionId?: string | null;
  requestedExercise?: string;
  selectedTitle?: string;
  selectedReason?: string;
  movementPattern?: string | null;
  objective?: string | null;
  applyScope?: 'today' | 'always';
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

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const today = todayISO();
    const [hybridContext, existingTodayFatigueAlert] = await Promise.all([
      fetchHybridCoachingContext(today),
      prisma.assistantAlert.findFirst({
        where: {
          athleteProfileId: 'singleton',
          date: today,
          alertType: 'fatigue_alert',
        },
      }),
    ]);

    if (hybridContext.readinessSummary.score < 55 && !existingTodayFatigueAlert) {
      await prisma.assistantAlert.create({
        data: {
          athleteProfileId: 'singleton',
          date: today,
          alertType: 'fatigue_alert',
          severity: 'high',
          message: hybridContext.readinessSummary.recommendation,
          metadata: {
            score: hybridContext.readinessSummary.score,
            breakdown: hybridContext.readinessSummary.breakdown,
            action: 'Reduza 1-2 séries ou mantenha 1-2 repetições extras na reserva hoje.',
            source: 'readiness_auto',
          } as unknown as Prisma.InputJsonValue,
        },
      });
    }

    const alerts = await prisma.assistantAlert.findMany({
      where: {
        athleteProfileId: 'singleton',
        isResolved: false,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return NextResponse.json({
      success: true,
      alerts,
      readiness: hybridContext.readinessSummary,
    });
  } catch (error) {
    console.error('[Assistant Coach GET] Error fetching alerts:', error);
    return NextResponse.json({ error: 'Falha ao carregar alertas de assistência.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const assistantCascade = buildAssistantModelCascade();

  try {
    const body = (await request.json()) as AssistantRequestBody;
    const payload = body?.payload ?? {};

    if (!body?.mode || (body.mode === 'exercise_swap' && !body?.payload)) {
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

    const [athleteProfile, runningProfile, activeMesocycle] = await Promise.all([
      prisma.athleteProfile.findUnique({ where: { id: 'singleton' } }),
      prisma.runningProfile.findUnique({
        where: { id: 'singleton' },
        select: { injuryHistory: true },
      }),
      prisma.mesocyclePlan.findFirst({
        where: { athleteProfileId: 'singleton', status: 'active' },
        select: { id: true, objective: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const currentObjective =
      typeof payload.objective === 'string' && payload.objective.trim()
        ? payload.objective.trim()
        : activeMesocycle?.objective ?? 'Hipertrofia Geral';

    const restrictions = parseRestrictionTags(
      athleteProfile?.movementRestrictions,
      runningProfile?.injuryHistory
    );
    const equipment = parseAvailableEquipment(athleteProfile?.availableEquipment);

    if (body.mode === 'exercise_swap') {
      const exerciseName = String(payload.exerciseName ?? '').trim();
      const movementPattern =
        typeof payload.movementPattern === 'string' ? payload.movementPattern : null;
      const exercisePrescriptionId =
        typeof payload.exercisePrescriptionId === 'string' && payload.exercisePrescriptionId.trim()
          ? payload.exercisePrescriptionId.trim()
          : null;
      const forceRefresh = Boolean(payload.forceRefresh);

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
        const filteredCached = filterSwapRecommendations(
          savedMatch.recommendations,
          movementPattern,
          restrictions,
          equipment
        );
        if (filteredCached.safe.length > 0) {
          return NextResponse.json({
            success: true,
            fromCache: true,
            source: 'cache' as const,
            usedFallback: false,
            swapSuggestionId: savedMatch.swapSuggestionId,
            objective: currentObjective,
            permanentReplacement: savedMatch.permanentReplacement ?? null,
            output: {
              mode: 'exercise_swap',
              recommendations: filteredCached.safe,
            },
            modelUsed: 'saved_preferences_cache',
            attempts: 0,
          });
        }
      }

      // Generate swap recommendations via AI cascade, filtered deterministically for safety & equipment
      let recommendations: AssistantRecommendation[] = [];
      let modelUsed = 'biomechanical_fallback';
      let source: 'ai' | 'fallback' = 'fallback';
      let usedFallback = true;
      let attempts = 1;
      let latencyMs = 0;
      let usage:
        | { promptTokens: number; completionTokens: number; totalTokens: number }
        | undefined;

      if (process.env.OPENROUTER_API_KEY) {
        try {
          const prompts = buildAssistantCoachPrompts({
            mode: 'exercise_swap',
            payload: {
              ...payload,
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

          const filteredAi = filterSwapRecommendations(
            aiResult.data.recommendations,
            movementPattern,
            restrictions,
            equipment
          );

          if (filteredAi.safe.length > 0) {
            recommendations = tagRecommendationsWithObjective(
              filteredAi.safe,
              currentObjective,
              savedMatch?.recommendations
            );
            modelUsed = aiResult.modelUsed;
            source = 'ai';
            usedFallback = false;
            attempts = aiResult.attempts;
            latencyMs = aiResult.latencyMs;
            usage = aiResult.usage;
          }
        } catch (aiErr) {
          console.warn('[Assistant Coach] AI cascade failed, using safe biomechanical fallback:', aiErr);
        }
      }

      if (recommendations.length === 0) {
        recommendations = getBiomechanicalSwapFallback(
          lookupExerciseName,
          movementPattern,
          currentObjective,
          {
            movementRestrictions: athleteProfile?.movementRestrictions,
            injuryHistory: runningProfile?.injuryHistory,
            availableEquipment: athleteProfile?.availableEquipment,
          }
        );
        source = 'fallback';
        usedFallback = true;
        modelUsed = 'biomechanical_fallback';
      }

      const createdSwap = await prisma.exerciseSwapSuggestion.create({
        data: {
          athleteProfileId: 'singleton',
          workoutExecutionId: body.workoutExecutionId ?? null,
          exerciseExecutionId: body.exerciseExecutionId ?? null,
          requestedExercise: lookupExerciseName,
          requestedPattern: movementPattern,
          objective: currentObjective,
          isPermanent: false,
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
            source,
            payload,
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
        source,
        usedFallback,
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
    const fatigueDate = typeof payload.date === 'string' && isISODate(payload.date) ? payload.date : todayISO();
    const hybridContext = await fetchHybridCoachingContext(fatigueDate);

    let fatigueOutput: AssistantOutput;
    let fatigueModelUsed = 'readiness_deterministic_fallback';
    let fatigueSource: 'ai' | 'fallback' = 'fallback';
    let fatigueAttempts = 0;
    let fatigueLatency = 0;
    let fatigueUsage:
      | { promptTokens: number; completionTokens: number; totalTokens: number }
      | undefined;

    if (process.env.OPENROUTER_API_KEY) {
      try {
        const prompts = buildAssistantCoachPrompts({
          mode: 'fatigue_alert',
          payload: {
            ...payload,
            date: fatigueDate,
            readiness: hybridContext.readinessSummary,
            crossTrainingRecentCount: hybridContext.crossTrainingSummary.length,
          },
          athleteProfile,
          objective: currentObjective,
        });

        const result = await generateStructuredOutput<AssistantOutput>({
          schemaId: `assistant-output-${ASSISTANT_OUTPUT_SCHEMA_VERSION}`,
          schema: assistantOutputSchema,
          systemPrompt: prompts.systemPrompt,
          userPrompt: prompts.userPrompt,
          modelCascade: assistantCascade,
          maxRetries: 1,
          temperature: 0.15,
        });

        fatigueOutput = result.data;
        fatigueModelUsed = result.modelUsed;
        fatigueSource = 'ai';
        fatigueAttempts = result.attempts;
        fatigueLatency = result.latencyMs;
        fatigueUsage = result.usage;
      } catch (aiErr) {
        console.warn('[Assistant Coach fatigue_alert] AI failed, using readiness fallback:', aiErr);
        fatigueOutput = {
          mode: 'fatigue_alert',
          recommendations: [
            {
              title: 'Ajustar Volume & RIR na Sessão',
              reason: hybridContext.readinessSummary.recommendation,
            },
          ],
          alert: {
            type: 'fatigue_alert',
            severity:
              hybridContext.readinessSummary.status === 'red'
                ? 'high'
                : hybridContext.readinessSummary.status === 'yellow'
                  ? 'medium'
                  : 'low',
            message: `${hybridContext.readinessSummary.label} (Score ${hybridContext.readinessSummary.score}/100): ${hybridContext.readinessSummary.recommendation}`,
            action:
              hybridContext.readinessSummary.status === 'red'
                ? 'Reduza 1-2 séries por exercício e evite ir à falha.'
                : 'Siga o treino mantendo 1-2 RIR nos levantamentos principais.',
          },
        };
      }
    } else {
      fatigueOutput = {
        mode: 'fatigue_alert',
        recommendations: [
          {
            title: 'Auto-regulação Baseada em Prontidão',
            reason: hybridContext.readinessSummary.recommendation,
          },
        ],
        alert: {
          type: 'fatigue_alert',
          severity:
            hybridContext.readinessSummary.status === 'red'
              ? 'high'
              : hybridContext.readinessSummary.status === 'yellow'
                ? 'medium'
                : 'low',
          message: `${hybridContext.readinessSummary.label} (Score ${hybridContext.readinessSummary.score}/100): ${hybridContext.readinessSummary.recommendation}`,
          action:
            hybridContext.readinessSummary.status === 'red'
              ? 'Reduza 1-2 séries por exercício e evite ir à falha.'
              : 'Siga o treino mantendo 1-2 RIR nos levantamentos principais.',
        },
      };
    }

    let alertRecord = null;
    if (fatigueOutput.alert) {
      alertRecord = await prisma.assistantAlert.create({
        data: {
          athleteProfileId: 'singleton',
          date: fatigueDate,
          alertType: fatigueOutput.alert.type || 'fatigue_alert',
          severity: fatigueOutput.alert.severity,
          message: fatigueOutput.alert.message,
          metadata: {
            action: fatigueOutput.alert.action,
            recommendations: fatigueOutput.recommendations,
            source: fatigueSource,
            readinessScore: hybridContext.readinessSummary.score,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    }

    await prisma.aiRunLog.create({
      data: {
        runType: 'assistant_coach',
        mode: body.mode,
        status: 'success',
        primaryModel: fatigueModelUsed,
        fallbackModel: assistantCascade.find((m) => m !== fatigueModelUsed) ?? null,
        attemptCount: fatigueAttempts,
        latencyMs: fatigueLatency,
        requestPayload: {
          schemaVersion: ASSISTANT_OUTPUT_SCHEMA_VERSION,
          cascadeConfig: assistantCascade,
          usage: fatigueUsage,
          mode: body.mode,
          source: fatigueSource,
          payload,
        } as unknown as Prisma.InputJsonValue,
        responsePayload: fatigueOutput as unknown as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({
      success: true,
      source: fatigueSource,
      usedFallback: fatigueSource === 'fallback',
      output: fatigueOutput,
      alertRecord,
      readiness: hybridContext.readinessSummary,
      modelUsed: fatigueModelUsed,
      attempts: fatigueAttempts,
    });
  } catch (error) {
    console.error('[Assistant Coach POST] Error processing request:', error);
    const message = error instanceof Error ? error.message : String(error);

    try {
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
    } catch (logErr) {
      console.error('[Assistant Coach POST] Failed to persist AiRunLog:', logErr);
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Assistant coach request failed.',
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

    if (body?.action === 'resolve_alert') {
      const alertId = String(body.alertId ?? '').trim();
      if (!alertId) {
        return NextResponse.json({ error: 'alertId is required.' }, { status: 400 });
      }
      await prisma.assistantAlert.updateMany({
        where: { id: alertId, athleteProfileId: 'singleton' },
        data: { isResolved: true },
      });
      return NextResponse.json({ success: true, resolvedAlertId: alertId });
    }

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
      select: {
        id: true,
        objective: true,
        startDate: true,
        createdAt: true,
        durationWeeks: true,
        weeks: { orderBy: { weekNumber: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });

    let isDeloadToday = false;
    if (activeMesocycle && activeMesocycle.weeks.length > 0) {
      const startISO =
        activeMesocycle.startDate && isISODate(activeMesocycle.startDate)
          ? activeMesocycle.startDate
          : todayISO(activeMesocycle.createdAt);
      const daysSinceStart = Math.max(0, diffISODaysSigned(todayISO(), startISO));
      const totalWeeks = activeMesocycle.durationWeeks || activeMesocycle.weeks.length || 1;
      const currentWeekNum = Math.min(totalWeeks, Math.max(1, Math.floor(daysSinceStart / 7) + 1));
      const weekRecord =
        activeMesocycle.weeks.find((w) => w.weekNumber === currentWeekNum) ||
        activeMesocycle.weeks[activeMesocycle.weeks.length - 1];
      isDeloadToday = Boolean(weekRecord?.isDeload);
    }

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
          athleteProfileId: 'singleton',
          objective: currentObjective,
          isPermanent: applyScope === 'always' ? true : targetSuggestion.isPermanent,
          suggestions: updatedRecommendations as unknown as Prisma.InputJsonValue,
          selectedIndex,
        },
      });
    } else {
      targetSuggestion = await prisma.exerciseSwapSuggestion.create({
        data: {
          athleteProfileId: 'singleton',
          requestedExercise,
          requestedPattern: body.movementPattern ?? null,
          objective: currentObjective,
          isPermanent: applyScope === 'always',
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

    // 3. Look up historical performance for the newly selected exercise (accent-insensitive)
    let replacementProgression: ExercisePreviousPerformanceData | null = null;
    let replacementPreviousPerformanceText: string | null = null;

    const recentExecutions = await prisma.exerciseExecution.findMany({
      where: {
        workoutExecution: {
          athleteProfileId: 'singleton',
          status: 'completed',
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: { setExecutions: true },
    });

    const lastExec =
      recentExecutions.find((ex) => isSameExerciseName(ex.exerciseName, selectedTitle)) ?? null;

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
        isDeload: isDeloadToday,
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
    return NextResponse.json(
      { success: false, error: 'Failed to record exercise swap preference.' },
      { status: 500 }
    );
  }
}
