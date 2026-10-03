import { prisma } from '../lib/prisma';
import {
  calculateStrengthCalories,
  calculateRunningCalories,
  calculateCrossTrainingCalories,
  resolveAthleteWeightKg,
} from '../lib/calories';

async function backfillCalories() {
  console.log('--- Iniciando Backfill de Calorias Retroativo ---');

  // 1. WorkoutExecutions (Musculação)
  const workouts = await prisma.workoutExecution.findMany({
    where: {
      caloriesBurned: null,
    },
    include: {
      exerciseExecutions: {
        include: {
          setExecutions: true,
        },
      },
    },
  });

  console.log(`Encontrados ${workouts.length} treinos de musculação sem calorias.`);
  let workoutsUpdated = 0;

  for (const w of workouts) {
    const athleteWeight = await resolveAthleteWeightKg(w.athleteProfileId, w.date);
    const result = calculateStrengthCalories({
      athleteWeightKg: athleteWeight,
      durationMinutes: w.durationMinutes || 60,
      sessionRpe: w.sessionRpe || 7.5,
      exercises: w.exerciseExecutions.map((ex) => ({
        exerciseName: ex.exerciseName,
        movementPattern: ex.movementPattern,
        sets: ex.setExecutions.map((s) => ({
          setNumber: s.setNumber,
          reps: s.reps,
          loadKg: s.loadKg,
          rpe: s.rpe,
        })),
      })),
    });

    await prisma.workoutExecution.update({
      where: { id: w.id },
      data: { caloriesBurned: result.totalCalories },
    });

    await prisma.calendarEvent.updateMany({
      where: {
        referenceId: w.id,
        referenceModel: 'WorkoutExecution',
      },
      data: {
        caloriesBurned: result.totalCalories,
      },
    });

    workoutsUpdated++;
  }
  console.log(`✓ ${workoutsUpdated} treinos de musculação atualizados.`);

  // 2. RunningExecutions (Corrida)
  const runs = await prisma.runningExecution.findMany({
    where: {
      caloriesBurned: null,
    },
  });

  console.log(`Encontradas ${runs.length} corridas sem calorias.`);
  let runsUpdated = 0;

  for (const r of runs) {
    const athleteWeight = await resolveAthleteWeightKg(r.runningProfileId, r.date);
    const result = calculateRunningCalories({
      athleteWeightKg: athleteWeight,
      distanceKm: r.distanceKm,
      elevationGainM: r.elevationGainM,
      durationSeconds: r.durationSeconds,
      avgHeartRate: r.avgHeartRate,
    });

    await prisma.runningExecution.update({
      where: { id: r.id },
      data: { caloriesBurned: result.totalCalories },
    });

    await prisma.calendarEvent.updateMany({
      where: {
        referenceId: r.id,
        referenceModel: 'RunningExecution',
      },
      data: {
        caloriesBurned: result.totalCalories,
      },
    });

    runsUpdated++;
  }
  console.log(`✓ ${runsUpdated} corridas atualizadas.`);

  // 3. CrossTrainingActivities
  const crossActivities = await prisma.crossTrainingActivity.findMany({
    where: {
      caloriesBurned: null,
    },
  });

  console.log(`Encontradas ${crossActivities.length} atividades de cross-training sem calorias.`);
  let crossUpdated = 0;

  for (const c of crossActivities) {
    const athleteWeight = await resolveAthleteWeightKg(c.athleteProfileId, c.date);
    const result = calculateCrossTrainingCalories({
      athleteWeightKg: athleteWeight,
      durationMinutes: c.durationMinutes,
      activityType: c.activityType,
      sessionRpe: c.sessionRpe || 7.5,
    });

    await prisma.crossTrainingActivity.update({
      where: { id: c.id },
      data: { caloriesBurned: result.totalCalories },
    });

    await prisma.calendarEvent.updateMany({
      where: {
        referenceId: c.id,
        referenceModel: 'CrossTrainingActivity',
      },
      data: {
        caloriesBurned: result.totalCalories,
      },
    });

    crossUpdated++;
  }
  console.log(`✓ ${crossUpdated} atividades de cross-training atualizadas.`);

  console.log('--- Backfill de Calorias Concluído com Sucesso ---');
}

backfillCalories()
  .catch((e) => {
    console.error('Erro no backfill de calorias:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
