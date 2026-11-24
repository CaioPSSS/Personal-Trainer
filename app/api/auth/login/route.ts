import { NextRequest, NextResponse } from 'next/server';
import {
  createSessionToken,
  getSessionCookieOptions,
  isAuthConfigured,
  verifyLoginPassword,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';

const MAX_FAILED_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const failedAttemptsByIp = new Map<string, RateLimitBucket>();

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

function isRateLimited(ip: string, nowMs: number): boolean {
  const bucket = failedAttemptsByIp.get(ip);
  if (!bucket) return false;
  if (nowMs >= bucket.resetAt) {
    failedAttemptsByIp.delete(ip);
    return false;
  }
  return bucket.count >= MAX_FAILED_ATTEMPTS;
}

function recordFailedAttempt(ip: string, nowMs: number): void {
  const bucket = failedAttemptsByIp.get(ip);
  if (!bucket || nowMs >= bucket.resetAt) {
    failedAttemptsByIp.set(ip, { count: 1, resetAt: nowMs + WINDOW_MS });
    return;
  }
  bucket.count += 1;
}

export async function POST(request: NextRequest) {
  const nowMs = Date.now();
  const clientIp = getClientIp(request);

  if (isRateLimited(clientIp, nowMs)) {
    return NextResponse.json(
      { error: 'Muitas tentativas incorretas. Aguarde alguns minutos e tente novamente.' },
      { status: 429 }
    );
  }

  if (!isAuthConfigured()) {
    return NextResponse.json(
      { error: 'Autenticação não configurada no servidor (defina APP_PASSWORD).' },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => null);
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!verifyLoginPassword(password)) {
    recordFailedAttempt(clientIp, nowMs);
    return NextResponse.json({ error: 'Senha incorreta.' }, { status: 401 });
  }

  failedAttemptsByIp.delete(clientIp);
  const token = createSessionToken();
  const response = NextResponse.json({ success: true });
  response.cookies.set({
    ...getSessionCookieOptions(),
    value: token,
  });

  return response;
}
