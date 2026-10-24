import { test } from 'node:test';
import assert from 'node:assert';
import {
  syncActivityToMetabolicTracker,
  deriveDailyTrainingType,
} from './metabolic-tracker';

test('Metabolic Tracker Client: handles offline / unreachable service gracefully without throwing', async () => {
  // Test with invalid port to ensure offline/connection refused is caught safely
  process.env.METABOLIC_TRACKER_URL = 'http://127.0.0.1:59999';
  process.env.ECOSYSTEM_SYNC_SECRET = 'test-secret';

  const result = await syncActivityToMetabolicTracker({
    date: '2026-10-02',
    caloriesBurned: 450,
    trainingType: 'Musculação',
    workoutTitle: 'Upper Body A',
  });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.offline, true);
});

test('Metabolic Tracker: deriveDailyTrainingType correctly combines multi-sport kinds', () => {
  assert.strictEqual(deriveDailyTrainingType([]), 'Descanso');
  assert.strictEqual(deriveDailyTrainingType(['strength']), 'Musculação');
  assert.strictEqual(deriveDailyTrainingType(['running']), 'Corrida');
  assert.strictEqual(deriveDailyTrainingType(['cross']), 'Cross-Training');
  // Mixed sports collapse into Híbrido
  assert.strictEqual(deriveDailyTrainingType(['strength', 'running']), 'Híbrido');
  assert.strictEqual(deriveDailyTrainingType(['strength', 'cross']), 'Híbrido');
  assert.strictEqual(deriveDailyTrainingType(['running', 'cross']), 'Híbrido');
});
