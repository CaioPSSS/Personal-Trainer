import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMultiSportRadar } from './multi-sport-radar';

test('Multi-Sport Radar: detects high-severity same-day conflict between lower-body strength and intervals', () => {
  const result = analyzeMultiSportRadar({
    weekEvents: [
      {
        date: '2026-11-10',
        eventType: 'strength',
        title: 'Treino A - Inferiores (Quadríceps)',
        status: 'planned',
      },
      {
        date: '2026-11-10',
        eventType: 'running',
        title: 'Tiros 8x400m',
        status: 'planned',
      },
    ],
  });

  assert.equal(result.status, 'conflict');
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].severity, 'high');
  assert.match(result.conflicts[0].description, /10\/11/);
});

test('Multi-Sport Radar: detects <24h collision when lower-body template has squat prescriptions adjacent to long run', () => {
  const result = analyzeMultiSportRadar({
    weekEvents: [
      {
        date: '2026-11-13',
        eventType: 'strength',
        title: 'Sessão A',
        status: 'planned',
        referenceModel: 'WorkoutDayTemplate',
        referenceId: 'tpl-a',
      },
      {
        date: '2026-11-14',
        eventType: 'running',
        title: 'Treino de Volume',
        status: 'planned',
        referenceId: 'run-long',
      },
    ],
    templatesWithPrescriptions: [
      {
        id: 'tpl-a',
        label: 'Sessão A',
        prescriptions: [{ exerciseName: 'Leg Press 45', movementPattern: 'squat' }],
      },
    ],
    runningSessions: [
      {
        id: 'run-long',
        scheduledDate: '2026-11-14',
        sessionType: 'long_run',
        title: 'Longão Aeróbico',
        status: 'planned',
      },
    ],
  });

  assert.equal(result.status, 'conflict');
  assert.equal(result.conflicts[0].severity, 'high');
  assert.match(result.conflicts[0].description, /Janela < 24h/);
});

test('Multi-Sport Radar: detects moderate warning for same-day leg CrossFit and ignores skipped sessions', () => {
  const warningResult = analyzeMultiSportRadar({
    weekEvents: [
      {
        date: '2026-11-11',
        eventType: 'strength',
        title: 'Pernas Base',
        status: 'planned',
      },
      {
        date: '2026-11-11',
        eventType: 'crossfit',
        title: 'WOD Fran & Box Jump',
        status: 'planned',
      },
    ],
  });
  assert.equal(warningResult.status, 'warning');
  assert.equal(warningResult.conflicts[0].severity, 'moderate');

  const skippedCleanResult = analyzeMultiSportRadar({
    weekEvents: [
      {
        date: '2026-11-11',
        eventType: 'strength',
        title: 'Pernas Base',
        status: 'skipped',
      },
      {
        date: '2026-11-11',
        eventType: 'running',
        title: 'Tiros 400m',
        status: 'planned',
      },
    ],
  });
  assert.equal(skippedCleanResult.status, 'synergy');
  assert.equal(skippedCleanResult.conflicts.length, 0);
});
