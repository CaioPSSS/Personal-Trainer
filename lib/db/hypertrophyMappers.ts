import { prisma } from '../prisma';
import { MasterPlanOutput } from '../ai/contracts';
import { Prisma } from '@prisma/client';

/**
 * Saves a generated hypertrophy mesocycle plan structure to the PostgreSQL database,
 * archiving previous active mesocycles for the same athlete, all within a transaction.
 */
export async function saveMasterPlanToDb(
  athleteProfileId: string,
  plan: MasterPlanOutput,
  aiRunLogId?: string
) {
  return await prisma.$transaction(async (tx) => {
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

    const today = new Date();
    const startDate = today.toISOString().split('T')[0];
    const endDate = new Date(today.getTime() + plan.mesocycle.durationWeeks * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // 2. Create the new MesocyclePlan and all dependent entities
    const createdPlan = await tx.mesocyclePlan.create({
      data: {
        athleteProfileId,
        title: plan.mesocycle.title,
        objective: plan.mesocycle.objective,
        split: plan.mesocycle.split,
        durationWeeks: plan.mesocycle.durationWeeks,
        targetSessionMinutes: plan.mesocycle.targetSessionMinutes,
        startDate,
        endDate,
        status: 'active',
        rawPlan: plan as unknown as Prisma.InputJsonValue, // Raw JSON payload representation
        createdByAiRunId: aiRunLogId,
        weeks: {
          create: plan.mesocycle.weeks.map((week) => ({
            weekNumber: week.weekNumber,
            isDeload: week.isDeload,
            targetVolume: { notes: week.targetVolumeNotes } as unknown as Prisma.InputJsonValue,
          })),
        },
        workoutDays: {
          create: plan.mesocycle.days.map((day) => ({
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
        coachBrainEntries: {
          create: {
            aiRunLogId,
            version: 1,
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
