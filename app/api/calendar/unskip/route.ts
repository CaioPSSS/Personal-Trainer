import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAuthorized, unauthorizedResponse } from '@/lib/auth';
import { weekRangeOfISODate, shiftISODate } from '@/lib/dates';
import { planUnskipRestoration } from '@/lib/scheduling/calendar-skip';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return unauthorizedResponse();
  }

  try {
    const body = await req.json();
    const { eventId, strategy = 'auto' } = body;

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

    if (event.status !== 'skipped') {
      return NextResponse.json(
        { error: 'Este evento não está marcado como pulado.' },
        { status: 400 }
      );
    }

    const { endOfWeek } = weekRangeOfISODate(event.date);

    const subsequentPlanned =
      event.eventType === 'strength'
        ? await prisma.calendarEvent.findMany({
            where: {
              athleteProfileId: event.athleteProfileId,
              eventType: 'strength',
              status: 'planned',
              id: { not: eventId },
              date: {
                gte: event.date,
                lte: shiftISODate(endOfWeek, 3),
              },
            },
            orderBy: { date: 'asc' },
          })
        : [];

    const restoration = planUnskipRestoration({
      event,
      subsequentPlannedStrengthEvents: subsequentPlanned,
      strategy,
    });

    const updatedEvent = await prisma.$transaction(async (tx) => {
      for (const item of restoration.eventsToRestore) {
        await tx.calendarEvent.update({
          where: { id: item.id },
          data: {
            date: item.toDate,
            originalDate: item.originalDateToSave,
          },
        });
      }

      const restored = await tx.calendarEvent.update({
        where: { id: eventId },
        data: {
          status: 'planned',
          skipStrategy: null,
          originalDate: restoration.restoredOriginalDate,
        },
      });

      if (event.referenceModel === 'RunningSession' && event.referenceId) {
        await tx.runningSession.updateMany({
          where: { id: event.referenceId },
          data: { status: 'planned' },
        });
      }

      if (event.referenceModel === 'CrossTrainingActivity' && event.referenceId) {
        await tx.crossTrainingActivity.updateMany({
          where: { id: event.referenceId },
          data: { status: 'planned' },
        });
      }

      return restored;
    });

    return NextResponse.json({
      success: true,
      strategyUsed: restoration.strategyUsed,
      revertedShiftCount: restoration.eventsToRestore.length,
      unskippedEvent: updatedEvent,
    });
  } catch (error) {
    console.error('Erro ao despular evento no calendário:', error);
    return NextResponse.json(
      { error: 'Falha ao processar cancelamento de pulo de treino.' },
      { status: 500 }
    );
  }
}
