import test from 'node:test';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import {
  MasterPlanOutput,
  masterPlanOutputSchema,
  validateMasterPlanSemantics,
} from './contracts';
import {
  RunningPlanOutput,
  validateRunningPlanSemantics,
} from './running-contracts';
import { buildMasterCoachPrompts } from './prompts';

function makeValidMasterPlan(): MasterPlanOutput {
  return {
    mesocycle: {
      title: 'Hipertrofia Upper/Lower — Base',
      objective: 'Ganho de massa magra com controle de fadiga concorrente',
      split: 'Upper/Lower',
      durationWeeks: 4,
      targetSessionMinutes: 60,
      weeks: [
        { weekNumber: 1, isDeload: false, targetVolumeNotes: 'Calibração RIR 3' },
        { weekNumber: 2, isDeload: false, targetVolumeNotes: 'Progressão de repetições' },
        { weekNumber: 3, isDeload: false, targetVolumeNotes: 'Progressão de carga' },
        { weekNumber: 4, isDeload: false, targetVolumeNotes: 'Pico de intensidade' },
      ],
      days: [
        {
          dayOrder: 1,
          label: 'Superiores A — Empurrar e Puxar',
          estimatedDurationMin: 60,
          exercises: [
            {
              exerciseKey: 'supino_inclinado_halteres',
              exerciseName: 'Supino Inclinado com Halteres',
              movementPattern: 'horizontal_push',
              targetSets: 4,
              targetRepMin: 8,
              targetRepMax: 12,
              targetRpeMin: 7,
              targetRpeMax: 8.5,
              restSeconds: 120,
              advancedTechnique: null,
            },
            {
              exerciseKey: 'remada_articulada',
              exerciseName: 'Remada Articulada',
              movementPattern: 'horizontal_pull',
              targetSets: 4,
              targetRepMin: 8,
              targetRepMax: 12,
              targetRpeMin: 7.5,
              targetRpeMax: 8.5,
              restSeconds: 120,
              advancedTechnique: null,
            },
            {
              exerciseKey: 'elevacao_lateral_polia',
              exerciseName: 'Elevação Lateral na Polia',
              movementPattern: 'shoulder_isolation',
              targetSets: 4,
              targetRepMin: 12,
              targetRepMax: 15,
              targetRpeMin: 8,
              targetRpeMax: 9,
              restSeconds: 60,
              advancedTechnique: null,
            },
          ],
        },
        {
          dayOrder: 2,
          label: 'Inferiores A — Quadríceps e Posterior',
          estimatedDurationMin: 60,
          exercises: [
            {
              exerciseKey: 'leg_press_45',
              exerciseName: 'Leg Press 45°',
              movementPattern: 'squat',
              targetSets: 4,
              targetRepMin: 8,
              targetRepMax: 12,
              targetRpeMin: 7.5,
              targetRpeMax: 8.5,
              restSeconds: 150,
              advancedTechnique: null,
            },
            {
              exerciseKey: 'cadeira_flexora',
              exerciseName: 'Cadeira Flexora',
              movementPattern: 'knee_flexion',
              targetSets: 4,
              targetRepMin: 10,
              targetRepMax: 14,
              targetRpeMin: 8,
              targetRpeMax: 9,
              restSeconds: 90,
              advancedTechnique: null,
            },
            {
              exerciseKey: 'panturrilha_maquina',
              exerciseName: 'Panturrilha Máquina',
              movementPattern: 'calf_raise',
              targetSets: 4,
              targetRepMin: 12,
              targetRepMax: 15,
              targetRpeMin: 8,
              targetRpeMax: 9.5,
              restSeconds: 60,
              advancedTechnique: null,
            },
          ],
        },
      ],
    },
    coachBrain: {
      hypotheses: ['Alto SFR preserva recuperação para corrida concorrente.'],
      rationale: ['Leg Press 45° reduz fadiga axial antes do longão.'],
      nextCycleWatchouts: ['Monitorar sono em semanas de déficit calórico.'],
      retrospective: {
        whatWorked: [],
        whatFailed: [],
        confidenceScore: 0.75,
        correctionActions: [],
      },
    },
  };
}

test('MasterPlan Contract: accepts valid pt-BR baseline plan with empty retrospective and canonical movementPattern', () => {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(masterPlanOutputSchema);
  const plan = makeValidMasterPlan();

  assert.equal(validate(plan), true, JSON.stringify(validate.errors));
  assert.deepEqual(validateMasterPlanSemantics(plan, 2), []);
});

