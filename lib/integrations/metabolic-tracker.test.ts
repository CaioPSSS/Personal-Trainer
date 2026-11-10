import { test } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import {
  syncActivityToMetabolicTracker,
  deriveDailyTrainingType,
  getCandidateSyncSecrets,
  fetchFromMetabolicTracker,
  DEFAULT_METABOLIC_SECRET,
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

test('Metabolic Tracker: getCandidateSyncSecrets includes DEFAULT_METABOLIC_SECRET and deduplicates', () => {
  delete process.env.ECOSYSTEM_SYNC_SECRET;
  delete process.env.APP_PASSWORD;
  delete process.env.CRON_SECRET;

  const secrets = getCandidateSyncSecrets();
  assert.strictEqual(secrets[0], DEFAULT_METABOLIC_SECRET);
  assert.ok(secrets.includes('dev_sync_secret_metabolic'));
});

test('Metabolic Tracker: fetchFromMetabolicTracker retries candidate secrets on HTTP 401', async () => {
  process.env.ECOSYSTEM_SYNC_SECRET = 'stale-secret';
  delete process.env.APP_PASSWORD;
  delete process.env.CRON_SECRET;

  const receivedTokens: string[] = [];
  const server = http.createServer((req, res) => {
    const auth = req.headers.authorization || '';
    const token = auth.replace(/^Bearer\s+/i, '');
    receivedTokens.push(token);

    if (token === DEFAULT_METABOLIC_SECRET) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'connected' }));
    } else {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
    }
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  process.env.METABOLIC_TRACKER_URL = `http://127.0.0.1:${port}`;

  try {
    const { response } = await fetchFromMetabolicTracker('/api/integrations/trainer/test');
    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(receivedTokens, ['stale-secret', DEFAULT_METABOLIC_SECRET]);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
