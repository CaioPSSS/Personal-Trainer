import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAuthorized, unauthorizedResponse } from '@/lib/auth';
import { weekRangeOfISODate, shiftISODate } from '@/lib/dates';
import { parseAvailableDayIndices } from '@/lib/scheduling/strength-scheduler';
import {
  extractPreservedISODate,
  OccupiedScheduleEntry,
  planCollisionAwareReschedule,
} from '@/lib/scheduling/calendar-skip';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return unauthorizedResponse();
  }

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

    const skipStrategy =
      strategy === 'skip_and_reschedule' ? ('skip_and_reschedule' as const) : ('skip_only' as const);

    const { endOfWeek } = weekRangeOfISODate(event.date);
    const searchEnd = shiftISODate(endOfWeek, 2);

    const [athlete, windowEvents] = await Promise.all([
      prisma.athleteProfile.findUnique({
        where: { id: event.athleteProfileId },
        select: { availableDays: true },
      }),
      prisma.calendarEvent.findMany({
        where: {
          athleteProfileId: event.athleteProfileId,
          date: {
            gte: event.date,
            lte: searchEnd,
          },
        },
        orderBy: { date: 'asc' },
      }),
    ]);

    const subsequentPlanned = windowEvents.filter(
      (ev) =>
        ev.id !== eventId &&
        ev.eventType === 'strength' &&
        ev.status === 'planned' &&
        ev.date >= event.date &&
        ev.date <= endOfWeek
    );

    const runSessionIds = windowEvents
      .filter((ev) => ev.eventType === 'running' && ev.referenceModel === 'RunningSession' && ev.referenceId)
      .map((ev) => ev.referenceId!);
    const ctIds = windowEvents
      .filter(
        (ev) =>
          ['crossfit', 'cross_training', 'cycling', 'martial_arts'].includes(ev.eventType) &&
          ev.referenceId
      )
      .map((ev) => ev.referenceId!);

    const [runSessions, ctActivities] = await Promise.all([
      runSessionIds.length > 0
        ? prisma.runningSession.findMany({
            where: { id: { in: runSessionIds } },
            select: { id: true, sessionType: true },
          })
        : Promise.resolve([]),
      ctIds.length > 0
        ? prisma.crossTrainingActivity.findMany({
            where: { id: { in: ctIds } },
            select: { id: true, muscleGroups: true, sessionRpe: true },
          })
        : Promise.resolve([]),
    ]);

    const runTypeMap = new Map(runSessions.map((r) => [r.id, r.sessionType]));
    const ctMap = new Map(ctActivities.map((c) => [c.id, c]));

    const occupiedEvents: OccupiedScheduleEntry[] = windowEvents.map((ev) => {
      const ct = ev.referenceId ? ctMap.get(ev.referenceId) : undefined;
      return {
        id: ev.id,
        date: ev.date,
        eventType: ev.eventType,
        title: ev.title,
        status: ev.status,
        runningSessionType: ev.referenceId ? runTypeMap.get(ev.referenceId) : undefined,
        crossMuscleGroups: ct?.muscleGroups,
        crossSessionRpe: ct?.sessionRpe,
      };
    });

    const reschedulePlan =
      skipStrategy === 'skip_and_reschedule' && event.eventType === 'strength'
        ? planCollisionAwareReschedule({
            skippedEvent: event,
            subsequentStrengthEvents: subsequentPlanned,
            occupiedEvents,
            availableDayIndices: athlete?.availableDays
              ? parseAvailableDayIndices(athlete.availableDays)
              : null,
            endOfWeek,
          })
        : [];

    const preservedOriginalDate = extractPreservedISODate(event.originalDate);

    const updatedEvent = await prisma.$transaction(async (tx) => {
      const updated = await tx.calendarEvent.update({
        where: { id: eventId },
        data: {
          status: 'skipped',
          skipStrategy,
          originalDate: preservedOriginalDate,
        },
      });

      if (event.referenceModel === 'RunningSession' && event.referenceId) {
        await tx.runningSession.updateMany({
          where: { id: event.referenceId },
          data: { status: 'skipped' },
        });
      }

      if (event.referenceModel === 'CrossTrainingActivity' && event.referenceId) {
        await tx.crossTrainingActivity.updateMany({
          where: { id: event.referenceId },
          data: { status: 'skipped' },
        });
      }

      for (const item of reschedulePlan) {
        await tx.calendarEvent.update({
          where: { id: item.id },
          data: {
            date: item.toDate,
            originalDate: item.originalDateToSave,
          },
        });
      }

      return updated;
    });

    return NextResponse.json({
      success: true,
      strategy: skipStrategy,
      shiftedCount: reschedulePlan.length,
      rescheduledEvents: reschedulePlan,
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
