import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized, unauthorizedResponse } from '@/lib/auth';
import { getAuthorizationUrl } from '@/lib/strava/client';

export const dynamic = 'force-dynamic';

export const STRAVA_OAUTH_STATE_COOKIE = 'pt_strava_oauth_state';

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return unauthorizedResponse();
  }

  try {
    const origin = req.nextUrl.origin;
    const state = crypto.randomBytes(32).toString('hex');
    const authUrl = getAuthorizationUrl(origin, state);
    const response = NextResponse.redirect(authUrl);
    response.cookies.set({
      name: STRAVA_OAUTH_STATE_COOKIE,
      value: state,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/api/strava/callback',
      maxAge: 600,
    });
    return response;
  } catch (error) {
    console.error('[Strava Auth] Erro ao redirecionar para autorização:', error);
    return NextResponse.json(
      { error: 'Falha ao iniciar autenticação Strava.' },
      { status: 500 }
    );
  }
}
