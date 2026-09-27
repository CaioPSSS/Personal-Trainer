import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { rebalanceWeekSchedule } from '@/lib/scheduling/strength-scheduler';

export const dynamic = 'force-dynamic';

export const ACTIVITY_LABELS: Record<string, string> = {
  crossfit: 'CrossFit 🔥',
  swimming: 'Natação 🏊',
  cycling: 'Ciclismo 🚴',
  yoga: 'Yoga 🧘',
  martial_arts: 'Artes Marciais 🥊',
  other: 'Cross-Training 🟣',
};

interface CrossTrainingPayload {
  activityType: 'crossfit' | 'swimming' | 'cycling' | 'yoga' | 'martial_arts' | 'other' | string;
  date?: string; // YYYY-MM-DD
  title?: string;
  durationMinutes: number;
  sessionRpe?: number;
  muscleGroups?: string[];
  notes?: string;
}

export async function GET() {
  try {
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const dateLimit = sixtyDaysAgo.toISOString().split('T')[0];

    const activities = await prisma.crossTrainingActivity.findMany({
      where: {
        athleteProfileId: 'singleton',
        date: { gte: dateLimit },
      },
      orderBy: { date: 'desc' },
    });

    return NextResponse.json({ activities });
  } catch (error) {
    console.error('[Cross-Training] Erro ao buscar atividades:', error);
    return NextResponse.json(
      { error: 'Falha ao buscar atividades de cross-training.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body: CrossTrainingPayload = await req.json();
    const {
      activityType,
      date = new Date().toISOString().split('T')[0],
      title,
      durationMinutes,
      sessionRpe,
      muscleGroups = [],
      notes,
    } = body;

    if (!activityType) {
      return NextResponse.json(
        { error: 'Tipo de atividade (activityType) é obrigatório.' },
        { status: 400 }
      );
    }

    if (!durationMinutes || durationMinutes <= 0) {
      return NextResponse.json(
        { error: 'Duração em minutos inválida.' },
        { status: 400 }
      );
    }

    // Ensure athlete profile singleton exists
    let athlete = await prisma.athleteProfile.findUnique({
      where: { id: 'singleton' },
    });
    if (!athlete) {
      athlete = await prisma.athleteProfile.create({
        data: { id: 'singleton' },
      });
    }

    const activityLabel = ACTIVITY_LABELS[activityType] || 'Cross-Training';
    const finalTitle = title?.trim() || activityLabel;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create CrossTrainingActivity
      const activity = await tx.crossTrainingActivity.create({
        data: {
          athleteProfileId: athlete.id,
          date,
          activityType,
          title: finalTitle,
          durationMinutes: parseInt(String(durationMinutes), 10),
          sessionRpe: sessionRpe ? parseFloat(String(sessionRpe)) : null,
          muscleGroups: muscleGroups as unknown as Prisma.InputJsonValue,
          notes: notes?.trim() || null,
          status: 'completed',
        },
      });

      // 2. Automatically create matching CalendarEvent
      const calendarEvent = await tx.calendarEvent.create({
        data: {
          athleteProfileId: athlete.id,
          date,
          eventType: activityType,
          status: 'completed',
          referenceModel: 'CrossTrainingActivity',
          referenceId: activity.id,
          title: finalTitle,
          sortOrder: 1,
        },
      });

      return { activity, calendarEvent };
    });

    // Reactive rescheduling: dynamically rebalance the week's strength workouts
    // to steer leg workouts away from CrossFit fatigue
    let rebalanceResult: { rebalancedCount: number; events: Array<{ id: string; title: string; oldDate: string; newDate: string }> } | null = null;
    try {
      const res = await rebalanceWeekSchedule(athlete.id, date);
      rebalanceResult = {
        rebalancedCount: res.rebalancedCount,
        events: res.events,
      };
    } catch (rebalanceError) {
      console.warn('[Cross-Training] Aviso: falha ao rebalancear calendário:', rebalanceError);
    }

    return NextResponse.json(
      {
        success: true,
        activity: result.activity,
        calendarEvent: result.calendarEvent,
        rebalance: rebalanceResult,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[Cross-Training] Erro ao registrar atividade:', error);
    return NextResponse.json(
      { error: 'Falha ao registrar atividade de cross-training.' },
      { status: 500 }
    );
  }
}
