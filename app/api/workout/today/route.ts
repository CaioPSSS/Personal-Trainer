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

interface WorkoutPayload {
  workoutDayTemplateId?: string | null;
  name?: string | null;
  sessionRpe?: string | number | null;
  durationMinutes?: string | number | null;
  notes?: string | null;
  exercises: WorkoutExercisePayload[];
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
        }
      }
    }

    const workoutToday = dayTemplates.find((t) => t.dayOrder === predictedDayOrder) || dayTemplates[0];

    // 4. Fetch previous performances for workoutToday prescriptions
    const previousPerformances: Record<string, string> = {};
    if (workoutToday) {
      for (const rx of workoutToday.prescriptions) {
        const lastExec = await prisma.exerciseExecution.findFirst({
          where: {
            exerciseName: rx.exerciseName,
            workoutExecution: {
              athleteProfileId: 'singleton',
              status: 'completed',
              date: { lt: date }
            }
          },
          orderBy: { createdAt: 'desc' },
          include: { setExecutions: true }
        });

        if (lastExec && lastExec.setExecutions.length > 0) {
          const bestSet = lastExec.setExecutions.reduce((prev, current) => 
            ((current.loadKg || 0) > (prev.loadKg || 0)) ? current : prev
          );
          previousPerformances[rx.id] = `${bestSet.loadKg || 0}kg x ${bestSet.reps} reps (RPE ${bestSet.rpe || '?'})`;
        }
      }
    }

    // 5. Determine if it's a deload week
    const weeks = await prisma.mesocycleWeek.findMany({
      where: { mesocyclePlanId: activePlan.id },
      orderBy: { weekNumber: 'asc' }
    });
    
    const daysSinceStart = Math.floor((new Date(date).getTime() - new Date(activePlan.createdAt).getTime()) / (1000 * 60 * 60 * 24));
    const currentWeekNumber = Math.max(1, Math.floor(daysSinceStart / 7) + 1);
    const currentWeekData = weeks.find(w => w.weekNumber === currentWeekNumber) || weeks[weeks.length - 1];
    const isDeload = currentWeekData?.isDeload || false;

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
      previousPerformances,
      isDeload,
      currentWeekNumber,
    });
  } catch (error) {
    console.error('Falha ao obter treino do dia.', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { date, wellness, mesocyclePlanId } = body;
    const workout: WorkoutPayload | undefined = body.workout;

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
        const workoutExecution = await tx.workoutExecution.create({
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

        // 3. Sync CalendarEvent on workout completion
        let workoutTitle = workout.name || 'Treino de Força';
        if (workout.workoutDayTemplateId) {
          const t = await tx.workoutDayTemplate.findUnique({
            where: { id: workout.workoutDayTemplateId },
          });
          if (t?.label) {
            workoutTitle = t.label;
          }
        } else if (workout.exercises && workout.exercises.length > 0) {
          const firstRxId = workout.exercises.find((e: WorkoutExercisePayload) => e.exercisePrescriptionId)?.exercisePrescriptionId;
          if (firstRxId) {
            const rx = await tx.exercisePrescription.findUnique({
              where: { id: firstRxId },
              include: { workoutDayTemplate: true },
            });
            if (rx?.workoutDayTemplate?.label) {
              workoutTitle = rx.workoutDayTemplate.label;
            }
          }
        }

        // Mark any existing planned CalendarEvent on that date as completed
        const plannedUpdated = await tx.calendarEvent.updateMany({
          where: {
            athleteProfileId: 'singleton',
            date,
            eventType: 'strength',
            status: 'planned',
          },
          data: {
            status: 'completed',
            referenceModel: 'WorkoutExecution',
            referenceId: workoutExecution.id,
            title: workoutTitle,
          },
        });

        // If no planned event was updated, check if an existing strength event exists on this date
        if (plannedUpdated.count === 0) {
          const existingEvent = await tx.calendarEvent.findFirst({
            where: {
              athleteProfileId: 'singleton',
              date,
              eventType: 'strength',
            },
          });

          if (existingEvent) {
            await tx.calendarEvent.update({
              where: { id: existingEvent.id },
              data: {
                status: 'completed',
                referenceModel: 'WorkoutExecution',
                referenceId: workoutExecution.id,
                title: workoutTitle,
              },
            });
          } else {
            await tx.calendarEvent.create({
              data: {
                athleteProfileId: 'singleton',
                date,
                eventType: 'strength',
                referenceModel: 'WorkoutExecution',
                referenceId: workoutExecution.id,
                title: workoutTitle,
                status: 'completed',
              },
            });
          }
        }
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Falha ao registrar dados de treino.', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
