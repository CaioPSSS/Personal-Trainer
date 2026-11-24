import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized, safeEqual, unauthorizedResponse } from '@/lib/auth';
import { exchangeToken } from '@/lib/strava/client';

export const dynamic = 'force-dynamic';

const STRAVA_OAUTH_STATE_COOKIE = 'pt_strava_oauth_state';

function redirectWithClearedState(url: string) {
  const response = NextResponse.redirect(url);
  response.cookies.set({
    name: STRAVA_OAUTH_STATE_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/strava/callback',
    maxAge: 0,
  });
  return response;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return unauthorizedResponse();
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const state = searchParams.get('state') || '';
  const expectedState = req.cookies.get(STRAVA_OAUTH_STATE_COOKIE)?.value || '';
  const origin = req.nextUrl.origin;

  if (!state || !expectedState || !safeEqual(state, expectedState)) {
    console.warn('[Strava Callback] Estado OAuth inválido ou ausente.');
    return redirectWithClearedState(`${origin}/running?strava_error=invalid_state`);
  }

  if (error || !code) {
    console.warn('[Strava Callback] Autorização cancelada ou código ausente:', error);
    return redirectWithClearedState(
      `${origin}/running?strava_error=${encodeURIComponent(error || 'missing_code')}`
    );
  }

  try {
    await exchangeToken(code);
    return redirectWithClearedState(`${origin}/running?strava_connected=true`);
  } catch (err) {
    console.error('[Strava Callback] Falha na troca de token Strava:', err);
    return redirectWithClearedState(`${origin}/running?strava_error=token_exchange_failed`);
  }
}
