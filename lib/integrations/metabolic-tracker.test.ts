import { test } from 'node:test';
import assert from 'node:assert';
import { syncActivityToMetabolicTracker } from './metabolic-tracker';

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
