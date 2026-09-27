import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAthleteActivities, syncActivityRecord } from '@/lib/strava/client';

export const dynamic = 'force-dynamic';

/**
 * Returns Strava integration status and last synchronization date.
 */
export async function GET() {
  try {
    const integration = await prisma.stravaIntegration.findUnique({
      where: { id: 'singleton' },
    });

    return NextResponse.json({
      connected: !!integration?.accessToken,
      athleteStravaId: integration?.athleteStravaId ?? null,
      scope: integration?.scope ?? null,
      lastSyncAt: integration?.lastSyncAt?.toISOString() ?? null,
    });
  } catch (error) {
    console.error('[Strava Sync] Erro ao buscar status de conexão:', error);
    return NextResponse.json(
      { error: 'Falha ao buscar status do Strava.' },
      { status: 500 }
    );
  }
}

/**
 * Manually fetches and synchronizes running activities from the past 30 days.
 */
export async function POST() {
  try {
    const integration = await prisma.stravaIntegration.findUnique({
      where: { id: 'singleton' },
    });

    if (!integration?.accessToken) {
      return NextResponse.json(
        {
          success: false,
          error: 'Strava não está conectado. Conecte sua conta em Configurações.',
          requiresReauth: true,
        },
        { status: 400 }
      );
    }

    // Check scope if known
    if (integration.scope && !integration.scope.includes('activity:read')) {
      return NextResponse.json(
        {
          success: false,
          error:
            'A autorização atual do Strava não possui permissão para ler atividades (activity:read_all). Por favor, reconecte o Strava para autorizar.',
          requiresReauth: true,
        },
        { status: 403 }
      );
    }

    // 30 days ago in epoch seconds
    const thirtyDaysAgo = Math.floor((Date.now() - 30 * 24 * 3600 * 1000) / 1000);

    let activities;
    try {
      activities = await getAthleteActivities(thirtyDaysAgo, undefined, 100);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (
        errMsg.includes('401') ||
        errMsg.includes('activity:read_permission') ||
        errMsg.includes('Unauthorized')
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              'A autorização do Strava expirou ou requer permissão activity:read_all. Por favor, conecte novamente.',
            requiresReauth: true,
          },
          { status: 401 }
        );
      }
      throw err;
    }

    const syncedRuns = [];
    for (const activity of activities) {
      const execution = await syncActivityRecord(activity);
      if (execution) {
        syncedRuns.push({
          id: execution.id,
          stravaActivityId: execution.stravaActivityId,
          date: execution.date,
          distanceKm: execution.distanceKm,
          avgPaceSec: execution.avgPaceSec,
        });
      }
    }

    const now = new Date();
    await prisma.stravaIntegration.update({
      where: { id: 'singleton' },
      data: { lastSyncAt: now },
    });

    return NextResponse.json({
      success: true,
      count: syncedRuns.length,
      syncedRuns,
      lastSyncAt: now.toISOString(),
    });
  } catch (error) {
    console.error('[Strava Sync] Erro durante sincronização manual:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Falha na sincronização do Strava.',
      },
      { status: 500 }
    );
  }
}
