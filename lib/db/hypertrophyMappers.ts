import { prisma } from '../prisma';
import { MasterPlanOutput } from '../ai/contracts';
import { Prisma } from '@prisma/client';
import { todayISO, mondayOfISODate } from '../dates';
import { computeCycleEndDate } from '../scheduling/plan-dates';
import {
  findSavedSwapSuggestions,
  parseRecommendationsJson,
  slugifyExerciseKey,
} from '../ai/exercise-swap';
import { sanitizePlanPrescriptions } from '../ai/safety-filter';

export interface SaveMasterPlanSafetyOptions {
  movementRestrictions?: unknown;
  injuryHistory?: unknown;
  availableEquipment?: unknown;
}

/**
 * Saves a generated hypertrophy mesocycle plan structure to the PostgreSQL database,
 * archiving previous active mesocycles for the same athlete, all within a transaction.
 */
export async function saveMasterPlanToDb(
  athleteProfileId: string,
  plan: MasterPlanOutput,
  aiRunLogId?: string,
  safetyOptions?: SaveMasterPlanSafetyOptions,
  scheduleBounds?: { startDate: string; endDate?: string }
) {
  return await prisma.$transaction(async (tx) => {
    // Fetch recent swap suggestions & latest CoachBrain version
    const [swapHistory, latestBrain] = await Promise.all([
      tx.exerciseSwapSuggestion.findMany({
        orderBy: { createdAt: 'desc' },
        take: 60,
      }),
      tx.coachBrainEntry.findFirst({
        orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
        select: { version: true },
      }),
    ]);

    const nextBrainVersion = (latestBrain?.version ?? 0) + 1;

    const { sanitizedDays } = sanitizePlanPrescriptions({
      days: plan.mesocycle.days,
      movementRestrictions: safetyOptions?.movementRestrictions,
      injuryHistory: safetyOptions?.injuryHistory,
      availableEquipment: safetyOptions?.availableEquipment,
    });

    // 1. Archive other active mesocycles for this athlete
    await tx.mesocyclePlan.updateMany({
      where: {
        athleteProfileId,
        status: 'active',
      },
      data: {
        status: 'completed',
      },
    });

    const today = todayISO();
    const startDate = scheduleBounds?.startDate ?? today;
    const endDate =
      scheduleBounds?.endDate ??
      computeCycleEndDate(mondayOfISODate(startDate), plan.mesocycle.durationWeeks);
    const planObjective = plan.mesocycle.objective;

    // Clean up future uncompleted planned strength calendar events from previous plans (never delete past history)
    const cleanupFloor = startDate < today ? startDate : today;
    await tx.calendarEvent.deleteMany({
      where: {
        athleteProfileId,
        eventType: 'strength',
        status: 'planned',
        date: { gte: cleanupFloor },
      },
    });

    // 2. Create the new MesocyclePlan and all dependent entities
    const createdPlan = await tx.mesocyclePlan.create({
      data: {
        athleteProfileId,
        title: plan.mesocycle.title,
        objective: planObjective,
        split: plan.mesocycle.split,
        durationWeeks: plan.mesocycle.durationWeeks,
        targetSessionMinutes: plan.mesocycle.targetSessionMinutes,
        startDate,
        endDate,
        status: 'active',
        rawPlan: plan as unknown as Prisma.InputJsonValue,
        createdByAiRunId: aiRunLogId,
        weeks: {
          create: plan.mesocycle.weeks.map((week) => ({
            weekNumber: week.weekNumber,
            isDeload: week.isDeload,
            targetVolume: { notes: week.targetVolumeNotes } as unknown as Prisma.InputJsonValue,
          })),
        },
        workoutDays: {
          create: sanitizedDays.map((day) => ({
            dayOrder: day.dayOrder,
            label: day.label,
            estimatedDurationMin: day.estimatedDurationMin,
            prescriptions: {
              create: day.exercises.map((exercise, index) => {
                const safetyReplacedFrom =
                  typeof (exercise as Record<string, unknown>).safetyReplacedFrom === 'string'
                    ? ((exercise as Record<string, unknown>).safetyReplacedFrom as string)
                    : undefined;

                const savedMatch = findSavedSwapSuggestions({
                  exerciseName: exercise.exerciseName,
                  objective: planObjective,
                  swapHistory,
                });

                const permanentRec = savedMatch?.recommendations.find(
                  (rec) => Boolean(rec.metadata?.isPermanent)
                );

                const effectiveExerciseName = permanentRec
                  ? permanentRec.title
                  : exercise.exerciseName;
                const effectiveExerciseKey = permanentRec
                  ? slugifyExerciseKey(permanentRec.title)
                  : slugifyExerciseKey(exercise.exerciseName);

                const substitutionHints =
                  savedMatch || safetyReplacedFrom
                    ? ({
                        objective: planObjective,
                        originalExerciseName: safetyReplacedFrom || exercise.exerciseName,
                        ...(safetyReplacedFrom ? { safetyReplacedFrom } : {}),
                        permanentReplacement: permanentRec
                          ? {
                              fromExercise: exercise.exerciseName,
                              toExercise: permanentRec.title,
                              objective: planObjective,
                              updatedAt:
                                typeof permanentRec.metadata?.lastSelectedAt === 'string'
                                  ? permanentRec.metadata.lastSelectedAt
                                  : new Date().toISOString(),
                            }
                          : null,
                        savedSuggestions: savedMatch
                          ? parseRecommendationsJson(savedMatch.recommendations)
                          : [],
                      } as unknown as Prisma.InputJsonValue)
                    : Prisma.DbNull;

                return {
                  exerciseKey: effectiveExerciseKey,
                  exerciseName: effectiveExerciseName,
                  movementPattern: exercise.movementPattern,
                  sortOrder: index + 1,
                  targetSets: exercise.targetSets,
                  targetRepMin: exercise.targetRepMin,
                  targetRepMax: exercise.targetRepMax,
                  targetRpeMin: exercise.targetRpeMin,
                  targetRpeMax: exercise.targetRpeMax,
                  restSeconds: exercise.restSeconds,
                  advancedTechnique: exercise.advancedTechnique,
                  substitutionHints,
                };
              }),
            },
          })),
        },
        coachBrainEntries: {
          create: {
            aiRunLogId,
            version: nextBrainVersion,
            hypotheses: {
              hypotheses: plan.coachBrain.hypotheses,
              rationale: plan.coachBrain.rationale,
              nextCycleWatchouts: plan.coachBrain.nextCycleWatchouts,
            } as unknown as Prisma.InputJsonValue,
            retrospective: plan.coachBrain.retrospective as unknown as Prisma.InputJsonValue,
          },
        },
      },
      include: {
        weeks: true,
        workoutDays: {
          include: {
            prescriptions: true,
          },
        },
        coachBrainEntries: true,
      },
    });

    return createdPlan;
  });
}

/**
 * Retrieves the currently active mesocycle plan for the given athlete.
 */
export async function getLatestActiveMesocycle(athleteProfileId: string) {
  return await prisma.mesocyclePlan.findFirst({
    where: {
      athleteProfileId,
      status: 'active',
    },
    orderBy: {
      createdAt: 'desc',
    },
    include: {
      weeks: {
        orderBy: {
          weekNumber: 'asc',
        },
      },
      workoutDays: {
        orderBy: {
          dayOrder: 'asc',
        },
        include: {
          prescriptions: {
            orderBy: {
              sortOrder: 'asc',
            },
          },
        },
      },
      coachBrainEntries: {
        orderBy: {
          createdAt: 'desc',
        },
        take: 1,
      },
    },
  });
}
