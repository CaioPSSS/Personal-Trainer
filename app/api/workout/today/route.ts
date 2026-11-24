import { NextRequest, NextResponse, after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAuthorized, unauthorizedResponse } from '@/lib/auth';
import { todayISO, isISODate, diffISODaysSigned } from '@/lib/dates';
import {
  applyDeloadToPrescription,
  calculateProgressiveOverload,
  isCompoundExercise,
  roundToHalfKg,
  ExercisePreviousPerformanceData,
  PreviousExercisePerformance,
} from '@/lib/progression/load-calculator';
import {
  calculateStrengthCalories,
  resolveAthleteWeightKg,
  StrengthCalorieResult,
} from '@/lib/calories';
import {
  syncDayToMetabolicTracker,
  fetchDailyNutrition,
} from '@/lib/integrations/metabolic-tracker';
import { isSameExerciseName, normalizeTextKey } from '@/lib/ai/exercise-swap';
import { fetchHybridCoachingContext } from '@/lib/ai/hybrid-context';

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
  if (!isAuthorized(request)) {
    return unauthorizedResponse();
  }

  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || todayISO();

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

    // 3. Check if there is a strength workout scheduled on the calendar for this date!
    const calendarStrengthEvent = await prisma.calendarEvent.findFirst({
      where: {
        athleteProfileId: 'singleton',
        date: date,
        eventType: 'strength',
      },
      orderBy: { sortOrder: 'asc' },
    });

    let workoutToday: (typeof dayTemplates)[0] | null = null;

    if (calendarStrengthEvent) {
      if (calendarStrengthEvent.referenceId) {
        workoutToday = dayTemplates.find((t) => t.id === calendarStrengthEvent.referenceId) || null;
      }
      if (!workoutToday && calendarStrengthEvent.title) {
        workoutToday =
          dayTemplates.find(
            (t) => t.label.trim().toLowerCase() === calendarStrengthEvent.title.trim().toLowerCase()
          ) || null;
      }
    }

    // If not found on calendar for this date, predict next template from completed workouts
    if (!workoutToday) {
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

        const templateId =
          lastWorkout?.workoutDayTemplateId ||
          lastWorkout?.exerciseExecutions[0]?.exercisePrescription?.workoutDayTemplateId;
        if (templateId) {
          const lastTemplate = dayTemplates.find((t) => t.id === templateId);
          if (lastTemplate) {
            predictedDayOrder = (lastTemplate.dayOrder % dayTemplates.length) + 1;
          }
        }
      }

      workoutToday = dayTemplates.find((t) => t.dayOrder === predictedDayOrder) || dayTemplates[0];
    }

    // 4. Determine if it's a deload week BEFORE calculating overload & prescription targets
    const weeks = await prisma.mesocycleWeek.findMany({
      where: { mesocyclePlanId: activePlan.id },
      orderBy: { weekNumber: 'asc' },
    });

    const startISO =
      activePlan.startDate && isISODate(activePlan.startDate)
        ? activePlan.startDate
        : todayISO(activePlan.createdAt);
    const daysSinceStart = Math.max(0, diffISODaysSigned(date, startISO));
    const totalWeeks = activePlan.durationWeeks || weeks.length || 1;
    const currentWeekNumber = Math.min(totalWeeks, Math.max(1, Math.floor(daysSinceStart / 7) + 1));
    const currentWeekData =
      weeks.find((w) => w.weekNumber === currentWeekNumber) || weeks[weeks.length - 1];
    const isDeload = Boolean(currentWeekData?.isDeload);

    // 5. Fetch recent historical executions ONCE (accent-insensitive) & compute progression for ALL templates
    const previousPerformances: Record<string, string> = {};
    const progressionData: Record<string, ExercisePreviousPerformanceData> = {};

    const allPrescriptions = dayTemplates.flatMap((t) => t.prescriptions);
    if (allPrescriptions.length > 0) {
      const historicalExecutions = await prisma.exerciseExecution.findMany({
        where: {
          workoutExecution: {
            athleteProfileId: 'singleton',
            status: 'completed',
            date: { lt: date },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 400,
        include: { setExecutions: true },
      });

      const latestByNormalizedName = new Map<string, (typeof historicalExecutions)[number]>();
      for (const exec of historicalExecutions) {
        const key = normalizeTextKey(exec.exerciseName);
        if (key && !latestByNormalizedName.has(key)) {
          latestByNormalizedName.set(key, exec);
        }
      }

      for (const rx of allPrescriptions) {
        const lastExec = latestByNormalizedName.get(normalizeTextKey(rx.exerciseName));

        if (lastExec && lastExec.setExecutions.length > 0) {
          const validSets = lastExec.setExecutions.filter((s) => s.reps > 0);
          const bestSet =
            validSets.length > 0
              ? validSets.reduce((prev, current) =>
                  (current.loadKg || 0) > (prev.loadKg || 0) ? current : prev
                )
              : lastExec.setExecutions[0];

          previousPerformances[rx.id] = `${bestSet.loadKg || 0}kg x ${bestSet.reps} reps (RPE ${bestSet.rpe ?? '?'})`;

          const effectiveRx = applyDeloadToPrescription(rx, isDeload);
          const isCompound = isCompoundExercise(rx.exerciseName, rx.movementPattern);
          const perfInput: PreviousExercisePerformance = {
            exerciseName: rx.exerciseName,
            movementPattern: rx.movementPattern,
            isCompound,
            targetRepMin: rx.targetRepMin || 8,
            targetRepMax: rx.targetRepMax || 12,
            targetRpeMin: effectiveRx.targetRpeMin ?? 7,
            targetRpeMax: effectiveRx.targetRpeMax ?? 8.5,
            isDeload,
            completedSets: lastExec.setExecutions.map((s) => ({
              setNumber: s.setNumber,
              loadKg: s.loadKg || 0,
              reps: s.reps || 0,
              rpe: s.rpe,
              isFailure: s.isFailure,
            })),
          };

          const prog = calculateProgressiveOverload(perfInput);

          progressionData[rx.id] = {
            lastLoadKg: prog.previousMaxLoadKg,
            suggestedLoadKg: prog.suggestedLoadKg,
            deltaKg: prog.deltaKg,
            lastReps: bestSet.reps,
            lastRpe: bestSet.rpe ?? null,
            action: prog.action,
            reason: prog.progressionReason,
            progressionReason: prog.progressionReason,
          };
        } else {
          progressionData[rx.id] = {
            lastLoadKg: 0,
            suggestedLoadKg: 0,
            deltaKg: 0,
            lastReps: 0,
            lastRpe: null,
            action: 'maintain',
            reason: 'Primeira execução do exercício. Defina a carga inicial.',
            progressionReason: 'Primeira execução do exercício. Defina a carga inicial.',
          };
        }
      }
    }

    // 6. Fetch existing local wellness, workout & hybrid readiness (non-blocking refresh via after())
    const [existingWellness, existingWorkout, hybridContext] = await Promise.all([
      prisma.wellnessDaily.findUnique({
        where: { athleteProfileId_date: { athleteProfileId: 'singleton', date } },
      }),
      prisma.workoutExecution.findFirst({
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
      }),
      fetchHybridCoachingContext(date),
    ]);

    if (
      !existingWellness ||
      existingWellness.sleepHours == null ||
      existingWellness.bodyWeightKg == null ||
      existingWellness.stressLevel == null
    ) {
      after(async () => {
        try {
          await fetchDailyNutrition(date);
        } catch {
          // Silently ignore background refresh failures
        }
      });
    }

    const effectiveTemplates = isDeload
      ? dayTemplates.map((tmpl) => ({
          ...tmpl,
          prescriptions: tmpl.prescriptions.map((rx) => applyDeloadToPrescription(rx, true)),
        }))
      : dayTemplates;

    const effectiveWorkoutToday = workoutToday
      ? isDeload
        ? {
            ...workoutToday,
            prescriptions: workoutToday.prescriptions.map((rx) =>
              applyDeloadToPrescription(rx, true)
            ),
          }
        : workoutToday
      : null;

    return NextResponse.json({
      active: true,
      mesocyclePlanId: activePlan.id,
      mesocycleObjective: activePlan.objective,
      workoutToday: effectiveWorkoutToday,
      templates: effectiveTemplates,
      existingWellness,
      existingWorkout,
      previousPerformances,
      progressionData,
      previousPerformance: progressionData,
      isDeload,
      currentWeekNumber,
      readiness: hybridContext.readinessSummary,
      weekRules: {
        targetVolume: currentWeekData?.targetVolume ?? null,
        intensityRules: currentWeekData?.intensityRules ?? null,
      },
      scheduledCalendarEvent: calendarStrengthEvent
        ? {
            id: calendarStrengthEvent.id,
            title: calendarStrengthEvent.title,
            status: calendarStrengthEvent.status,
            referenceId: calendarStrengthEvent.referenceId,
          }
        : null,
    });
  } catch (error) {
    console.error('Falha ao obter treino do dia.', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const { date, wellness, mesocyclePlanId } = body;
    const workout: WorkoutPayload | undefined = body.workout;

    if (!date) {
      return NextResponse.json({ error: 'Missing date field.' }, { status: 400 });
    }

    let createdWorkoutExecutionId: string | null = null;
    let calculatedCalories: StrengthCalorieResult | null = null;

    const hasCompletedExercises = Boolean(
      workout &&
      Array.isArray(workout.exercises) &&
      workout.exercises.length > 0 &&
      workout.exercises.some((ex: WorkoutExercisePayload) =>
        Array.isArray(ex.sets) &&
        ex.sets.some((set: WorkoutSetPayload) => set.reps != null && Number(set.reps) > 0)
      )
    );

    if (workout != null && !hasCompletedExercises) {
      return NextResponse.json(
        { error: 'Nenhuma série válida com repetições (> 0) foi informada para o treino.' },
        { status: 400 }
      );
    }

    if (hasCompletedExercises && workout) {
      // Resolve athlete weight for the workout date
      const athleteWeightKg = await resolveAthleteWeightKg('singleton', date);

      // Calculate strength training caloric expenditure
      calculatedCalories = calculateStrengthCalories({
        athleteWeightKg,
        durationMinutes: workout.durationMinutes ? parseInt(String(workout.durationMinutes)) : 60,
        sessionRpe: workout.sessionRpe ? parseFloat(String(workout.sessionRpe)) : 7.5,
        exercises: workout.exercises.map((ex: WorkoutExercisePayload) => ({
          exerciseName: ex.exerciseName,
          movementPattern: ex.movementPattern,
          sets: ex.sets.map((set: WorkoutSetPayload) => ({
            setNumber: parseInt(String(set.setNumber)),
            reps: parseInt(String(set.reps)) || 0,
            loadKg: set.loadKg != null ? parseFloat(String(set.loadKg)) : null,
            rpe: set.rpe != null ? parseFloat(String(set.rpe)) : null,
          })),
        })),
      });
    }

    await prisma.$transaction(async (tx) => {
      // 1. Upsert Wellness log if provided
      if (wellness) {
        await tx.wellnessDaily.upsert({
          where: { athleteProfileId_date: { athleteProfileId: 'singleton', date } },
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

      // 2. Overwrite Workout execution if provided and has completed exercises
      if (hasCompletedExercises && workout) {
        // Delete any existing workout executions on the same date
        await tx.workoutExecution.deleteMany({
          where: {
            athleteProfileId: 'singleton',
            date,
          },
        });

        // Create the new WorkoutExecution with its exercises, sets, and calories
        const workoutExecution = await tx.workoutExecution.create({
          data: {
            athleteProfileId: 'singleton',
            mesocyclePlanId: mesocyclePlanId || null,
            workoutDayTemplateId: workout.workoutDayTemplateId || null,
            date,
            status: 'completed',
            sessionRpe: workout.sessionRpe ? parseFloat(String(workout.sessionRpe)) : null,
            durationMinutes: workout.durationMinutes ? parseInt(String(workout.durationMinutes)) : null,
            caloriesBurned: calculatedCalories?.totalCalories ?? null,
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

        createdWorkoutExecutionId = workoutExecution.id;

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
            caloriesBurned: calculatedCalories?.totalCalories ?? null,
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
                caloriesBurned: calculatedCalories?.totalCalories ?? null,
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
                caloriesBurned: calculatedCalories?.totalCalories ?? null,
              },
            });
          }
        }
      }
    });

    // 3. Sincroniza o dia consolidado (soma de todas as atividades) com o Meu Rastreador Metabólico via after()
    after(async () => {
      try {
        await syncDayToMetabolicTracker(date, {
          sleepHours: wellness?.sleepHours ? parseFloat(String(wellness.sleepHours)) : undefined,
          bodyWeightKg: wellness?.bodyWeightKg ? parseFloat(String(wellness.bodyWeightKg)) : undefined,
          stressLevel: wellness?.stressLevel ? parseInt(String(wellness.stressLevel)) : undefined,
        });
      } catch (err) {
        console.warn('[MetabolicSync] Falha no sync consolidado com Rastreador:', err);
      }
    });

    if (!hasCompletedExercises || !workout) {
      return NextResponse.json({
        success: true,
        message: 'Métricas de recuperação salvas e sincronizadas com sucesso!',
      });
    }

    // 4. Calculate session summary metrics
    let totalTonnage = 0;
    let validSetsCount = 0;
    let rpeSum = 0;
    let rpeCount = 0;
    let legSetsCount = 0;
    let upperSetsCount = 0;

    const lowerBodyPatterns = ['squat', 'hinge', 'lunge', 'knee_extension', 'knee_flexion', 'calf_raise', 'hip_thrust'];
    const lowerBodyKeywords = [
      'agachamento', 'leg press', 'hack', 'stiff', 'terra', 'deadlift',
      'extensora', 'flexora', 'panturrilha', 'afundo', 'passada',
      'bulgaro', 'bulgarian', 'gluteo', 'quadriceps'
    ];

    for (const ex of workout.exercises) {
      const normName = (ex.exerciseName || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const normPattern = (ex.movementPattern || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const isLeg = lowerBodyPatterns.some((p) => normPattern.includes(p)) || lowerBodyKeywords.some((kw) => normName.includes(kw));

      for (const s of ex.sets) {
        const load = s.loadKg ? parseFloat(String(s.loadKg)) : 0;
        const reps = parseInt(String(s.reps)) || 0;
        if (reps > 0) {
          validSetsCount++;
          if (load > 0) {
            totalTonnage += load * reps;
          }
          if (isLeg) {
            legSetsCount++;
          } else {
            upperSetsCount++;
          }
          if (s.rpe) {
            const rpeVal = parseFloat(String(s.rpe));
            if (!isNaN(rpeVal) && rpeVal > 0) {
              rpeSum += rpeVal;
              rpeCount++;
            }
          }
        }
      }
    }
    totalTonnage = Math.round(totalTonnage * 10) / 10;

    let averageRpe: number | null = null;
    if (rpeCount > 0) {
      averageRpe = Math.round((rpeSum / rpeCount) * 10) / 10;
    } else if (workout.sessionRpe) {
      const sessRpe = parseFloat(String(workout.sessionRpe));
      if (!isNaN(sessRpe) && sessRpe > 0) {
        averageRpe = Math.round(sessRpe * 10) / 10;
      }
    }

    const durationMinutes = workout.durationMinutes ? parseInt(String(workout.durationMinutes)) : 60;

    // 5. Query previous session for the same workout template
    let templateId = workout.workoutDayTemplateId || null;
    if (!templateId && workout.exercises.length > 0) {
      const firstRxId = workout.exercises.find((e) => e.exercisePrescriptionId)?.exercisePrescriptionId;
      if (firstRxId) {
        const rx = await prisma.exercisePrescription.findUnique({
          where: { id: firstRxId },
          select: { workoutDayTemplateId: true },
        });
        if (rx?.workoutDayTemplateId) {
          templateId = rx.workoutDayTemplateId;
        }
      }
    }

    let previousWorkout = null;
    if (templateId) {
      previousWorkout = await prisma.workoutExecution.findFirst({
        where: {
          athleteProfileId: 'singleton',
          status: 'completed',
          id: { not: createdWorkoutExecutionId || undefined },
          exerciseExecutions: {
            some: {
              exercisePrescription: {
                workoutDayTemplateId: templateId,
              },
            },
          },
        },
        orderBy: [
          { date: 'desc' },
          { createdAt: 'desc' },
        ],
        include: {
          exerciseExecutions: {
            include: {
              setExecutions: true,
            },
          },
        },
      });
    }

    if (!previousWorkout && workout.exercises.length > 0) {
      const exerciseNames = workout.exercises.map((e) => e.exerciseName);
      previousWorkout = await prisma.workoutExecution.findFirst({
        where: {
          athleteProfileId: 'singleton',
          status: 'completed',
          id: { not: createdWorkoutExecutionId || undefined },
          exerciseExecutions: {
            some: {
              exerciseName: { in: exerciseNames },
            },
          },
        },
        orderBy: [
          { date: 'desc' },
          { createdAt: 'desc' },
        ],
        include: {
          exerciseExecutions: {
            include: {
              setExecutions: true,
            },
          },
        },
      });
    }

    let previousTonnage: number | null = null;
    let tonnageDeltaPercent: number | null = null;

    if (previousWorkout && previousWorkout.exerciseExecutions.length > 0) {
      let prevSum = 0;
      for (const pEx of previousWorkout.exerciseExecutions) {
        for (const pSet of pEx.setExecutions) {
          const pLoad = pSet.loadKg || 0;
          const pReps = pSet.reps || 0;
          if (pLoad > 0 && pReps > 0) {
            prevSum += pLoad * pReps;
          }
        }
      }
      if (prevSum > 0) {
        previousTonnage = Math.round(prevSum * 10) / 10;
        if (previousTonnage > 0) {
          tonnageDeltaPercent = Math.round(((totalTonnage - previousTonnage) / previousTonnage) * 1000) / 10;
        }
      }
    }

    // 6. Detect Personal Records (PRs) with a single batched historical query
    interface PersonalRecordItem {
      exerciseName: string;
      metric: 'load' | 'volume';
      currentValue: number;
      previousBest: number;
      unit: 'kg' | 'kg-total';
    }

    const personalRecords: PersonalRecordItem[] = [];

    const allHistoricalExecs =
      workout.exercises.length > 0
        ? await prisma.exerciseExecution.findMany({
            where: {
              workoutExecution: {
                athleteProfileId: 'singleton',
                status: 'completed',
                id: { not: createdWorkoutExecutionId || undefined },
              },
            },
            orderBy: { createdAt: 'desc' },
            take: 400,
            include: {
              setExecutions: true,
            },
          })
        : [];

    for (const ex of workout.exercises) {
      const currentSetsWithLoad = ex.sets.filter(
        (s) => (parseFloat(String(s.loadKg)) || 0) > 0 && (parseInt(String(s.reps)) || 0) > 0
      );
      if (currentSetsWithLoad.length === 0) continue;

      const currentMaxLoad = Math.max(...currentSetsWithLoad.map((s) => parseFloat(String(s.loadKg)) || 0));
      const currentVolume = currentSetsWithLoad.reduce(
        (sum, s) => sum + (parseFloat(String(s.loadKg)) || 0) * (parseInt(String(s.reps)) || 0),
        0
      );

      // Compare strictly against the exact performed exercise (accent-insensitive), never mixing substitutedFrom
      const historicalExecs = allHistoricalExecs.filter((h) =>
        isSameExerciseName(h.exerciseName, ex.exerciseName)
      );

      if (historicalExecs.length > 0) {
        let historicalMaxLoad = 0;
        let historicalMaxVolume = 0;

        for (const hExec of historicalExecs) {
          let execVolume = 0;
          for (const s of hExec.setExecutions) {
            const l = s.loadKg || 0;
            const r = s.reps || 0;
            if (l > historicalMaxLoad) {
              historicalMaxLoad = l;
            }
            if (l > 0 && r > 0) {
              execVolume += l * r;
            }
          }
          if (execVolume > historicalMaxVolume) {
            historicalMaxVolume = execVolume;
          }
        }

        // Check Load PR
        if (currentMaxLoad > historicalMaxLoad && historicalMaxLoad > 0) {
          personalRecords.push({
            exerciseName: ex.exerciseName,
            metric: 'load',
            currentValue: roundToHalfKg(currentMaxLoad),
            previousBest: roundToHalfKg(historicalMaxLoad),
            unit: 'kg',
          });
        }

        // Check Volume PR
        if (currentVolume > historicalMaxVolume && historicalMaxVolume > 0) {
          personalRecords.push({
            exerciseName: ex.exerciseName,
            metric: 'volume',
            currentValue: Math.round(currentVolume * 10) / 10,
            previousBest: Math.round(historicalMaxVolume * 10) / 10,
            unit: 'kg-total',
          });
        }
      }
    }

    // 7. Factual multi-sport recovery guidance
    interface RecoveryGuidance {
      hours: number;
      muscleGroups: string[];
      guidanceText: string;
    }

    let recovery: RecoveryGuidance;
    if (legSetsCount > 0 && legSetsCount >= upperSetsCount) {
      recovery = {
        hours: 48,
        muscleGroups: ['inferiores', 'pernas'],
        guidanceText: `Treino de inferiores concluído com ${legSetsCount} séries pesadas. Janela ideal: 48h de recuperação muscular antes de treinos longos de corrida ou CrossFit intenso.`,
      };
    } else if (legSetsCount > 0 && upperSetsCount > 0) {
      recovery = {
        hours: 48,
        muscleGroups: ['full_body', 'corpo_inteiro'],
        guidanceText: `Treino Full Body concluído (${validSetsCount} séries). Janela recomendada: 48h de recuperação muscular antes de treinos de endurance ou alta intensidade.`,
      };
    } else {
      recovery = {
        hours: 36,
        muscleGroups: ['superiores', 'peito_costas_bracos'],
        guidanceText: `Treino de membros superiores finalizado (${upperSetsCount || validSetsCount} séries). Corrida leve ou moderada liberada para amanhã sem conflito mecânico.`,
      };
    }

    return NextResponse.json({
      success: true,
      summary: {
        totalTonnage,
        previousTonnage,
        tonnageDeltaPercent,
        personalRecords,
        averageRpe,
        durationMinutes,
        validSetsCount,
        completedSetsCount: validSetsCount,
        caloriesBurned: calculatedCalories?.totalCalories ?? null,
        calorieBreakdown: calculatedCalories
          ? {
              mechanicalWorkCalories: calculatedCalories.mechanicalWorkCalories,
              interSetCalories: calculatedCalories.interSetCalories,
              epocCalories: calculatedCalories.epocCalories,
              epocFactor: calculatedCalories.epocFactor,
              perExercise: calculatedCalories.perExercise,
            }
          : null,
        recoveryGuidance: recovery.guidanceText,
        recovery,
      },
    });
  } catch (error) {
    console.error('Falha ao registrar dados de treino.', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
