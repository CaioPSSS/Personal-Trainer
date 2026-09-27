import test from 'node:test';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import {
  runningPlanOutputSchema,
  RunningPlanOutput,
} from './running-contracts';
import {
  calculateKarvonenZones,
  estimateVdotPaces,
  buildRunningCoachPrompts,
} from './running-prompts';

test('Running Contracts: runningPlanOutputSchema accepts valid 4-week running plan', () => {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(runningPlanOutputSchema);

  const validPlanOutput: RunningPlanOutput = {
    plan: {
      title: 'Outubro 2026 — Base Aeróbica & VDOT',
      month: 10,
      year: 2026,
      objective: 'Evoluir ritmo de 5K para 5:00/km com volume polarizado',
      phase: 'base',
      weeklyTargetKm: 25,
      sessions: [
        {
          weekNumber: 1,
          dayOfWeek: 'tuesday',
          sessionType: 'easy',
          title: 'Rodagem Aeróbica Leve — Z2',
          totalDistanceKm: 6.0,
          totalDurationMin: 36,
          targetPaceSec: 360,
          targetHrZone: 'Zona 2 (128-141 bpm)',
          segments: [
            { type: 'warmup', durationMin: 5, paceRangeSec: [380, 420] },
            { type: 'steady', distanceKm: 5.0, paceRangeSec: [350, 370], hrZone: 'Zona 2' },
            { type: 'cooldown', durationMin: 5, paceRangeSec: [390, 430] },
          ],
          notes: 'Manter cadência constante e respiração confortável.',
        },
        {
          weekNumber: 1,
          dayOfWeek: 'thursday',
          sessionType: 'tempo',
          title: 'Treino de Limiar de Lactato',
          totalDistanceKm: 7.0,
          totalDurationMin: 40,
          targetPaceSec: 320,
          targetHrZone: 'Zona 4 (154-167 bpm)',
          segments: [
            { type: 'warmup', distanceKm: 1.5, paceRangeSec: [360, 390] },
            { type: 'tempo', distanceKm: 4.0, paceRangeSec: [315, 325], hrZone: 'Zona 4' },
            { type: 'cooldown', distanceKm: 1.5, paceRangeSec: [370, 400] },
          ],
          notes: 'Ritmo confortavelmente duro, sem ultrapassar o limiar.',
        },
        {
          weekNumber: 1,
          dayOfWeek: 'saturday',
          sessionType: 'long_run',
          title: 'Longão de Resistência Aeróbica',
          totalDistanceKm: 12.0,
          totalDurationMin: 75,
          targetPaceSec: 375,
          targetHrZone: 'Zona 2 (128-141 bpm)',
          segments: [
            { type: 'steady', distanceKm: 12.0, paceRangeSec: [365, 385], hrZone: 'Zona 2' },
          ],
          notes: 'Foco em hidratação e economia de corrida.',
        },
        {
          weekNumber: 2,
          dayOfWeek: 'tuesday',
          sessionType: 'intervals',
          title: 'Tiros de VO2max — 5x800m',
          totalDistanceKm: 6.5,
          totalDurationMin: 42,
          targetPaceSec: 290,
          targetHrZone: 'Zona 5 (>167 bpm)',
          segments: [
            { type: 'warmup', distanceKm: 1.5 },
            { type: 'interval', reps: 5, distanceM: 800, restSec: 90, paceRangeSec: [285, 295] },
            { type: 'cooldown', distanceKm: 1.0 },
          ],
          notes: 'Recuperação ativa com trote entre os tiros.',
        },
      ],
    },
    coachBrain: {
      hypotheses: [
        'O atleta responde positivamente a 3 sessões semanais polarizadas 80/20.',
        'Sessões de limiar na quinta-feira permitem recuperação ideal após treinos de força.',
      ],
      rationale: [
        'O volume inicial de 25km respeita o histórico recente e previne canelite.',
      ],
      monthlyProgression: 'Aumento gradual de volume em 8% na semana 2 e 3, seguido de semana regenerativa.',
      riskFactors: ['Vigilância sobre estresse de tíbia em treinos de asfalto.'],
      retrospective: {
        whatWorked: ['Manutenção da frequência cardíaca na Zona 2 nas rodagens.'],
        whatFailed: ['Pacing irregular no primeiro ciclo.'],
        paceEvolution: 'Pace de 5K melhorado de 5:30 para 5:20/km.',
        volumeAdherence: 0.92,
        correctionActions: ['Controlar cadência em subidas leves.'],
      },
    },
  };

  const valid = validate(validPlanOutput);
  assert.equal(valid, true, `Validation errors: ${JSON.stringify(validate.errors)}`);
});

