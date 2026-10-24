import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  fetchDetailedActivity,
  getAthleteActivities,
  isRunActivity,
  syncActivityRecord,
} from '@/lib/strava/client';
import { repairRunningRecords } from '@/lib/running/reconcile';
import { syncDaysToMetabolicTracker } from '@/lib/integrations/metabolic-tracker';

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
 * Synchronizes running activities from Strava.
 * Fetches detailed telemetry (including native calories and kilometer splits),
 * prevents duplicate cards/sessions on past days, runs self-healing repair,
 * and pushes consolidated daily totals to Meu Rastreador Metabólico.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const fullResync = Boolean(body?.fullResync);
    const customDays = body?.days ? Number(body.days) : undefined;

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

    // Determine sync time window:
    // If fullResync or no lastSyncAt, look back 30 days (or custom days).
    // Otherwise look back from lastSyncAt with a 2-day buffer for delayed GPS uploads.
    let afterTimestamp: number;
    if (customDays && customDays > 0) {
      afterTimestamp = Math.floor((Date.now() - customDays * 24 * 3600 * 1000) / 1000);
    } else if (fullResync || !integration.lastSyncAt) {
      afterTimestamp = Math.floor((Date.now() - 30 * 24 * 3600 * 1000) / 1000);
    } else {
      const lastSyncMs = integration.lastSyncAt.getTime();
      const twoDaysMs = 2 * 24 * 3600 * 1000;
      afterTimestamp = Math.floor((lastSyncMs - twoDaysMs) / 1000);
    }

    let activities;
    try {
      activities = await getAthleteActivities(afterTimestamp, undefined, 100);
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

    const runActivities = activities.filter(isRunActivity);
    const affectedDates = new Set<string>();
    const syncedRuns = [];
    let createdCount = 0;
    let updatedCount = 0;
    let mergedCount = 0;

    // Process each running activity
    for (const act of runActivities) {
      // Fetch detailed activity to obtain real calories and splits (omitted from the summary endpoint)
      const detailed = await fetchDetailedActivity(act);
      const outcome = await syncActivityRecord(detailed, { syncMetabolic: false });
      if (outcome) {
        if (outcome.status === 'created') createdCount++;
        else if (outcome.status === 'updated') updatedCount++;
        else if (outcome.status === 'merged') mergedCount++;

        for (const d of outcome.affectedDates) {
          affectedDates.add(d);
        }

        syncedRuns.push({
          id: outcome.execution.id,
          stravaActivityId: outcome.execution.stravaActivityId,
          date: outcome.execution.date,
          distanceKm: outcome.execution.distanceKm,
          avgPaceSec: outcome.execution.avgPaceSec,
          caloriesBurned: outcome.execution.caloriesBurned,
          caloriesSource: outcome.execution.caloriesSource,
          status: outcome.status,
        });
      }
    }

    // Run self-healing deduplication and calendar card harmonization
    const repairReport = await repairRunningRecords(60);
    for (const d of repairReport.affectedDates) {
      affectedDates.add(d);
    }

    // Consolidated daily sync to Meu Rastreador Metabólico (sends sum of all sports per date)
    if (affectedDates.size > 0) {
      await syncDaysToMetabolicTracker(affectedDates, { clearIfEmpty: true });
    }

    const now = new Date();
    await prisma.stravaIntegration.update({
      where: { id: 'singleton' },
      data: { lastSyncAt: now },
    });

    return NextResponse.json({
      success: true,
      count: syncedRuns.length,
      createdCount,
      updatedCount,
      mergedCount,
      duplicatesRemoved: repairReport.duplicatesMerged,
      cardsHarmonized: repairReport.cardsHarmonized,
      sessionsRestored: repairReport.sessionsRestored,
      syncedRuns,
      lastSyncAt: now.toISOString(),
    });
  } catch (error) {
    console.error('[Strava Sync] Erro durante sincronização:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Falha na sincronização do Strava.',
      },
      { status: 500 }
    );
  }
}
