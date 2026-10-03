import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  fetchDailyNutrition,
  reconcileEcosystemRange,
  getSyncConfig,
} from '@/lib/integrations/metabolic-tracker';

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
      const { url, secret } = await getSyncConfig();

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const res = await fetch(`${url}/api/integrations/trainer/test`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${secret}`,
            'x-source-app': 'Personal-Trainer',
          },
          signal: controller.signal,
        }).finally(() => clearTimeout(timeoutId));

        if (res.ok) {
          return NextResponse.json({
            success: true,
            status: 'connected',
            url,
          });
        }
        return NextResponse.json({
          success: false,
          status: 'error',
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
    const today = new Date();
    const defaultEnd = today.toISOString().split('T')[0];
    const past = new Date(today);
    past.setDate(past.getDate() - 14);
    const defaultStart = past.toISOString().split('T')[0];

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
