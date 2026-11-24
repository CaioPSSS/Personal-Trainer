import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SESSION_COOKIE_NAME,
  createCalendarFeedToken,
  createSessionToken,
  isAuthConfigured,
  isAuthorized,
  verifyCalendarFeedToken,
  verifyLoginPassword,
  verifySessionToken,
} from './auth';

function withAuthEnv(
  vars: Record<string, string | undefined>,
  fn: () => void | Promise<void>
): void | Promise<void> {
  const keys = [
    'APP_PASSWORD',
    'SESSION_SECRET',
    'INTERNAL_API_SECRET',
    'CRON_SECRET',
    'ECOSYSTEM_SYNC_SECRET',
    'CALENDAR_FEED_SECRET',
    'NEXT_PUBLIC_INTERNAL_SECRET',
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

test('Auth: fails closed when no server secrets are configured', () => {
  withAuthEnv({}, () => {
    assert.equal(isAuthConfigured(), false);
    assert.equal(verifyLoginPassword('anything'), false);
    assert.equal(verifyCalendarFeedToken('anything'), false);

    const req = new Request('https://example.com/api/analytics', {
      method: 'GET',
      headers: {
        'sec-fetch-site': 'same-origin',
        origin: 'https://example.com',
        referer: 'https://example.com/',
        host: 'example.com',
        'x-forwarded-host': 'example.com',
      },
    });
    assert.equal(isAuthorized(req), false);
  });
});

test('Auth: rejects forged same-origin / origin headers and NEXT_PUBLIC_INTERNAL_SECRET', () => {
  withAuthEnv(
    {
      APP_PASSWORD: 'super-secret-password',
      NEXT_PUBLIC_INTERNAL_SECRET: 'leaked-client-secret',
    },
    () => {
      const forgedSameOrigin = new Request('https://example.com/api/setup', {
        method: 'POST',
        headers: {
          'sec-fetch-site': 'same-origin',
          origin: 'https://example.com',
          referer: 'https://example.com/settings',
          host: 'example.com',
          'x-forwarded-host': 'example.com',
          'x-internal-token': 'leaked-client-secret',
        },
      });
      assert.equal(isAuthorized(forgedSameOrigin), false);
    }
  );
});

test('Auth: accepts configured Bearer and x-internal-token server secrets', () => {
  withAuthEnv(
    {
      INTERNAL_API_SECRET: 'internal-secret-123',
      CRON_SECRET: 'cron-secret-456',
    },
    () => {
      const bearerReq = new Request('https://example.com/api/coach/master/generate', {
        method: 'POST',
        headers: { Authorization: 'Bearer cron-secret-456' },
      });
      assert.equal(isAuthorized(bearerReq), true);

      const headerReq = new Request('https://example.com/api/analytics', {
        method: 'GET',
        headers: { 'x-internal-token': 'internal-secret-123' },
      });
      assert.equal(isAuthorized(headerReq), true);

      const wrongReq = new Request('https://example.com/api/analytics', {
        method: 'GET',
        headers: { Authorization: 'Bearer wrong-token' },
      });
      assert.equal(isAuthorized(wrongReq), false);
    }
  );
});

test('Auth: validates signed session cookies, rejects tampered/expired tokens, and blocks cross-site mutations', () => {
  withAuthEnv({ APP_PASSWORD: 'my-login-pass' }, () => {
    assert.equal(verifyLoginPassword('my-login-pass'), true);
    assert.equal(verifyLoginPassword('wrong-pass'), false);

    const nowSec = 1_750_000_000;
    const token = createSessionToken(nowSec);
    assert.equal(verifySessionToken(token, nowSec + 60), true);
    assert.equal(verifySessionToken(token, nowSec + 60 * 60 * 24 * 31), false);

    const parts = token.split('.');
    parts[3] = '0'.repeat(64);
    assert.equal(verifySessionToken(parts.join('.'), nowSec + 60), false);

    const liveToken = createSessionToken();
    const validGet = new Request('https://app.example.com/api/analytics', {
      method: 'GET',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${liveToken}`,
        host: 'app.example.com',
      },
    });
    assert.equal(isAuthorized(validGet), true);

    const sameSitePost = new Request('https://app.example.com/api/setup', {
      method: 'POST',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${liveToken}`,
        host: 'app.example.com',
        origin: 'https://app.example.com',
        'sec-fetch-site': 'same-origin',
      },
    });
    assert.equal(isAuthorized(sameSitePost), true);

    const crossSiteOriginPost = new Request('https://app.example.com/api/setup', {
      method: 'POST',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${liveToken}`,
        host: 'app.example.com',
        origin: 'https://evil.example.com',
      },
    });
    assert.equal(isAuthorized(crossSiteOriginPost), false);

    const crossSiteSecFetchPost = new Request('https://app.example.com/api/setup', {
      method: 'POST',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${liveToken}`,
        host: 'app.example.com',
        'sec-fetch-site': 'cross-site',
      },
    });
    assert.equal(isAuthorized(crossSiteSecFetchPost), false);
  });
});

test('Auth: generates and verifies signed calendar ICS feed tokens', () => {
  withAuthEnv({ APP_PASSWORD: 'my-login-pass' }, () => {
    const feedToken = createCalendarFeedToken();
    assert.ok(feedToken && feedToken.length === 64);
    assert.equal(verifyCalendarFeedToken(feedToken), true);
    assert.equal(verifyCalendarFeedToken('invalid-token'), false);
  });
});
