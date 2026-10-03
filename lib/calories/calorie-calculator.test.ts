import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateStrengthCalories,
  getExerciseCategoryAndMultiplier,
  calculateRunningCalories,
  calculateCrossTrainingCalories,
  getBaseMetForActivity,
} from './index';

test('Exercise Biomechanics: movement patterns map to evidence-based energy multipliers', () => {
  const squat = getExerciseCategoryAndMultiplier('Agachamento Livre', 'squat');
  assert.equal(squat.category, 'compound_lower');
  assert.equal(squat.multiplier, 1.35);

  const legPress = getExerciseCategoryAndMultiplier('Leg Press 45', null);
  assert.equal(legPress.category, 'compound_lower');
  assert.equal(legPress.multiplier, 1.35);

  const benchPress = getExerciseCategoryAndMultiplier('Supino Reto', 'compound_push');
  assert.equal(benchPress.category, 'compound_upper');
  assert.equal(benchPress.multiplier, 1.0);

  const legExtension = getExerciseCategoryAndMultiplier('Cadeira Extensora', 'isolation_lower');
  assert.equal(legExtension.category, 'isolation_lower');
  assert.equal(legExtension.multiplier, 0.8);

  const bicepCurl = getExerciseCategoryAndMultiplier('Rosca Direta com Barra W', 'isolation');
  assert.equal(bicepCurl.category, 'isolation_upper');
  assert.equal(bicepCurl.multiplier, 0.65);

  const crunch = getExerciseCategoryAndMultiplier('Abdominal Crunch', 'core');
  assert.equal(crunch.category, 'core');
  assert.equal(crunch.multiplier, 0.6);
});

test('Strength Calorie Engine: typical 10,000 kg volume-load session produces physiologically validated expenditure', () => {
  // Session: 60 mins, 75kg athlete, RPE 8.0
  // 16 total sets across Squat, Bench, and Leg Ext
  const result = calculateStrengthCalories({
    athleteWeightKg: 75,
    durationMinutes: 60,
    sessionRpe: 8.0,
    exercises: [
      {
        exerciseName: 'Agachamento Livre',
        movementPattern: 'squat',
        sets: [
          { reps: 8, loadKg: 100, rpe: 8 },
          { reps: 8, loadKg: 100, rpe: 8 },
          { reps: 8, loadKg: 100, rpe: 8 },
          { reps: 8, loadKg: 100, rpe: 8.5 },
        ], // 3,200 kg volume-load
      },
      {
        exerciseName: 'Supino Reto',
        movementPattern: 'compound_push',
        sets: [
          { reps: 10, loadKg: 80, rpe: 8 },
          { reps: 10, loadKg: 80, rpe: 8 },
          { reps: 10, loadKg: 80, rpe: 8 },
          { reps: 10, loadKg: 80, rpe: 8.5 },
        ], // 3,200 kg volume-load
      },
      {
        exerciseName: 'Cadeira Extensora',
        movementPattern: 'isolation_lower',
        sets: [
          { reps: 12, loadKg: 60, rpe: 8 },
          { reps: 12, loadKg: 60, rpe: 8 },
          { reps: 12, loadKg: 60, rpe: 8.5 },
          { reps: 12, loadKg: 60, rpe: 9 },
        ], // 2,880 kg volume-load
      },
      {
        exerciseName: 'Rosca Direta',
        movementPattern: 'isolation',
        sets: [
          { reps: 10, loadKg: 25, rpe: 8 },
          { reps: 10, loadKg: 25, rpe: 8 },
          { reps: 10, loadKg: 25, rpe: 8.5 },
          { reps: 10, loadKg: 25, rpe: 9 },
        ], // 1,000 kg volume-load
      },
    ],
  });

  // Total Volume: 3200 + 3200 + 2880 + 1000 = 10,280 kg
  assert.equal(result.totalVolumeLoadKg, 10280);
  assert.equal(result.totalSets, 16);
  assert.equal(result.totalReps, 160);

  // In empirical studies (Abboud 2013, Scott 2011), ~10,000 kg volume-load session burns ~250-450 kcal
  assert.ok(result.totalCalories >= 280 && result.totalCalories <= 460, `Calories should be in range, got ${result.totalCalories}`);
  assert.ok(result.epocCalories > 0, 'EPOC afterburn should be non-zero');
  assert.equal(result.epocFactor, 0.12, 'Session RPE 8.0 should trigger 12% EPOC');

  // Breakdown sanity
  const squatBreakdown = result.perExercise.find((e) => e.exerciseName === 'Agachamento Livre')!;
  const benchBreakdown = result.perExercise.find((e) => e.exerciseName === 'Supino Reto')!;
  // Both did 3,200 kg volume, but squat has 1.35x multiplier vs bench 1.00x multiplier
  assert.ok(squatBreakdown.caloriesBurned > benchBreakdown.caloriesBurned, 'Lower body compound must burn more than upper body for equal load');
});

