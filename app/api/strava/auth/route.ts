import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizationUrl } from '@/lib/strava/client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const origin = req.nextUrl.origin;
    const authUrl = getAuthorizationUrl(origin);
    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error('[Strava Auth] Erro ao redirecionar para autorização:', error);
    return NextResponse.json(
      { error: 'Falha ao iniciar autenticação Strava.' },
      { status: 500 }
    );
  }
}
