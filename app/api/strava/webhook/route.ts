import { NextRequest, NextResponse } from 'next/server';
import { getActivity, syncActivityRecord } from '@/lib/strava/client';

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
 * Must respond within 2 seconds with HTTP 200 to acknowledge Strava push.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (
      body.object_type === 'activity' &&
      (body.aspect_type === 'create' || body.aspect_type === 'update')
    ) {
      const activityId = body.object_id;

      // Asynchronously fetch activity details and sync to RunningExecution & CalendarEvent
      void (async () => {
        try {
          const activity = await getActivity(activityId);
          await syncActivityRecord(activity);
          console.log(`[Strava Webhook] Atividade ${activityId} processada com sucesso.`);
        } catch (err) {
          console.error(`[Strava Webhook] Erro ao sincronizar atividade ${activityId}:`, err);
        }
      })();
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error('[Strava Webhook] Erro ao receber evento:', error);
    return NextResponse.json({ received: false }, { status: 200 });
  }
}
