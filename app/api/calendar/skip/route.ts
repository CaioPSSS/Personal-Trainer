import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function getWeekRange(dateStr: string): { startOfWeek: string; endOfWeek: string } {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = d.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + diffToMonday);

  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  return {
    startOfWeek: monday.toISOString().split('T')[0],
    endOfWeek: sunday.toISOString().split('T')[0],
  };
}

function addDaysToISODate(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split('T')[0];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { eventId, strategy = 'skip_only' } = body;

    if (!eventId) {
      return NextResponse.json(
        { error: 'eventId é obrigatório.' },
        { status: 400 }
      );
    }

    const event = await prisma.calendarEvent.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      return NextResponse.json(
        { error: 'Evento não encontrado.' },
        { status: 404 }
      );
    }

    // 1. Mark target event as skipped and save the strategy used
    const updatedEvent = await prisma.calendarEvent.update({
      where: { id: eventId },
      data: {
        status: 'skipped',
        originalDate: strategy === 'skip_and_reschedule' ? 'skip_and_reschedule' : 'skip_only',
      },
    });

    if (event.referenceModel === 'RunningSession' && event.referenceId) {
      await prisma.runningSession.updateMany({
        where: { id: event.referenceId },
        data: { status: 'skipped' },
      });
    }

    let shiftedCount = 0;

    // 2. If strategy is skip_and_reschedule and it's a strength event:
    if (strategy === 'skip_and_reschedule' && event.eventType === 'strength') {
      const { endOfWeek } = getWeekRange(event.date);

      // Find other planned strength events in the current week starting from event.date
      const subsequentPlanned = await prisma.calendarEvent.findMany({
        where: {
          athleteProfileId: event.athleteProfileId,
          eventType: 'strength',
          status: 'planned',
          id: { not: eventId },
          date: {
            gte: event.date,
            lte: endOfWeek,
          },
        },
        orderBy: { date: 'asc' },
      });

      for (const item of subsequentPlanned) {
        const nextDate = addDaysToISODate(item.date, 1);
        await prisma.calendarEvent.update({
          where: { id: item.id },
          data: {
            date: nextDate,
            originalDate: item.originalDate ?? item.date,
          },
        });
        shiftedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      strategy,
      shiftedCount,
      updatedEvent,
    });
  } catch (error) {
    console.error('Erro ao pular evento no calendário:', error);
    return NextResponse.json(
      { error: 'Falha ao processar pulo de treino.' },
      { status: 500 }
    );
  }
}
