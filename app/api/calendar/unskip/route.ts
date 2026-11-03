import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { weekRangeOfISODate, shiftISODate, isISODate } from '@/lib/dates';
import { extractOriginalISODate } from '@/lib/scheduling/cross-training-scheduler';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
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

    // Determine if we should revert schedule shifts
    const wasRescheduled =
      event.originalDate === 'skip_and_reschedule' ||
      Boolean(event.originalDate?.startsWith('skip_and_reschedule::'));
    const shouldRevertSchedule =
      strategy === 'restore_schedule' ||
      (strategy === 'auto' && wasRescheduled);

    let revertedShiftCount = 0;

    // 1. If reverting schedule and event is strength
    if (shouldRevertSchedule && event.eventType === 'strength') {
      const { endOfWeek } = weekRangeOfISODate(event.date);

      // Find subsequent strength events that might have been shifted forward
      const subsequentPlanned = await prisma.calendarEvent.findMany({
        where: {
          athleteProfileId: event.athleteProfileId,
          eventType: 'strength',
          status: 'planned',
          id: { not: eventId },
          date: {
            gte: event.date,
            lte: shiftISODate(endOfWeek, 3), // handle events shifted across Sunday boundary
          },
        },
        orderBy: { date: 'asc' },
      });

      for (const item of subsequentPlanned) {
        // If it has a recorded originalDate in YYYY-MM-DD format, revert directly to it
        if (item.originalDate && isISODate(item.originalDate)) {
          await prisma.calendarEvent.update({
            where: { id: item.id },
            data: {
              date: item.originalDate,
              originalDate: null,
            },
          });
          revertedShiftCount++;
        } else if (wasRescheduled) {
          // If wasRescheduled flag is present, shift back by -1 day
          const prevDate = shiftISODate(item.date, -1);
          await prisma.calendarEvent.update({
            where: { id: item.id },
            data: {
              date: prevDate,
              originalDate: null,
            },
          });
          revertedShiftCount++;
        }
      }
    }

    // 2. Revert target event status back to 'planned', restoring any preserved ISO originalDate
    const restoredOriginalDate = extractOriginalISODate(event.originalDate);
    const updatedEvent = await prisma.calendarEvent.update({
      where: { id: eventId },
      data: {
        status: 'planned',
        originalDate: restoredOriginalDate,
      },
    });

    // 3. If it's a running session, also update RunningSession model
    if (event.referenceModel === 'RunningSession' && event.referenceId) {
      await prisma.runningSession.updateMany({
        where: { id: event.referenceId },
        data: { status: 'planned' },
      });
    }

    // 4. If it's a cross-training activity, also update CrossTrainingActivity model
    if (event.referenceModel === 'CrossTrainingActivity' && event.referenceId) {
      await prisma.crossTrainingActivity.updateMany({
        where: { id: event.referenceId },
        data: { status: 'planned' },
      });
    }

    return NextResponse.json({
      success: true,
      strategyUsed: shouldRevertSchedule ? 'restore_schedule' : 'unskip_only',
      revertedShiftCount,
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
