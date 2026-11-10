import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  fetchDailyNutrition,
  reconcileEcosystemRange,
  getSyncConfig,
  fetchFromMetabolicTracker,
} from '@/lib/integrations/metabolic-tracker';
import { todayISO, shiftISODate } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (date) {
      // 1. Tenta buscar do cache local em WellnessDaily
      const cached = await prisma.wellnessDaily.findUnique({
        where: { date },
      });

      if (cached && (cached.caloriesConsumed != null || cached.calorieTarget != null)) {
        return NextResponse.json({
          success: true,
          source: 'cache',
          nutrition: {
            date,
            caloriesConsumed: cached.caloriesConsumed,
            proteinConsumed: cached.proteinConsumed,
            currentCalorieTarget: cached.calorieTarget,
            dietGoal: cached.dietGoal,
            weight: cached.bodyWeightKg,
          },
        });
      }

      // Se não estiver em cache, tenta buscar do Rastreador
      const live = await fetchDailyNutrition(date);
      return NextResponse.json({
        success: true,
        source: live ? 'live' : 'not_found',
        nutrition: live,
      });
    }

    if (startDate && endDate) {
      const logs = await prisma.wellnessDaily.findMany({
        where: {
          athleteProfileId: 'singleton',
          date: { gte: startDate, lte: endDate },
        },
        orderBy: { date: 'asc' },
      });

      return NextResponse.json({
        success: true,
        items: logs.map((l) => ({
          date: l.date,
          caloriesConsumed: l.caloriesConsumed,
          proteinConsumed: l.proteinConsumed,
          currentCalorieTarget: l.calorieTarget,
          dietGoal: l.dietGoal,
          weight: l.bodyWeightKg,
        })),
      });
    }

    return NextResponse.json({ error: 'Informe date ou startDate e endDate' }, { status: 400 });
  } catch (error) {
    console.error('[Metabolic Integration] Erro no GET:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action || 'reconcile';

    if (action === 'test_connection') {
      const { url } = await getSyncConfig();

      try {
        const { response: res } = await fetchFromMetabolicTracker(
          '/api/integrations/trainer/test',
          { method: 'GET' },
          3000
        );

        if (res.ok) {
          return NextResponse.json({
            success: true,
            status: 'connected',
            url,
          });
        }
        return NextResponse.json({
          success: false,
          status: res.status === 401 ? 'unauthorized' : 'error',
          statusCode: res.status,
          url,
        });
      } catch (connErr) {
        return NextResponse.json({
          success: false,
          status: 'offline',
          url,
          error: connErr instanceof Error ? connErr.message : String(connErr),
        });
      }
    }

    // Default: reconcile range (últimos 14 dias se não especificado)
    const defaultEnd = todayISO();
    const defaultStart = shiftISODate(defaultEnd, -14);

    const startDate = body.startDate || defaultStart;
    const endDate = body.endDate || defaultEnd;

    const result = await reconcileEcosystemRange(startDate, endDate);

    return NextResponse.json({
      success: true,
      action: 'reconcile',
      period: { startDate, endDate },
      result,
    });
  } catch (error) {
    console.error('[Metabolic Integration] Erro no POST:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
