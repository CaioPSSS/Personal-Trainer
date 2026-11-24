import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  DEFAULT_METABOLIC_URL,
  deriveDailyTrainingType,
  fetchFromMetabolicTracker,
  getCandidateSyncSecrets,
  isPrivateOrReservedIp,
  syncActivityToMetabolicTracker,
  validateMetabolicTrackerUrl,
} from './metabolic-tracker';

function withMetabolicEnv(
  vars: Record<string, string | undefined>,
  fn: () => void | Promise<void>
): void | Promise<void> {
  const keys = [
    'METABOLIC_TRACKER_URL',
    'METABOLIC_TRACKER_ALLOWED_HOSTS',
    'ECOSYSTEM_SYNC_SECRET',
    'APP_PASSWORD',
    'CRON_SECRET',
  ];
  const prev = new Map<string, string | undefined>();
  for (const k of keys) {
    prev.set(k, process.env[k]);
    delete process.env[k];
  }
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }

  const restore = () => {
    for (const k of keys) {
      const oldVal = prev.get(k);
      if (oldVal === undefined) delete process.env[k];
      else process.env[k] = oldVal;
    }
  };

  try {
    const out = fn();
    if (out && typeof (out as Promise<void>).then === 'function') {
      return (out as Promise<void>).finally(restore);
    }
    restore();
    return out;
  } catch (err) {
    restore();
    throw err;
  }
}

test('Metabolic Tracker Client: handles offline / unreachable service gracefully without throwing', async () => {
  await withMetabolicEnv(
    {
      METABOLIC_TRACKER_URL: 'http://127.0.0.1:59999',
      ECOSYSTEM_SYNC_SECRET: 'test-secret',
    },
    async () => {
      const result = await syncActivityToMetabolicTracker(
        {
          date: '2026-10-02',
          caloriesBurned: 450,
          trainingType: 'Musculação',
          workoutTitle: 'Upper Body A',
        },
        { allowInsecureLocalhostForTest: true }
      );

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.offline, true);
    }
  );
});

test('Metabolic Tracker: deriveDailyTrainingType correctly combines multi-sport kinds', () => {
  assert.strictEqual(deriveDailyTrainingType([]), 'Descanso');
  assert.strictEqual(deriveDailyTrainingType(['strength']), 'Musculação');
  assert.strictEqual(deriveDailyTrainingType(['running']), 'Corrida');
  assert.strictEqual(deriveDailyTrainingType(['cross']), 'Cross-Training');
  assert.strictEqual(deriveDailyTrainingType(['strength', 'running']), 'Híbrido');
  assert.strictEqual(deriveDailyTrainingType(['strength', 'cross']), 'Híbrido');
  assert.strictEqual(deriveDailyTrainingType(['running', 'cross']), 'Híbrido');
});

test('Metabolic Tracker: getCandidateSyncSecrets uses only configured server secrets and deduplicates', () => {
  withMetabolicEnv({}, () => {
    assert.deepStrictEqual(getCandidateSyncSecrets(), []);
  });

  withMetabolicEnv(
    {
      ECOSYSTEM_SYNC_SECRET: 'shared-secret',
      APP_PASSWORD: 'shared-secret',
      CRON_SECRET: 'cron-secret',
    },
    () => {
      assert.deepStrictEqual(getCandidateSyncSecrets(), ['shared-secret', 'cron-secret']);
    }
  );
});