test('Running Contracts: runningPlanOutputSchema rejects invalid session types', () => {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(runningPlanOutputSchema);

  const invalidOutput = {
    plan: {
      title: 'Plano Inválido',
      month: 10,
      year: 2026,
      objective: 'Objetivo',
      phase: 'base',
      weeklyTargetKm: 25,
      sessions: [
        {
          weekNumber: 1,
          dayOfWeek: 'monday',
          sessionType: 'sprint_tabata', // Not in 9 canonical session types!
          title: 'Sessão com tipo inválido',
          totalDistanceKm: 5,
          totalDurationMin: 30,
          targetPaceSec: 300,
          targetHrZone: 'Zona 2',
          segments: [{ type: 'steady', distanceKm: 5 }],
          notes: 'Test',
        },
      ],
    },
    coachBrain: {
      hypotheses: ['H1'],
      rationale: ['R1'],
      monthlyProgression: 'P1',
      riskFactors: [],
      retrospective: {
        whatWorked: [],
        whatFailed: [],
        paceEvolution: 'N/A',
        volumeAdherence: 1.0,
        correctionActions: [],
      },
    },
  };

  const valid = validate(invalidOutput);
  assert.equal(valid, false);
});

test('Endurance Science: Karvonen formula calculates exact zones', () => {
  // Max HR: 185 bpm, Resting HR: 55 bpm
  // HRR = 130 bpm
  // Zone 1: 55 + 0.5*130 to 55 + 0.6*130 -> 120 to 133 bpm
  // Zone 2: 55 + 0.6*130 to 55 + 0.7*130 -> 133 to 146 bpm
  // Zone 3: 55 + 0.7*130 to 55 + 0.8*130 -> 146 to 159 bpm
  // Zone 4: 55 + 0.8*130 to 55 + 0.9*130 -> 159 to 172 bpm
  // Zone 5: 55 + 0.9*130 to 185 -> 172 to 185 bpm
  const zones = calculateKarvonenZones(185, 55);

  assert.equal(zones.zone1.min, 120);
  assert.equal(zones.zone1.max, 133);

  assert.equal(zones.zone2.min, 133);
  assert.equal(zones.zone2.max, 146);

  assert.equal(zones.zone3.min, 146);
  assert.equal(zones.zone3.max, 159);

  assert.equal(zones.zone4.min, 159);
  assert.equal(zones.zone4.max, 172);

  assert.equal(zones.zone5.min, 172);
  assert.equal(zones.zone5.max, 185);
});

test('Endurance Science: Jack Daniels VDOT paces scale with 5K reference', () => {
  // 5K pace: 300 sec/km (5:00 /km)
  const paces = estimateVdotPaces(300);

  // Easy: 115% - 125% -> 345 - 375 sec/km (5:45 - 6:15)
  assert.deepEqual(paces.easyPaceRangeSec, [345, 375]);

  // Marathon: 108% - 114% -> 324 - 342 sec/km (5:24 - 5:42)
  assert.deepEqual(paces.marathonPaceRangeSec, [324, 342]);

  // Threshold: 103% - 107% -> 309 - 321 sec/km (5:09 - 5:21)
  assert.deepEqual(paces.thresholdPaceRangeSec, [309, 321]);

  // Interval: 95% - 99% -> 285 - 297 sec/km (4:45 - 4:57)
  assert.deepEqual(paces.intervalPaceRangeSec, [285, 297]);

  // Repetition: 88% - 94% -> 264 - 282 sec/km (4:24 - 4:42)
  assert.deepEqual(paces.repetitionPaceRangeSec, [264, 282]);
});

test('Prompt Engine: buildRunningCoachPrompts generates comprehensive context', () => {
  const prompts = buildRunningCoachPrompts({
    runningProfile: {
      id: 'singleton',
      currentPace5kSec: 315, // 5:15 /km
      weeklyVolumeKm: 28,
      maxHeartRate: 188,
      restingHeartRate: 52,
      primaryObjective: 'improve_5k_pace',
      availableDays: ['tuesday', 'thursday', 'saturday'],
    },
    recentExecutions: [
      {
        date: '2026-09-25',
        distanceKm: 6.2,
        durationSeconds: 1980,
        avgPaceSec: 319,
        source: 'manual',
      },
    ],
    previousBrainEntries: [
      {
        month: 9,
        year: 2026,
        decayWeight: 1.0,
        hypotheses: ['Baseline established'],
        retrospective: { volumeAdherence: 0.95 },
      },
    ],
    crossTrainingActivities: [
      {
        date: '2026-09-24',
        activityType: 'swimming',
        durationMinutes: 45,
        sessionRpe: 6,
      },
    ],
    recentStrengthWorkouts: [
      {
        date: '2026-09-23',
        workoutTitle: 'Lower Body Quad Focus',
        targetMuscleGroups: ['quadriceps', 'calves'],
        rpeAvg: 8.5,
      },
    ],
    targetMonth: 10,
    targetYear: 2026,
  });

  assert.ok(prompts.systemPrompt.includes('Pete Pfitzinger'));
  assert.ok(prompts.systemPrompt.includes('Jack Daniels VDOT'));
  assert.ok(prompts.systemPrompt.includes('80/20 POLARIZED'));
  assert.ok(prompts.userPrompt.includes('ATHLETE RUNNING PROFILE:'));
  assert.ok(prompts.userPrompt.includes('PREVIOUS COACH BRAIN MEMORY WITH TEMPORAL DECAY:'));
  assert.ok(prompts.userPrompt.includes('CONCURRENT CROSS-TRAINING SESSIONS'));
});