test('MasterPlan Contract: rejects non-canonical movementPattern and detects semantic errors', () => {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(masterPlanOutputSchema);
  const badPatternPlan = makeValidMasterPlan();
  badPatternPlan.mesocycle.days[0].exercises[0].movementPattern = 'random_push_pattern';
  assert.equal(validate(badPatternPlan), false);

  const semanticBad = makeValidMasterPlan();
  semanticBad.mesocycle.durationWeeks = 5; // mismatch with 4 weeks array
  semanticBad.mesocycle.days[0].exercises[0].targetRepMin = 15;
  semanticBad.mesocycle.days[0].exercises[0].targetRepMax = 10;
  const errs = validateMasterPlanSemantics(semanticBad, 4);
  assert.ok(errs.some((e) => e.includes('durationWeeks')));
  assert.ok(errs.some((e) => e.includes('weeklyWorkoutsTarget')));
  assert.ok(errs.some((e) => e.includes('targetRepMin')));
});

test('RunningPlan Semantics: flags missing weeks and inverted paceRangeSec', () => {
  const incomplete: RunningPlanOutput = {
    plan: {
      title: 'Dezembro 2026 — Base',
      month: 12,
      year: 2026,
      objective: 'Evoluir 5K',
      phase: 'base',
      weeklyTargetKm: 20,
      sessions: [
        {
          weekNumber: 1,
          dayOfWeek: 'tuesday',
          sessionType: 'easy',
          title: 'Rodagem Z2',
          totalDistanceKm: 5,
          totalDurationMin: 30,
          targetPaceSec: 360,
          targetHrZone: 'Zona 2',
          segments: [{ type: 'steady', distanceKm: 5, paceRangeSec: [390, 350] }],
          notes: 'Leve',
        },
      ],
    },
    coachBrain: {
      hypotheses: ['H1'],
      rationale: ['R1'],
      monthlyProgression: 'Progressão gradual',
      riskFactors: [],
      retrospective: {
        whatWorked: [],
        whatFailed: [],
        paceEvolution: 'Baseline',
        volumeAdherence: 1,
        correctionActions: [],
      },
    },
  };

  const errs = validateRunningPlanSemantics(incomplete, 3);
  assert.ok(errs.some((e) => e.includes('inverted paceRangeSec')));
  assert.ok(errs.some((e) => e.includes('Week 2 has 0')));
  assert.ok(errs.some((e) => e.includes('Week 4 has 0')));
});

test('Master Coach Prompt: injects dynamic sessionDurationMin, weeklyWorkoutsTarget, pt-BR, running & nutrition digests', () => {
  const { systemPrompt, userPrompt } = buildMasterCoachPrompts({
    athleteProfile: {
      sessionDurationMin: 45,
      weeklyWorkoutsTarget: 4,
      availableDays: ['Seg', 'Ter', 'Qui', 'Sex'],
    },
    analystReport: {
      executiveSummary: 'Baseline phase',
      exercisePerformance: [],
      progressionSignals: {
        progressionCompliance: 'moderate',
        keyBottlenecks: ['N/A'],
        recoveryConstraints: ['N/A'],
      },
      recommendationsForMaster: ['R1', 'R2', 'R3'],
    },
    previousCoachBrain: null,
    recentWorkouts: [],
    recentWellness: [],
    concurrentRunningDigest: {
      hasRunningProfile: true,
      primaryObjective: 'improve_5k_pace',
      weeklyRunsTarget: 3,
      availableDays: ['tuesday', 'thursday', 'saturday'],
      currentPace5kFormatted: '5:15/km',
      activePlan: null,
      last14Days: { runsCount: 4, totalKm: 24, longRunsOrHighVolumeCount: 1, avgRpe: 7.5, totalCaloriesBurned: 1500 },
    },
    wellnessNutritionDigest: {
      daysLogged: 10,
      avgSleepHours: 6.2,
      minSleepHours: 5.5,
      avgFatigueLevel: 6,
      avgSorenessLevel: 5,
      avgStressLevel: 6,
      avgEnergyLevel: 6,
      latestBodyWeightKg: 80,
      weightDeltaKg: -0.6,
      avgCaloriesConsumed: 2100,
      avgCalorieTarget: 2400,
      avgCaloricBalanceKcal: -300,
      avgProteinGrams: 165,
      proteinGramsPerKg: 2.1,
      dominantDietGoal: 'loss',
      recentDays: [],
    },
  });

  assert.ok(systemPrompt.includes('45-MINUTE SESSION DURATION'));
  assert.ok(systemPrompt.includes('EXACTLY 4 distinct workout day templates'));
  assert.ok(systemPrompt.includes('Brazilian Portuguese (pt-BR)'));
  assert.ok(userPrompt.includes('Concurrent Running profile'));
  assert.ok(userPrompt.includes('Recovery, sleep & nutrition digest'));
});
