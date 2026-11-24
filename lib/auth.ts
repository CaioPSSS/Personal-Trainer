import crypto from 'node:crypto';
import type { NextRequest } from 'next/server';

export const SESSION_COOKIE_NAME = 'pt_session';
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 days

const SESSION_TOKEN_PARTS = 4;

/**
 * Constant-time equality comparison using SHA-256 digests so lengths never leak.
 */
export function safeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const hashA = crypto.createHash('sha256').update(a, 'utf8').digest();
  const hashB = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function getSessionSigningKey(): Buffer | null {
  const raw = [
    process.env.SESSION_SECRET,
    process.env.APP_PASSWORD,
    process.env.INTERNAL_API_SECRET,
    process.env.CRON_SECRET,
  ]
    .map((v) => v?.trim())
    .find((v): v is string => Boolean(v && v.length > 0));

  if (!raw) return null;
  return crypto.createHmac('sha256', raw).update('pt-session-key-v1').digest();
}

export function getConfiguredApiTokens(): string[] {
  const rawTokens = [
    process.env.INTERNAL_API_SECRET,
    process.env.CRON_SECRET,
    process.env.ECOSYSTEM_SYNC_SECRET,
    process.env.APP_PASSWORD,
  ]
    .map((v) => v?.trim())
    .filter((v): v is string => Boolean(v && v.length > 0));

  return Array.from(new Set(rawTokens));
}

export function isAuthConfigured(): boolean {
  return Boolean(getSessionSigningKey() || getConfiguredApiTokens().length > 0);
}

export function verifyLoginPassword(password: string): boolean {
  if (typeof password !== 'string' || password.length === 0) return false;
  const candidates = [process.env.APP_PASSWORD, process.env.INTERNAL_API_SECRET]
    .map((v) => v?.trim())
    .filter((v): v is string => Boolean(v && v.length > 0));

  for (const candidate of candidates) {
    if (safeEqual(password, candidate)) {
      return true;
    }
  }
  return false;
}

export function createSessionToken(nowSec = Math.floor(Date.now() / 1000)): string {
  const key = getSessionSigningKey();
  if (!key) {
    throw new Error('Authentication secret is not configured on the server.');
  }

  const issuedAt = Math.floor(nowSec);
  const expiresAt = issuedAt + SESSION_MAX_AGE_SEC;
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = `${issuedAt}.${expiresAt}.${nonce}`;
  const sig = crypto.createHmac('sha256', key).update(payload).digest('hex');

  return `${payload}.${sig}`;
}

export function verifySessionToken(
  token: string | null | undefined,
  nowSec = Math.floor(Date.now() / 1000)
): boolean {
  if (!token || typeof token !== 'string') return false;

  const key = getSessionSigningKey();
  if (!key) return false;

  const parts = token.split('.');
  if (parts.length !== SESSION_TOKEN_PARTS) return false;

  const [issuedAtRaw, expiresAtRaw, nonce, sig] = parts;
  if (!/^\d+$/.test(issuedAtRaw) || !/^\d+$/.test(expiresAtRaw)) return false;
  if (!/^[a-f0-9]{32}$/i.test(nonce) || !/^[a-f0-9]{64}$/i.test(sig)) return false;

  const issuedAt = Number(issuedAtRaw);
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(expiresAt)) return false;
  if (nowSec > expiresAt || issuedAt > nowSec + 60) return false;

  const payload = `${issuedAtRaw}.${expiresAtRaw}.${nonce}`;
  const expectedSig = crypto.createHmac('sha256', key).update(payload).digest('hex');

  return safeEqual(sig, expectedSig);
}

export function extractCookie(request: Request | NextRequest, name: string): string | null {
  if ('cookies' in request && request.cookies && typeof request.cookies.get === 'function') {
    const cookieVal = request.cookies.get(name)?.value;
    if (cookieVal) return cookieVal;
  }

  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(';')) {
    const eqIndex = part.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = part.slice(0, eqIndex).trim();
    if (key === name) {
      const rawVal = part.slice(eqIndex + 1).trim();
      try {
        return decodeURIComponent(rawVal);
      } catch {
        return rawVal;
      }
    }
  }

  return null;
}

/**
 * Defense-in-depth CSRF check for cookie-authenticated mutations.
 * Never grants auth; only denies non-safe requests sent cross-site.
 */
function isCrossSiteMutation(request: Request | NextRequest): boolean {
  const method = (request.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return false;
  }

  const secFetchSite = request.headers.get('sec-fetch-site');
  if (secFetchSite && secFetchSite.toLowerCase() === 'cross-site') {
    return true;
  }

  const origin = request.headers.get('origin');
  if (origin) {
    try {
      const originHost = new URL(origin).host.toLowerCase();
      const allowedHosts = [
        request.headers.get('x-forwarded-host'),
        request.headers.get('host'),
      ]
        .filter((h): h is string => Boolean(h && h.trim().length > 0))
        .map((h) => h.split(',')[0].trim().toLowerCase());

      if (allowedHosts.length > 0 && !allowedHosts.includes(originHost)) {
        return true;
      }
    } catch {
      return true;
    }
  }

  return false;
}

export function isAuthorized(request: Request | NextRequest): boolean {
  const apiTokens = getConfiguredApiTokens();
  const authHeader = request.headers.get('authorization');
  const bearerMatch = authHeader?.match(/^Bearer\s+(.+)$/i);
  const bearerToken = bearerMatch?.[1]?.trim() || '';
  const internalToken = request.headers.get('x-internal-token')?.trim() || '';

  if (apiTokens.length > 0) {
    for (const expected of apiTokens) {
      if ((bearerToken && safeEqual(bearerToken, expected)) || (internalToken && safeEqual(internalToken, expected))) {
        return true;
      }
    }
  }

  const sessionToken = extractCookie(request, SESSION_COOKIE_NAME);
  if (sessionToken && verifySessionToken(sessionToken) && !isCrossSiteMutation(request)) {
    return true;
  }

  return false;
}

export function createCalendarFeedToken(): string | null {
  const feedSecret = process.env.CALENDAR_FEED_SECRET?.trim();
  const key = feedSecret
    ? crypto.createHash('sha256').update(feedSecret, 'utf8').digest()
    : getSessionSigningKey();

  if (!key) return null;
  return crypto.createHmac('sha256', key).update('pt-calendar-ics-feed-v1').digest('hex');
}

export function verifyCalendarFeedToken(token: string | null | undefined): boolean {
  if (!token || typeof token !== 'string') return false;
  const expected = createCalendarFeedToken();
  if (!expected) return false;
  return safeEqual(token.trim(), expected);
}

export function unauthorizedResponse(): Response {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}

export function getSessionCookieOptions(maxAge = SESSION_MAX_AGE_SEC) {
  return {
    name: SESSION_COOKIE_NAME,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  };
}
