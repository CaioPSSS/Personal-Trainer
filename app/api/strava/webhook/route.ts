import { NextRequest, NextResponse, after } from 'next/server';
import { getActivity, removeStravaActivity, syncActivityRecord } from '@/lib/strava/client';

export const dynamic = 'force-dynamic';

/**
 * Strava Webhook Verification Handshake
 * Responds to GET request with hub.challenge when subscribing.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const expectedToken =
    process.env.STRAVA_WEBHOOK_VERIFY_TOKEN || 'personal_trainer_strava_secure_verify_2026';

  if (mode === 'subscribe') {
    if (!expectedToken || token === expectedToken) {
      return NextResponse.json({ 'hub.challenge': challenge }, { status: 200 });
    }
    return NextResponse.json({ error: 'Token de verificação inválido.' }, { status: 403 });
  }

  return NextResponse.json({ error: 'Parâmetros de webhook inválidos.' }, { status: 400 });
}

/**
 * Strava Webhook Event Ingestion
 * Responds immediately with HTTP 200 (within Strava 2s threshold) and delegates
 * execution processing to Next.js after() to prevent Vercel serverless cancellation.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.object_type === 'activity') {
      const activityId = body.object_id;

      if (body.aspect_type === 'create' || body.aspect_type === 'update') {
        after(async () => {
          try {
            const activity = await getActivity(activityId);
            await syncActivityRecord(activity);
            console.log(`[Strava Webhook] Atividade ${activityId} processada com sucesso via after().`);
          } catch (err) {
            console.error(`[Strava Webhook] Erro ao sincronizar atividade ${activityId}:`, err);
          }
        });
      } else if (body.aspect_type === 'delete') {
        after(async () => {
          try {
            await removeStravaActivity(activityId);
            console.log(`[Strava Webhook] Atividade ${activityId} removida com sucesso via after().`);
          } catch (err) {
            console.error(`[Strava Webhook] Erro ao remover atividade ${activityId}:`, err);
          }
        });
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error('[Strava Webhook] Erro ao receber evento:', error);
    return NextResponse.json({ received: false }, { status: 200 });
  }
}
