import { NextRequest, NextResponse, after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { syncPlannedCalendarEvents, rebalanceWeekSchedule } from '@/lib/scheduling/strength-scheduler';
import { syncPlannedCrossTraining } from '@/lib/scheduling/cross-training-scheduler';
import { dayOfWeekName, todayISO } from '@/lib/dates';
import { syncDayToMetabolicTracker } from '@/lib/integrations/metabolic-tracker';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // Automatically ensure planned mesocycle strength and recurring cross-training are populated
    await Promise.allSettled([
      syncPlannedCalendarEvents('singleton'),
      syncPlannedCrossTraining('singleton'),
    ]);

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const where: Prisma.CalendarEventWhereInput = {
      athleteProfileId: 'singleton',
    };

    if (startDate && endDate) {
      where.date = {
        gte: startDate,
        lte: endDate,
      };
    } else if (startDate) {
      where.date = { gte: startDate };
    } else if (endDate) {
      where.date = { lte: endDate };
    }

    const wellnessWhere: Prisma.WellnessDailyWhereInput = {
      athleteProfileId: 'singleton',
    };

    if (startDate && endDate) {
      wellnessWhere.date = { gte: startDate, lte: endDate };
    } else if (startDate) {
      wellnessWhere.date = { gte: startDate };
    } else if (endDate) {
      wellnessWhere.date = { lte: endDate };
    }

    const [events, wellness] = await Promise.all([
      prisma.calendarEvent.findMany({
        where,
        orderBy: [
          { date: 'asc' },
          { sortOrder: 'asc' },
          { createdAt: 'asc' },
        ],
      }),
      prisma.wellnessDaily.findMany({
        where: wellnessWhere,
      }),
    ]);

    // In-memory safety deduplication for planned events on the same date with the same title and type
    const seen = new Set<string>();
    const deduplicatedEvents = events.filter((ev) => {
      if (ev.status !== 'planned') return true;
      const key = `${ev.date}::${ev.eventType}::${ev.title.trim().toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return NextResponse.json({ events: deduplicatedEvents, wellness });
  } catch (error) {
    console.error('Erro ao buscar eventos do calendário:', error);
    return NextResponse.json(
      { error: 'Falha ao buscar eventos do calendário.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      date,
      eventType,
      title,
      status = 'planned',
      colorCode,
      referenceId,
      referenceModel,
      sortOrder = 0,
    } = body;

    if (!date || !eventType || !title) {
      return NextResponse.json(
        { error: 'Campos date, eventType e title são obrigatórios.' },
        { status: 400 }
      );
    }

    // Regra de Ouro: Proíbe criar treinos planejados em datas passadas
    if (status === 'planned' && date < todayISO()) {
      return NextResponse.json(
        { error: 'Não é permitido criar treinos planejados em datas passadas. O histórico é imutável.' },
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

    const newEvent = await prisma.calendarEvent.create({
      data: {
        athleteProfileId: athlete.id,
        date,
        eventType,
        title,
        status,
        colorCode,
        referenceId,
        referenceModel,
        sortOrder,
      },
    });

    return NextResponse.json({ event: newEvent }, { status: 201 });
  } catch (error) {
    console.error('Erro ao criar evento do calendário:', error);
    return NextResponse.json(
      { error: 'Falha ao criar evento no calendário.' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { eventId, sessionId, newDate, date } = body;

    const targetDate = newDate || date;

    if ((!eventId && !sessionId) || !targetDate) {
      return NextResponse.json(
        { error: 'Parâmetros (eventId ou sessionId) e targetDate/newDate são obrigatórios.' },
        { status: 400 }
      );
    }

    // Regra de Ouro: Imutabilidade do Passado (date >= todayISO)
    if (targetDate < todayISO()) {
      return NextResponse.json(
        { error: 'Não é permitido reagendar treinos para datas passadas. O histórico anterior a hoje é imutável.' },
        { status: 400 }
      );
    }

    let existing = eventId
      ? await prisma.calendarEvent.findUnique({
          where: { id: eventId },
        })
      : null;

    if (!existing && sessionId) {
      existing = await prisma.calendarEvent.findFirst({
        where: {
          referenceId: sessionId,
          referenceModel: 'RunningSession',
        },
      });

      if (!existing) {
        const runSession = await prisma.runningSession.findUnique({
          where: { id: sessionId },
        });
        if (runSession) {
          existing = await prisma.calendarEvent.create({
            data: {
              athleteProfileId: 'singleton',
              date: targetDate,
              eventType: 'running',
              referenceId: runSession.id,
              referenceModel: 'RunningSession',
              title: runSession.title,
              status: runSession.status,
              colorCode: '#10b981',
              sortOrder: 1,
            },
          });
        }
      }
    }

    if (!existing) {
      return NextResponse.json(
        { error: 'Evento não encontrado.' },
        { status: 404 }
      );
    }

    const previousDate = existing.date;

    const isMovingBackToOriginal = existing.originalDate && targetDate === existing.originalDate;
    const newOriginalDate = isMovingBackToOriginal
      ? null
      : (existing.originalDate ?? existing.date);

    const updated = await prisma.calendarEvent.update({
      where: { id: existing.id },
      data: {
        date: targetDate,
        originalDate: newOriginalDate,
      },
    });

    // 1. If it's a planned or linked running session, synchronize the RunningSession model
    if (existing.referenceModel === 'RunningSession' && existing.referenceId) {
      await prisma.runningSession.updateMany({
        where: { id: existing.referenceId },
        data: {
          scheduledDate: targetDate,
          dayOfWeek: dayOfWeekName(targetDate),
        },
      });
    }

    // 2. If it's a running execution, update the execution's date as well
    if (existing.referenceModel === 'RunningExecution' && existing.referenceId) {
      await prisma.runningExecution.updateMany({
        where: { id: existing.referenceId },
        data: {
          date: targetDate,
        },
      });
    }

    // 3. If it's a cross-training activity (planned or completed), synchronize its date as well
    if (existing.referenceModel === 'CrossTrainingActivity' && existing.referenceId) {
      await prisma.crossTrainingActivity.updateMany({
        where: { id: existing.referenceId },
        data: {
          date: targetDate,
        },
      });
    }

    // 4. If it's a strength workout execution, synchronize its date as well
    if (existing.referenceModel === 'WorkoutExecution' && existing.referenceId) {
      await prisma.workoutExecution.updateMany({
        where: { id: existing.referenceId },
        data: {
          date: targetDate,
        },
      });
    }

    // 5. If a completed activity was moved, update daily totals in Meu Rastreador Metabólico
    if (existing.status === 'completed' && previousDate !== targetDate) {
      after(async () => {
        try {
          await syncDayToMetabolicTracker(previousDate, { clearIfEmpty: true });
          await syncDayToMetabolicTracker(targetDate);
        } catch (err) {
          console.warn('[Calendar PATCH] Falha no sync com Rastreador:', err);
        }
      });
    }

    // 6. If a planned strength or cross-training activity was moved, dynamically rebalance the week
    if (existing.status === 'planned' && (existing.eventType === 'strength' || existing.eventType === 'crossfit')) {
      after(async () => {
        try {
          await rebalanceWeekSchedule(existing.athleteProfileId, targetDate);
        } catch (rebErr) {
          console.warn('[Calendar PATCH] Falha no rebalanceamento pós-movimentação:', rebErr);
        }
      });
    }

    return NextResponse.json({ event: updated });
  } catch (error) {
    console.error('Erro ao atualizar evento do calendário:', error);
    return NextResponse.json(
      { error: 'Falha ao atualizar evento no calendário.' },
      { status: 500 }
    );
  }
}
