import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { syncPlannedCalendarEvents } from '@/lib/scheduling/strength-scheduler';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // Automatically ensure planned mesocycle workouts are populated
    await syncPlannedCalendarEvents('singleton');

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

    const events = await prisma.calendarEvent.findMany({
      where,
      orderBy: [
        { date: 'asc' },
        { sortOrder: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    // In-memory safety deduplication for planned events on the same date with the same title and type
    const seen = new Set<string>();
    const deduplicatedEvents = events.filter((ev) => {
      if (ev.status !== 'planned') return true;
      const key = `${ev.date}::${ev.eventType}::${ev.title.trim().toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return NextResponse.json({ events: deduplicatedEvents });
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
    const { eventId, newDate, date } = body;

    const targetDate = newDate || date;

    if (!eventId || !targetDate) {
      return NextResponse.json(
        { error: 'Parâmetros eventId e targetDate/newDate são obrigatórios.' },
        { status: 400 }
      );
    }

    const existing = await prisma.calendarEvent.findUnique({
      where: { id: eventId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Evento não encontrado.' },
        { status: 404 }
      );
    }

    const updated = await prisma.calendarEvent.update({
      where: { id: eventId },
      data: {
        date: targetDate,
        originalDate: existing.originalDate ?? existing.date,
      },
    });

    return NextResponse.json({ event: updated });
  } catch (error) {
    console.error('Erro ao atualizar evento do calendário:', error);
    return NextResponse.json(
      { error: 'Falha ao atualizar evento no calendário.' },
      { status: 500 }
    );
  }
}
