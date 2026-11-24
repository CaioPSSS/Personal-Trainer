import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAuthorized, unauthorizedResponse } from '@/lib/auth';
import { Prisma } from '@prisma/client';
import {
  syncPlannedCrossTraining,
  RecurringCrossTrainingRule,
  normalizeDayOfWeek,
} from '@/lib/scheduling/cross-training-scheduler';
import { rebalanceWeekSchedule } from '@/lib/scheduling/strength-scheduler';
import { shiftISODate, todayISO } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return unauthorizedResponse();
  }

  try {
    const athlete = await prisma.athleteProfile.findUnique({
      where: { id: 'singleton' },
      select: { recurringCrossTraining: true },
    });

    const rules = (athlete?.recurringCrossTraining as unknown as RecurringCrossTrainingRule[]) || [];
    return NextResponse.json({ rules });
  } catch (error) {
    console.error('[Recurring Cross-Training GET] Erro ao buscar regras:', error);
    return NextResponse.json(
      { error: 'Falha ao buscar programação de cross-training recorrente.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return unauthorizedResponse();
  }

  try {
    const body = await req.json();
    const rawRules = Array.isArray(body.rules) ? body.rules : [];

    // Validate and normalize rules
    const validatedRules: RecurringCrossTrainingRule[] = [];
    for (const r of rawRules) {
      if (!r.activityType) continue;
      const days = Array.isArray(r.daysOfWeek)
        ? r.daysOfWeek.map((d: string) => normalizeDayOfWeek(d)).filter(Boolean)
        : [];

      if (days.length === 0) continue;

      validatedRules.push({
        id: r.id || `rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        activityType: r.activityType,
        title: r.title?.trim() || 'CrossFit WOD',
        daysOfWeek: days,
        durationMinutes: parseInt(String(r.durationMinutes || 60), 10),
        sessionRpe: r.sessionRpe ? parseFloat(String(r.sessionRpe)) : 7.5,
        muscleGroups: Array.isArray(r.muscleGroups) ? r.muscleGroups : ['Pernas', 'Core', 'Full Body'],
        colorCode: r.colorCode,
      });
    }

    // Save rules to AthleteProfile singleton
    await prisma.athleteProfile.upsert({
      where: { id: 'singleton' },
      update: {
        recurringCrossTraining: validatedRules as unknown as Prisma.InputJsonValue,
      },
      create: {
        id: 'singleton',
        recurringCrossTraining: validatedRules as unknown as Prisma.InputJsonValue,
      },
    });

    // Synchronize planned events into future calendar (strictly >= today)
    const syncResult = await syncPlannedCrossTraining('singleton');

    // Rebalance strength workouts across the next 4 weeks around recurring cross-training commitments
    const today = todayISO();
    const rebalancedWeeks = [];
    for (const offset of [0, 7, 14, 21]) {
      try {
        const res = await rebalanceWeekSchedule('singleton', shiftISODate(today, offset));
        rebalancedWeeks.push(res);
      } catch (err) {
        console.warn('[Recurring Cross-Training POST] Falha ao rebalancear semana:', err);
      }
    }

    return NextResponse.json({
      success: true,
      rules: validatedRules,
      syncResult,
      rebalancedWeeks,
    });
  } catch (error) {
    console.error('[Recurring Cross-Training POST] Erro ao salvar regras:', error);
    return NextResponse.json(
      { error: 'Falha ao salvar programação de cross-training recorrente.' },
      { status: 500 }
    );
  }
}
