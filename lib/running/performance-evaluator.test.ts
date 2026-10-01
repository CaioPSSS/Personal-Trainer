import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateRunningPerformance,
  formatPace,
  formatDuration,
} from './performance-evaluator';

test('Running Performance Evaluator: perfect execution hits Zone 2 target and distance within 100%', () => {
  const result = evaluateRunningPerformance({
    session: {
      title: 'Easy Aerobic Run',
      sessionType: 'easy',
      totalDistanceKm: 5.0,
      targetPaceSec: 330, // 5:30/km
      targetHrZone: 'zone2',
      scheduledDate: '2026-09-30',
    },
    execution: {
      distanceKm: 5.1,
      durationSeconds: 1683, // ~28:03 -> 330s/km
      avgPaceSec: 330,
      avgHeartRate: 142,
      maxHeartRate: 151,
      cadenceAvg: 172,
      splits: [
        { km: 1, paceSec: 335, avgHr: 138 },
        { km: 2, paceSec: 332, avgHr: 141 },
        { km: 3, paceSec: 330, avgHr: 143 },
        { km: 4, paceSec: 328, avgHr: 144 },
        { km: 5, paceSec: 325, avgHr: 146 },
      ],
      date: '2026-09-30',
    },
    hrZones: {
      zone2: { min: 130, max: 148, label: 'Zona 2 (Aeróbica)' },
    },
  });

  assert.equal(result.distance.actualKm, 5.1);
  assert.equal(result.distance.targetKm, 5.0);
  assert.equal(result.distance.status, 'optimal');
  assert.equal(result.pace.actualFormatted, '5:30/km');
  assert.equal(result.pace.targetFormatted, '5:30/km');
  assert.equal(result.pace.status, 'optimal');
  assert.equal(result.heartRate.status, 'in_zone');
  assert.equal(result.cadence.status, 'optimal');
  assert.ok(result.adherenceScore >= 90);
  assert.equal(result.adherenceGrade, 'elite');
  assert.match(result.splits.pacingStrategy, /Split Negativo/i);
});

test('Running Performance Evaluator: detect excessive speed on easy run and heart rate exceeding zone', () => {
  const result = evaluateRunningPerformance({
    session: {
      title: 'Recovery Run',
      sessionType: 'recovery',
      totalDistanceKm: 4.0,
      targetPaceSec: 360, // 6:00/km
      targetHrZone: 'zone1',
      scheduledDate: '2026-09-30',
    },
    execution: {
      distanceKm: 4.2,
      durationSeconds: 1260, // ~300s/km -> 5:00/km (60s faster than target!)
      avgPaceSec: 300,
      avgHeartRate: 165, // way above zone 1 (max 130)
      date: '2026-09-30',
    },
    hrZones: {
      zone1: { min: 110, max: 130, label: 'Zona 1 (Regenerativo)' },
    },
  });

  assert.equal(result.pace.status, 'faster_than_planned');
  assert.equal(result.heartRate.status, 'above_zone');
  assert.ok(result.adherenceScore < 85);
});

test('Running Performance Evaluator: helpers formatPace and formatDuration correctly', () => {
  assert.equal(formatPace(300), '5:00/km');
  assert.equal(formatPace(325), '5:25/km');
  assert.equal(formatPace(0), '--:--');
  assert.equal(formatDuration(185), '3m 5s');
  assert.equal(formatDuration(3665), '1h 1m');
});
