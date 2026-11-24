import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCompactAthleteProfile,
  buildCompactMesocycleSummary,
  buildConcurrentRunningDigest,
  buildWellnessNutritionDigest,
  buildWorkoutHistoryDigest,
} from './context-builders';

test('Context Builders: buildWorkoutHistoryDigest computes loadDelta, e1RM, and strips raw Prisma boilerplate', () => {
  const digest = buildWorkoutHistoryDigest([
    {
      date: '2026-11-10',
      durationMinutes: 60,
      sessionRpe: 8,
      caloriesBurned: 340,
      exerciseExecutions: [
        {
          exerciseName: 'Supino Inclinado com Halteres',
          movementPattern: 'horizontal_push',
          setExecutions: [
            { loadKg: 26, reps: 10, rpe: 8, isFailure: false },
            { loadKg: 26, reps: 9, rpe: 8.5, isFailure: false },
          ],
        },
      ],
    },
    {
      date: '2026-11-03',
      durationMinutes: 55,
      sessionRpe: 7.5,
      caloriesBurned: 310,
      exerciseExecutions: [
        {
          exerciseName: 'Supino Inclinado com Halteres',
          movementPattern: 'horizontal_push',
          setExecutions: [
            { loadKg: 24, reps: 10, rpe: 8, isFailure: false },
            { loadKg: 24, reps: 10, rpe: 8.5, isFailure: false },
          ],
        },
      ],
    },
  ]);

  assert.equal(digest.totalWorkouts, 2);
  assert.deepEqual(digest.dateRange, { from: '2026-11-03', to: '2026-11-10' });
  assert.equal(digest.exercises.length, 1);
  assert.equal(digest.exercises[0].loadDeltaKg, 2);
  assert.ok(digest.exercises[0].e1rmDeltaKg > 0);
  assert.equal(digest.exercises[0].sessionsCount, 2);
});

test('Context Builders: buildWellnessNutritionDigest aggregates sleep, protein/kg, caloric balance, and dietGoal', () => {
  const digest = buildWellnessNutritionDigest(
    [
      {
        date: '2026-11-18',
        sleepHours: 6.0,
        fatigueLevel: 7,
        stressLevel: 6,
        bodyWeightKg: 80.5,
        caloriesConsumed: 2100,
        calorieTarget: 2400,
        proteinConsumed: 160,
        dietGoal: 'loss',
      },
      {
        date: '2026-11-19',
        sleepHours: 7.0,
        fatigueLevel: 5,
        stressLevel: 4,
        bodyWeightKg: 80.0,
        caloriesConsumed: 2200,
        calorieTarget: 2400,
        proteinConsumed: 160,
        dietGoal: 'loss',
      },
    ],
    80
  );

  assert.equal(digest.daysLogged, 2);
  assert.equal(digest.avgSleepHours, 6.5);
  assert.equal(digest.minSleepHours, 6);
  assert.equal(digest.dominantDietGoal, 'loss');
  assert.equal(digest.avgCaloricBalanceKcal, -250);
  assert.equal(digest.proteinGramsPerKg, 2);
  assert.equal(digest.weightDeltaKg, -0.5);
});

test('Context Builders: buildConcurrentRunningDigest extracts active running load for Master Coach', () => {
  const digest = buildConcurrentRunningDigest({
    runningProfile: {
      primaryObjective: 'improve_5k_pace',
      weeklyRunsTarget: 3,
      availableDays: ['tuesday', 'thursday', 'saturday'],
      currentPace5kSec: 315,
    },
    activeRunningPlan: {
      title: 'Novembro 2026 — Build',
      phase: 'build',
      weeklyTargetKm: 28,
      sessions: [
        { weekNumber: 1, dayOfWeek: 'tuesday', sessionType: 'intervals', title: 'Tiros 5x800m', totalDistanceKm: 7 },
        { weekNumber: 1, dayOfWeek: 'saturday', sessionType: 'long_run', title: 'Longão 12km', totalDistanceKm: 12 },
      ],
    },
    recentRuns: [
      { date: '2026-11-14', distanceKm: 12, sessionRpe: 8, caloriesBurned: 780 },
      { date: '2026-11-17', distanceKm: 6.5, sessionRpe: 7, caloriesBurned: 420 },
    ],
  });

  assert.ok(digest);
  assert.equal(digest.currentPace5kFormatted, '5:15/km');
  assert.equal(digest.last14Days.totalKm, 18.5);
  assert.equal(digest.last14Days.longRunsOrHighVolumeCount, 1);
  assert.equal(digest.activePlan?.weeklyTargetKm, 28);
});

test('Context Builders: compact profile and mesocycle strip rawPlan and internal IDs', () => {
  const compactProfile = buildCompactAthleteProfile({
    id: 'singleton',
    displayName: 'Caio',
    sessionDurationMin: 50,
    weeklyWorkoutsTarget: 4,
    createdAt: new Date(),
  });
  assert.equal(compactProfile?.sessionDurationMin, 50);
  assert.equal('id' in (compactProfile ?? {}), false);

  const compactMeso = buildCompactMesocycleSummary({
    title: 'Bloco 1',
    objective: 'Hipertrofia',
    split: 'Upper/Lower',
    durationWeeks: 4,
    workoutDays: [
      {
        dayOrder: 1,
        label: 'Upper A',
        prescriptions: [
          {
            exerciseName: 'Supino Reto',
            movementPattern: 'horizontal_push',
            targetSets: 3,
            targetRepMin: 8,
            targetRepMax: 12,
          },
        ],
      },
    ],
  });
  assert.equal(compactMeso?.days.length, 1);
  assert.equal(compactMeso?.days[0].exercises[0].reps, '8-12');
});