test('Strength Calorie Engine: handles bodyweight exercises and RPE scaling', () => {
  const pullupSession = calculateStrengthCalories({
    athleteWeightKg: 80,
    durationMinutes: 45,
    sessionRpe: 7.0,
    exercises: [
      {
        exerciseName: 'Barra Fixa (Pull-up)',
        movementPattern: 'compound_pull',
        sets: [
          { reps: 8, loadKg: null, rpe: 7 }, // null load defaults to 80kg * 1.0
          { reps: 8, loadKg: null, rpe: 7 },
          { reps: 8, loadKg: null, rpe: 7 },
        ],
      },
    ],
  });

  assert.ok(pullupSession.totalVolumeLoadKg > 0, 'Bodyweight load should be resolved');
  assert.equal(pullupSession.totalVolumeLoadKg, 8 * 80 * 3); // 1,920 kg
  assert.equal(pullupSession.epocFactor, 0.08, 'Session RPE 7.0 should use 8% EPOC');
});

test('Running Calorie Engine: Margaria and ACSM elevation formulas', () => {
  // Flat 10 km run for 70 kg athlete = 70 * 10 * 1.0 = 700 kcal
  const flatRun = calculateRunningCalories({
    athleteWeightKg: 70,
    distanceKm: 10.0,
    elevationGainM: 0,
  });

  assert.equal(flatRun.totalCalories, 700);
  assert.equal(flatRun.flatCalories, 700);
  assert.equal(flatRun.elevationCalories, 0);
  assert.equal(flatRun.costPerKm, 70.0);

  // 10 km with 150m ascent: 700 + (70 * 150 * 0.0045) = 700 + 47.25 = 747.25 -> 747 kcal
  const hillyRun = calculateRunningCalories({
    athleteWeightKg: 70,
    distanceKm: 10.0,
    elevationGainM: 150,
  });

  assert.equal(hillyRun.totalCalories, 747);
  assert.equal(hillyRun.flatCalories, 700);
  assert.equal(hillyRun.elevationCalories, 47);

  // 0 distance returns 0
  const zeroRun = calculateRunningCalories({
    athleteWeightKg: 70,
    distanceKm: 0,
  });
  assert.equal(zeroRun.totalCalories, 0);
});

test('Cross-Training Calorie Engine: MET and intensity scaling', () => {
  // 20 min CrossFit AMRAP (Cindy style), 75 kg athlete, RPE 8.0
  const cindy = calculateCrossTrainingCalories({
    athleteWeightKg: 75,
    durationMinutes: 20,
    activityType: 'crossfit',
    sessionRpe: 8.0,
  });

  // Base MET 9.5 * (0.8 + 8*0.04 = 1.12) = 10.64 METs
  // kcal/min = (10.64 * 3.5 * 75) / 200 = 13.965 kcal/min
  // 20 min * 13.965 = 279.3 * 1.10 EPOC = ~307 kcal
  assert.ok(cindy.totalCalories >= 260 && cindy.totalCalories <= 330, `CrossFit burn should match lab Cindy calorimetry, got ${cindy.totalCalories}`);
  assert.ok(cindy.effectiveMet >= 9.5);

  // 45 min swimming, 75 kg athlete, RPE 7.0
  const swim = calculateCrossTrainingCalories({
    athleteWeightKg: 75,
    durationMinutes: 45,
    activityType: 'swimming',
    sessionRpe: 7.0,
  });

  assert.ok(swim.totalCalories >= 300 && swim.totalCalories <= 600, `Swim calories expected in range, got ${swim.totalCalories}`);

  // Intensity scaling verification: high RPE CrossFit > low RPE
  const sprintMetcon = getBaseMetForActivity('crossfit', 9.5);
  const emomMetcon = getBaseMetForActivity('crossfit', 7.0);
  assert.ok(sprintMetcon.baseMet > emomMetcon.baseMet);
});
