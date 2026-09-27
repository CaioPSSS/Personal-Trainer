import { NextRequest, NextResponse } from 'next/server';
import { exchangeToken } from '@/lib/strava/client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const origin = req.nextUrl.origin;

  if (error || !code) {
    console.warn('[Strava Callback] Autorização cancelada ou código ausente:', error);
    return NextResponse.redirect(
      `${origin}/running?strava_error=${encodeURIComponent(error || 'missing_code')}`
    );
  }

  try {
    await exchangeToken(code);
    return NextResponse.redirect(`${origin}/running?strava_connected=true`);
  } catch (err) {
    console.error('[Strava Callback] Falha na troca de token Strava:', err);
    return NextResponse.redirect(`${origin}/running?strava_error=token_exchange_failed`);
  }
}
