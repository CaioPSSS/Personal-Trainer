import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

interface WorkoutSetPayload {
  setNumber: number;
  loadKg?: string | number | null;
  reps: string | number;
  rpe?: string | number | null;
  isFailure?: boolean;
  restSeconds?: string | number | null;
}

interface WorkoutExercisePayload {
  exercisePrescriptionId?: string | null;
  exerciseName: string;
  movementPattern?: string | null;
  sortOrder: number;
  notes?: string | null;
  substitutedFrom?: string | null;
  sets: WorkoutSetPayload[];
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

    // 1. Fetch active mesocycle plan
    const activePlan = await prisma.mesocyclePlan.findFirst({
      where: {
        athleteProfileId: 'singleton',
        status: 'active',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!activePlan) {
      return NextResponse.json({ active: false, message: 'Nenhum mesociclo ativo encontrado.' });
    }

    // 2. Fetch all templates in the mesocycle
    const dayTemplates = await prisma.workoutDayTemplate.findMany({
      where: {
        mesocyclePlanId: activePlan.id,
      },
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
    });

    if (dayTemplates.length === 0) {
      return NextResponse.json({ active: true, workoutToday: null, templates: [] });
    }

    // 3. Find completed workouts to predict next template
    const completedWorkouts = await prisma.workoutExecution.findMany({
      where: {
        athleteProfileId: 'singleton',
        mesocyclePlanId: activePlan.id,
        status: 'completed',
      },
      orderBy: {
        date: 'desc',
      },
    });

    let predictedDayOrder = 1;
    if (completedWorkouts.length > 0) {
      // Find the last completed workout execution details
      const lastWorkout = await prisma.workoutExecution.findFirst({
        where: {
          athleteProfileId: 'singleton',
          mesocyclePlanId: activePlan.id,
          status: 'completed',
        },
        orderBy: {
          date: 'desc',
        },
        include: {
          exerciseExecutions: {
            take: 1,
            include: {
              exercisePrescription: true,
            },
          },
        },
      });

      const templateId = lastWorkout?.exerciseExecutions[0]?.exercisePrescription?.workoutDayTemplateId;
      if (templateId) {
        const lastTemplate = dayTemplates.find((t) => t.id === templateId);
        if (lastTemplate) {
          predictedDayOrder = (lastTemplate.dayOrder % dayTemplates.length) + 1;
        } else {
          predictedDayOrder = (completedWorkouts.length % dayTemplates.length) + 1;
        }
      } else {
        predictedDayOrder = (completedWorkouts.length % dayTemplates.length) + 1;
      }
    }

    const workoutToday = dayTemplates.find((t) => t.dayOrder === predictedDayOrder) || dayTemplates[0];

    // 4. Fetch existing logs for this date (if already executed or wellness captured)
    const existingWellness = await prisma.wellnessDaily.findUnique({
      where: { date },
    });

    const existingWorkout = await prisma.workoutExecution.findFirst({
      where: {
        athleteProfileId: 'singleton',
        date,
      },
      include: {
        exerciseExecutions: {
          include: {
            setExecutions: true,
          },
        },
      },
    });

    return NextResponse.json({
      active: true,
      mesocyclePlanId: activePlan.id,
      workoutToday,
      templates: dayTemplates,
      existingWellness,
      existingWorkout,
    });
  } catch (error) {
    console.error('Falha ao obter treino do dia.', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { date, wellness, workout, mesocyclePlanId } = body;

    if (!date) {
      return NextResponse.json({ error: 'Missing date field.' }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      // 1. Upsert Wellness log if provided
      if (wellness) {
        await tx.wellnessDaily.upsert({
          where: { date },
          update: {
            sleepHours: wellness.sleepHours ? parseFloat(String(wellness.sleepHours)) : null,
            fatigueLevel: wellness.fatigueLevel ? parseInt(String(wellness.fatigueLevel)) : null,
            sorenessLevel: wellness.sorenessLevel ? parseInt(String(wellness.sorenessLevel)) : null,
            energyLevel: wellness.energyLevel ? parseInt(String(wellness.energyLevel)) : null,
            stressLevel: wellness.stressLevel ? parseInt(String(wellness.stressLevel)) : null,
            bodyWeightKg: wellness.bodyWeightKg ? parseFloat(String(wellness.bodyWeightKg)) : null,
            notes: wellness.notes || null,
          },
          create: {
            date,
            athleteProfileId: 'singleton',
            sleepHours: wellness.sleepHours ? parseFloat(String(wellness.sleepHours)) : null,
            fatigueLevel: wellness.fatigueLevel ? parseInt(String(wellness.fatigueLevel)) : null,
            sorenessLevel: wellness.sorenessLevel ? parseInt(String(wellness.sorenessLevel)) : null,
            energyLevel: wellness.energyLevel ? parseInt(String(wellness.energyLevel)) : null,
            stressLevel: wellness.stressLevel ? parseInt(String(wellness.stressLevel)) : null,
            bodyWeightKg: wellness.bodyWeightKg ? parseFloat(String(wellness.bodyWeightKg)) : null,
            notes: wellness.notes || null,
          },
        });
      }

      // 2. Overwrite Workout execution if provided
      if (workout) {
        // Delete any existing workout executions on the same date
        await tx.workoutExecution.deleteMany({
          where: {
            athleteProfileId: 'singleton',
            date,
          },
        });

        // Create the new WorkoutExecution with its exercises and sets
        await tx.workoutExecution.create({
          data: {
            athleteProfileId: 'singleton',
            mesocyclePlanId: mesocyclePlanId || null,
            date,
            status: 'completed',
            sessionRpe: workout.sessionRpe ? parseFloat(String(workout.sessionRpe)) : null,
            durationMinutes: workout.durationMinutes ? parseInt(String(workout.durationMinutes)) : null,
            notes: workout.notes || null,
            exerciseExecutions: {
              create: workout.exercises.map((ex: WorkoutExercisePayload) => ({
                exercisePrescriptionId: ex.exercisePrescriptionId || null,
                exerciseName: ex.exerciseName,
                movementPattern: ex.movementPattern || null,
                sortOrder: parseInt(String(ex.sortOrder)) || 1,
                notes: ex.notes || null,
                substitutedFrom: ex.substitutedFrom || null,
                setExecutions: {
                  create: ex.sets.map((set: WorkoutSetPayload) => ({
                    setNumber: parseInt(String(set.setNumber)),
                    loadKg: set.loadKg ? parseFloat(String(set.loadKg)) : null,
                    reps: parseInt(String(set.reps)) || 0,
                    rpe: set.rpe ? parseFloat(String(set.rpe)) : null,
                    isFailure: !!set.isFailure,
                    restSeconds: set.restSeconds ? parseInt(String(set.restSeconds)) : null,
                  })),
                },
              })),
            },
          },
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Falha ao registrar dados de treino.', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
