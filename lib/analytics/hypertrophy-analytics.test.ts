import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateEstimated1RM,
  classifyExerciseMuscleGroup,
  computeWeeklyMuscleVolume,
  computePersonalRecordsHallOfFame,
  computeMesocycleComparison,
} from './hypertrophy-analytics';
import {
  computeDailyReadinessScore,
  computeWeeklyReview,
} from './readiness-score';
import {
  estimateVdotFrom5kPaceSec,
  predictRaceTimesFrom5kPace,
} from '../running/vdot-predictor';
import {
  parseCrossFitWodDeterministic,
  generateICalendarFeed,
} from './wod-parser';

describe('Multi-Sport Analytics & New Features Suite (#3, #4, #10, #15, #16, #23, #24, #27)', () => {
  it('#4 calculates estimated 1RM accurately with Epley RIR-adjusted formula', () => {
    assert.equal(calculateEstimated1RM(100, 1, 10), 100);
    const e1rm = calculateEstimated1RM(100, 8, 9);
    assert.ok(e1rm > 125 && e1rm <= 135, `Expected e1RM ~130, got ${e1rm}`);
    assert.equal(calculateEstimated1RM(0, 10), 0);
  });

  it('#3 classifies exercises and computes weekly MEV/MAV/MRV with CrossFit overlap', () => {
    assert.equal(classifyExerciseMuscleGroup('Supino Inclinado com Halteres').primary, 'chest');
    assert.equal(classifyExerciseMuscleGroup('Puxada Frontal na Polia').primary, 'back');
    assert.equal(classifyExerciseMuscleGroup('Agachamento Hack').primary, 'quads');

    const report = computeWeeklyMuscleVolume({
      weekWorkouts: [
        {
          exerciseExecutions: [
            {
              exerciseName: 'Supino Reto',
              setExecutions: Array.from({ length: 8 }, () => ({ reps: 10, loadKg: 80 })),
            },
            {
              exerciseName: 'Crucifixo Máquina',
              setExecutions: Array.from({ length: 6 }, () => ({ reps: 12, loadKg: 50 })),
            },
          ],
        },
      ],
      weekCrossTraining: [{ activityType: 'crossfit', muscleGroups: ['Pernas', 'Peito'] }],
    });

    const chest = report.find((r) => r.key === 'chest');
    assert.ok(chest);
    assert.equal(chest.directSets, 14);
    assert.equal(chest.status, 'optimal_mav');
    assert.equal(chest.hasCrossFitOverlap, true);
    assert.equal(chest.crossFitSessionsCount, 1);

    const quads = report.find((r) => r.key === 'quads');
    assert.ok(quads);
    assert.equal(quads.hasCrossFitOverlap, true);
  });

  it('#4 computes Personal Records Hall of Fame sorted by e1RM', () => {
    const records = computePersonalRecordsHallOfFame([
      {
        date: '2026-11-01',
        exerciseExecutions: [
          {
            exerciseName: 'Supino Reto',
            setExecutions: [
              { loadKg: 80, reps: 10, rpe: 8 },
              { loadKg: 90, reps: 6, rpe: 9 },
            ],
          },
          {
            exerciseName: 'Agachamento Livre',
            setExecutions: [{ loadKg: 120, reps: 5, rpe: 8.5 }],
          },
        ],
      },
    ]);

    assert.equal(records.length, 2);
    assert.equal(records[0].exerciseName, 'Agachamento Livre');
    assert.equal(records[0].maxLoadKg, 120);
    assert.ok(records[0].bestEstimated1RM >= 135);
  });

  it('#24 computes cycle-over-cycle mesocycle comparison', () => {
    const diff = computeMesocycleComparison({
      activeMesocycle: { id: 'meso-2', title: 'Hipertrofia Bloco 2' },
      previousMesocycle: { id: 'meso-1', title: 'Hipertrofia Bloco 1' },
      workouts: [
        {
          mesocyclePlanId: 'meso-2',
          date: '2026-11-05',
          sessionRpe: 8,
          exerciseExecutions: [
            {
              exerciseName: 'Supino Reto',
              setExecutions: [
                { loadKg: 90, reps: 8, rpe: 8 },
                { loadKg: 90, reps: 8, rpe: 8.5 },
              ],
            },
          ],
        },
        {
          mesocyclePlanId: 'meso-1',
          date: '2026-10-05',
          sessionRpe: 8,
          exerciseExecutions: [
            {
              exerciseName: 'Supino Reto',
              setExecutions: [
                { loadKg: 80, reps: 8, rpe: 8 },
                { loadKg: 80, reps: 8, rpe: 8 },
              ],
            },
          ],
        },
      ],
    });

    assert.equal(diff.hasPreviousMesocycle, true);
    assert.ok((diff.tonnageDeltaPercent ?? 0) > 0);
    assert.equal(diff.topExerciseGains[0].deltaKg, 10);
  });

  it('#16 & #23 computes Daily Multi-Sport Readiness Score and Weekly Review', () => {
    const readiness = computeDailyReadinessScore({
      latestWellness: {
        date: '2026-11-08',
        sleepHours: 8,
        fatigueLevel: 2,
        sorenessLevel: 2,
        energyLevel: 4,
        stressLevel: 2,
      },
      todayStr: '2026-11-08',
      recentStrengthCount3d: 1,
      recentRunningCount3d: 1,
      recentCrossCount3d: 0,
      recentHighIntensityCount3d: 0,
    });

    assert.ok(readiness.score >= 76);
    assert.equal(readiness.status, 'green');

    const review = computeWeeklyReview({
      currentWeekLabel: '02/11 a 08/11',
      previousWeekLabel: '26/10 a 01/11',
      currentAdherencePercent: 100,
      previousAdherencePercent: 80,
      currentTonnageKg: 18500,
      previousTonnageKg: 17000,
      currentSets: 42,
      previousSets: 38,
      currentRunningKm: 16.5,
      previousRunningKm: 14.0,
      currentCrossSessions: 1,
      previousCrossSessions: 1,
      currentCaloriesBurned: 2450,
      previousCaloriesBurned: 2100,
      avgSleepHours: 7.6,
      underMevMuscles: ['Bíceps'],
    });

    assert.equal(review.adherencePercent.current, 100);
    assert.ok((review.strengthTonnageKg.deltaPercent ?? 0) > 0);
    assert.ok(review.automatedFocusPoints.length >= 1);
  });

  it('#10 estimates VDOT and predicts 5K, 10K, and Half Marathon 21.1K times', () => {
    const vdot = estimateVdotFrom5kPaceSec(300); // 5:00/km -> 25:00 5K
    assert.ok(vdot > 35 && vdot < 45);

    const preds = predictRaceTimesFrom5kPace(300);
    assert.equal(preds.length, 3);
    assert.equal(preds[0].distanceLabel, '5K');
    assert.equal(preds[1].distanceLabel, '10K');
    assert.equal(preds[2].distanceLabel, '21.1K (Meia Maratona)');
    assert.ok(preds[2].predictedTimeSec > preds[1].predictedTimeSec);
  });

  it('#15 parses CrossFit WOD text deterministically and #27 generates valid RFC 5545 .ics', () => {
    const wod = parseCrossFitWodDeterministic(
      'For Time: 21-15-9 Thrusters 42.5kg and Pull-ups, Time Cap 15 min'
    );
    assert.ok(wod.durationMinutes >= 15);
    assert.ok(wod.muscleGroups.includes('Pernas'));
    assert.ok(wod.muscleGroups.includes('Costas'));

    const ics = generateICalendarFeed([
      {
        uid: 'evt-1',
        date: '2026-11-08',
        summary: 'Treino A - Upper',
        status: 'planned',
        description: '1. Supino Reto — 4 séries x 8-10 reps',
      },
    ]);
    assert.ok(ics.includes('BEGIN:VCALENDAR'));
    assert.ok(ics.includes('DTSTART;VALUE=DATE:20261108'));
    assert.ok(ics.includes('DTEND;VALUE=DATE:20261109'));
    assert.ok(ics.includes('Supino Reto'));
  });
});
