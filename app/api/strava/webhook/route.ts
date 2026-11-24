import { NextRequest, NextResponse, after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { safeEqual } from '@/lib/auth';
import {
  getActivity,
  isRunActivity,
  removeStravaActivity,
  STRAVA_CONFIG,
  syncActivityRecord,
} from '@/lib/strava/client';

export const dynamic = 'force-dynamic';

/**
 * Strava Webhook Verification Handshake
 * Responds to GET request with hub.challenge when subscribing.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token') || '';
  const challenge = searchParams.get('hub.challenge');

  const expectedToken = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN?.trim();
  if (!expectedToken) {
    return NextResponse.json(
      { error: 'Webhook verification token is not configured.' },
      { status: 503 }
    );
  }

  if (mode === 'subscribe' && challenge) {
    if (token && safeEqual(token, expectedToken)) {
      return NextResponse.json({ 'hub.challenge': challenge }, { status: 200 });
    }
    return NextResponse.json({ error: 'Token de verificação inválido.' }, { status: 403 });
  }

  return NextResponse.json({ error: 'Parâmetros de webhook inválidos.' }, { status: 400 });
}

/**
 * Strava Webhook Event Ingestion
 * Validates owner_id / subscription_id, responds immediately with HTTP 200 (within Strava 2s threshold),
 * and delegates processing (including verification against Strava API) to Next.js after().
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 });
    }

    const expectedSubId = process.env.STRAVA_WEBHOOK_SUBSCRIPTION_ID?.trim();
    if (expectedSubId && String(body.subscription_id ?? '') !== expectedSubId) {
      return NextResponse.json({ error: 'Invalid subscription.' }, { status: 403 });
    }

    const integration = await prisma.stravaIntegration.findUnique({
      where: { id: 'singleton' },
      select: { athleteStravaId: true },
    });
    const expectedOwnerId = integration?.athleteStravaId || STRAVA_CONFIG.defaultAthleteId || null;

    if (!expectedOwnerId || Number(body.owner_id) !== expectedOwnerId) {
      return NextResponse.json({ error: 'Unknown athlete owner.' }, { status: 403 });
    }

    if (body.object_type === 'activity') {
      const activityId = Number(body.object_id);
      if (!Number.isSafeInteger(activityId) || activityId <= 0) {
        return NextResponse.json({ error: 'object_id inválido.' }, { status: 400 });
      }

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
            // Confirm deletion or sport change directly against Strava API before deleting local data
            try {
              const activity = await getActivity(activityId);
              if (isRunActivity(activity)) {
                console.warn(
                  `[Strava Webhook] Evento delete ignorado: atividade ${activityId} ainda existe como corrida no Strava.`
                );
                return;
              }
            } catch (verifyErr) {
              const msg = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
              if (!msg.includes('404')) {
                console.error(
                  `[Strava Webhook] Falha ao confirmar exclusão da atividade ${activityId} no Strava:`,
                  verifyErr
                );
                return;
              }
            }

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
