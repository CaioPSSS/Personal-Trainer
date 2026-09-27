import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateProgressiveOverload,
  isCompoundExercise,
  roundToHalfKg,
  PreviousExercisePerformance,
} from './load-calculator';

test('Progressive Overload: Compound Exercise increment (+2.5kg)', () => {
  const perf: PreviousExercisePerformance = {
    exerciseName: 'Supino Reto com Barra',
    movementPattern: 'horizontal_push',
    isCompound: true,
    targetRepMin: 8,
    targetRepMax: 10,
    targetRpeMin: 7,
    targetRpeMax: 8,
    completedSets: [
      { setNumber: 1, loadKg: 80, reps: 10, rpe: 8 },
      { setNumber: 2, loadKg: 80, reps: 10, rpe: 8 },
      { setNumber: 3, loadKg: 80, reps: 10, rpe: 8 },
    ],
  };

  const result = calculateProgressiveOverload(perf);
  assert.equal(result.action, 'increment');
  assert.equal(result.deltaKg, 2.5);
  assert.equal(result.suggestedLoadKg, 82.5);
  assert.equal(result.previousMaxLoadKg, 80);
});

test('Progressive Overload: Accelerated Compound increment (+5.0kg on high reps & RPE <= 7)', () => {
  const perf: PreviousExercisePerformance = {
    exerciseName: 'Agachamento Livre',
    movementPattern: 'squat',
    isCompound: true,
    targetRepMin: 6,
    targetRepMax: 8,
    targetRpeMin: 7,
    targetRpeMax: 8,
    completedSets: [
      { setNumber: 1, loadKg: 100, reps: 10, rpe: 6.5 },
      { setNumber: 2, loadKg: 100, reps: 10, rpe: 7.0 },
    ],
  };

  const result = calculateProgressiveOverload(perf);
  assert.equal(result.action, 'increment');
  assert.equal(result.deltaKg, 5.0);
  assert.equal(result.suggestedLoadKg, 105);
  assert.equal(result.previousMaxLoadKg, 100);
});

test('Progressive Overload: Isolation Exercise increment (+1.0kg)', () => {
  const perf: PreviousExercisePerformance = {
    exerciseName: 'Elevação Lateral com Halteres',
    movementPattern: 'lateral_raise',
    isCompound: false,
    targetRepMin: 12,
    targetRepMax: 15,
    targetRpeMin: 8,
    targetRpeMax: 9,
    completedSets: [
      { setNumber: 1, loadKg: 12, reps: 15, rpe: 7.5 },
      { setNumber: 2, loadKg: 12, reps: 15, rpe: 7.5 },
      { setNumber: 3, loadKg: 12, reps: 15, rpe: 8.0 },
    ],
  };

  const result = calculateProgressiveOverload(perf);
  assert.equal(result.action, 'increment');
  assert.equal(result.deltaKg, 1.0);
  assert.equal(result.suggestedLoadKg, 13.0);
  assert.equal(result.previousMaxLoadKg, 12.0);
});

test('Progressive Overload: Accelerated Isolation increment (+2.0kg on high reps & low RPE)', () => {
  const perf: PreviousExercisePerformance = {
    exerciseName: 'Rosca Direta',
    movementPattern: 'biceps_curl',
    isCompound: false,
    targetRepMin: 10,
    targetRepMax: 12,
    targetRpeMin: 7,
    targetRpeMax: 8,
    completedSets: [
      { setNumber: 1, loadKg: 20, reps: 14, rpe: 6.5 },
    ],
  };

  const result = calculateProgressiveOverload(perf);
  assert.equal(result.action, 'increment');
  assert.equal(result.deltaKg, 2.0);
  assert.equal(result.suggestedLoadKg, 22.0);
});

test('Progressive Overload: Technical Consolidation maintains load at RPE 8.5', () => {
  const perf: PreviousExercisePerformance = {
    exerciseName: 'Agachamento Barra',
    movementPattern: 'squat',
    isCompound: true,
    targetRepMin: 6,
    targetRepMax: 8,
    targetRpeMin: 7,
    targetRpeMax: 8,
    completedSets: [
      { setNumber: 1, loadKg: 100, reps: 7, rpe: 8.5 },
      { setNumber: 2, loadKg: 100, reps: 7, rpe: 8.5 },
      { setNumber: 3, loadKg: 100, reps: 7, rpe: 9.0 },
    ],
  };

  const result = calculateProgressiveOverload(perf);
  assert.equal(result.action, 'maintain');
  assert.equal(result.deltaKg, 0);
  assert.equal(result.suggestedLoadKg, 100);
  assert.equal(result.previousMaxLoadKg, 100);
  assert.match(result.progressionReason, /consolidação técnica/i);
});

test('Progressive Overload: Fatigue Hold on RPE >= 9.5', () => {
  const perf: PreviousExercisePerformance = {
    exerciseName: 'Desenvolvimento Militar',
    movementPattern: 'vertical_push',
    isCompound: true,
    targetRepMin: 8,
    targetRepMax: 10,
    targetRpeMin: 7,
    targetRpeMax: 8,
    completedSets: [
      { setNumber: 1, loadKg: 50, reps: 6, rpe: 10 },
    ],
  };

  const result = calculateProgressiveOverload(perf);
  assert.equal(result.action, 'maintain');
  assert.equal(result.deltaKg, 0);
  assert.equal(result.suggestedLoadKg, 50);
  assert.equal(result.previousMaxLoadKg, 50);
  assert.match(result.progressionReason, /esforço no limite/i);
});