test('Metabolic Tracker SSRF: isPrivateOrReservedIp detects private IPv4, IPv6, and IPv4-mapped ranges', () => {
  assert.strictEqual(isPrivateOrReservedIp('127.0.0.1'), true);
  assert.strictEqual(isPrivateOrReservedIp('10.0.0.5'), true);
  assert.strictEqual(isPrivateOrReservedIp('172.16.5.1'), true);
  assert.strictEqual(isPrivateOrReservedIp('192.168.1.10'), true);
  assert.strictEqual(isPrivateOrReservedIp('169.254.169.254'), true);
  assert.strictEqual(isPrivateOrReservedIp('100.64.0.1'), true);
  assert.strictEqual(isPrivateOrReservedIp('::1'), true);
  assert.strictEqual(isPrivateOrReservedIp('fe80::1'), true);
  assert.strictEqual(isPrivateOrReservedIp('fc00::1'), true);
  assert.strictEqual(isPrivateOrReservedIp('::ffff:127.0.0.1'), true);
  assert.strictEqual(isPrivateOrReservedIp('::ffff:7f00:1'), true);
  assert.strictEqual(isPrivateOrReservedIp('::ffff:169.254.169.254'), true);
  assert.strictEqual(isPrivateOrReservedIp('8.8.8.8'), false);
  assert.strictEqual(isPrivateOrReservedIp('2606:4700:4700::1111'), false);
});

test('Metabolic Tracker SSRF: validateMetabolicTrackerUrl enforces HTTPS allowlist and blocks internal/unlisted targets', () => {
  withMetabolicEnv(
    { METABOLIC_TRACKER_ALLOWED_HOSTS: 'tracker-staging.example.com' },
    () => {
      assert.strictEqual(validateMetabolicTrackerUrl(DEFAULT_METABOLIC_URL).valid, true);
      assert.strictEqual(
        validateMetabolicTrackerUrl('https://tracker-staging.example.com/').valid,
        true
      );

      assert.strictEqual(validateMetabolicTrackerUrl('http://meu-rastreador-metabolico-p7xl.vercel.app').valid, false);
      assert.strictEqual(validateMetabolicTrackerUrl('https://127.0.0.1').valid, false);
      assert.strictEqual(validateMetabolicTrackerUrl('https://169.254.169.254').valid, false);
      assert.strictEqual(validateMetabolicTrackerUrl('https://localhost:3000').valid, false);
      assert.strictEqual(validateMetabolicTrackerUrl('https://[::1]').valid, false);
      assert.strictEqual(validateMetabolicTrackerUrl('https://evil.example.com').valid, false);
      assert.strictEqual(
        validateMetabolicTrackerUrl('https://user:pass@meu-rastreador-metabolico-p7xl.vercel.app').valid,
        false
      );
      assert.strictEqual(
        validateMetabolicTrackerUrl('https://meu-rastreador-metabolico-p7xl.vercel.app/api/steal').valid,
        false
      );
    }
  );
});

test('Metabolic Tracker: fetchFromMetabolicTracker retries candidate secrets on HTTP 401 and blocks redirects', async () => {
  const receivedTokens: string[] = [];
  let redirectMode = false;

  const server = http.createServer((req, res) => {
    if (redirectMode) {
      res.writeHead(302, { Location: 'https://evil.example.com/collect' });
      res.end();
      return;
    }

    const auth = req.headers.authorization || '';
    const token = auth.replace(/^Bearer\s+/i, '');
    receivedTokens.push(token);

    if (token === 'fresh-app-password') {
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

  try {
    await withMetabolicEnv(
      {
        METABOLIC_TRACKER_URL: `http://127.0.0.1:${port}`,
        ECOSYSTEM_SYNC_SECRET: 'stale-secret',
        APP_PASSWORD: 'fresh-app-password',
      },
      async () => {
        const { response } = await fetchFromMetabolicTracker(
          '/api/integrations/trainer/test',
          {},
          3000,
          { allowInsecureLocalhostForTest: true }
        );
        assert.strictEqual(response.status, 200);
        assert.deepStrictEqual(receivedTokens, ['stale-secret', 'fresh-app-password']);

        redirectMode = true;
        await assert.rejects(() =>
          fetchFromMetabolicTracker(
            '/api/integrations/trainer/test',
            {},
            3000,
            { allowInsecureLocalhostForTest: true }
          )
        );
      }
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