test('Progressive Overload: Fatigue Hold on premature failure flag', () => {
  const perf: PreviousExercisePerformance = {
    exerciseName: 'Supino Inclinado',
    movementPattern: 'horizontal_push',
    isCompound: true,
    targetRepMin: 8,
    targetRepMax: 10,
    targetRpeMin: 7,
    targetRpeMax: 8,
    completedSets: [
      { setNumber: 1, loadKg: 70, reps: 10, rpe: 8, isFailure: false },
      { setNumber: 2, loadKg: 70, reps: 8, rpe: 8, isFailure: true },
    ],
  };

  const result = calculateProgressiveOverload(perf);
  assert.equal(result.action, 'maintain');
  assert.equal(result.deltaKg, 0);
  assert.equal(result.suggestedLoadKg, 70);
});

test('Progressive Overload: Reps below minimum floor triggers fatigue hold', () => {
  const perf: PreviousExercisePerformance = {
    exerciseName: 'Barra Fixa',
    movementPattern: 'vertical_pull',
    isCompound: true,
    targetRepMin: 8,
    targetRepMax: 12,
    targetRpeMin: 7,
    targetRpeMax: 8,
    completedSets: [
      { setNumber: 1, loadKg: 10, reps: 5, rpe: 8 },
    ],
  };

  const result = calculateProgressiveOverload(perf);
  assert.equal(result.action, 'maintain');
  assert.equal(result.deltaKg, 0);
  assert.equal(result.suggestedLoadKg, 10);
});

test('Progressive Overload: Reps in range with low RPE maintains load for rep progression', () => {
  const perf: PreviousExercisePerformance = {
    exerciseName: 'Remada Curvada',
    movementPattern: 'horizontal_pull',
    isCompound: true,
    targetRepMin: 8,
    targetRepMax: 12,
    targetRpeMin: 7,
    targetRpeMax: 8,
    completedSets: [
      { setNumber: 1, loadKg: 60, reps: 9, rpe: 7.5 },
    ],
  };

  const result = calculateProgressiveOverload(perf);
  assert.equal(result.action, 'maintain');
  assert.equal(result.deltaKg, 0);
  assert.equal(result.suggestedLoadKg, 60);
  assert.match(result.progressionReason, /topo da faixa/i);
});

test('Progressive Overload: Empty history returns baseline', () => {
  const perf: PreviousExercisePerformance = {
    exerciseName: 'Leg Press 45',
    isCompound: true,
    targetRepMin: 10,
    targetRepMax: 12,
    targetRpeMin: 7,
    targetRpeMax: 8,
    completedSets: [],
  };

  const result = calculateProgressiveOverload(perf);
  assert.equal(result.action, 'maintain');
  assert.equal(result.deltaKg, 0);
  assert.equal(result.suggestedLoadKg, 0);
  assert.equal(result.previousMaxLoadKg, 0);
  assert.match(result.progressionReason, /primeira execução/i);
});

test('Progressive Overload: Bodyweight only sets return zero load baseline', () => {
  const perf: PreviousExercisePerformance = {
    exerciseName: 'Paralelas (Dips)',
    movementPattern: 'vertical_push',
    isCompound: true,
    targetRepMin: 8,
    targetRepMax: 12,
    targetRpeMin: 7,
    targetRpeMax: 8,
    completedSets: [
      { setNumber: 1, loadKg: 0, reps: 15, rpe: 7.0 },
    ],
  };

  const result = calculateProgressiveOverload(perf);
  assert.equal(result.action, 'maintain');
  assert.equal(result.deltaKg, 0);
  assert.equal(result.suggestedLoadKg, 0);
  assert.equal(result.previousMaxLoadKg, 0);
  assert.match(result.progressionReason, /peso corporal/i);
});

test('Progressive Overload: 0.5kg Plate Interval Clamping', () => {
  assert.equal(roundToHalfKg(42.3), 42.5);
  assert.equal(roundToHalfKg(42.1), 42.0);
  assert.equal(roundToHalfKg(42.25), 42.5);
  assert.equal(roundToHalfKg(42.75), 43.0);
  assert.equal(roundToHalfKg(100), 100);
});

test('Progressive Overload: isCompoundExercise identification accuracy', () => {
  // Compound tests
  assert.equal(isCompoundExercise('Supino Reto com Barra'), true);
  assert.equal(isCompoundExercise('Agachamento Livre com Barra'), true);
  assert.equal(isCompoundExercise('Leg Press 45'), true);
  assert.equal(isCompoundExercise('Levantamento Terra'), true);
  assert.equal(isCompoundExercise('Stiff com Halteres'), true);
  assert.equal(isCompoundExercise('Desenvolvimento Militar'), true);
  assert.equal(isCompoundExercise('Puxada Alta Frontal'), true);
  assert.equal(isCompoundExercise('Remada Baixa'), true);
  assert.equal(isCompoundExercise('Barra Fixa'), true);
  assert.equal(isCompoundExercise('Afundo / Passada'), true);

  // Isolation tests
  assert.equal(isCompoundExercise('Cadeira Extensora'), false);
  assert.equal(isCompoundExercise('Mesa Flexora Deitada'), false);
  assert.equal(isCompoundExercise('Elevação Lateral'), false);
  assert.equal(isCompoundExercise('Rosca Direta W'), false);
  assert.equal(isCompoundExercise('Tríceps Corda no Pulley'), false);
  assert.equal(isCompoundExercise('Panturrilha Sentado'), false);
  assert.equal(isCompoundExercise('Crucifixo Invertido'), false);
  assert.equal(isCompoundExercise('Peck Deck / Voador'), false);

  // Pattern overrides
  assert.equal(isCompoundExercise('Custom Exercise', 'squat'), true);
  assert.equal(isCompoundExercise('Custom Exercise', 'horizontal_push'), true);
  assert.equal(isCompoundExercise('Custom Exercise', 'biceps_curl'), false);
  assert.equal(isCompoundExercise('Custom Exercise', 'knee_extension'), false);
});
