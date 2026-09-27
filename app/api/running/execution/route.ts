import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '30', 10)));

    const executions = await prisma.runningExecution.findMany({
      where: { runningProfileId: 'singleton' },
      orderBy: { date: 'desc' },
      take: limit,
      include: {
        runningSession: {
          select: {
            id: true,
            title: true,
            sessionType: true,
            totalDistanceKm: true,
            targetPaceSec: true,
          },
        },
      },
    });

    return NextResponse.json({ executions });
  } catch (error) {
    console.error('[Running Execution] Erro ao buscar execuções:', error);
    return NextResponse.json(
      { error: 'Falha ao buscar execuções de corrida.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const distanceKm = Number(body.distanceKm);
    let durationSeconds = Number(body.durationSeconds);
    if (!durationSeconds && body.durationMinutes) {
      durationSeconds = Math.round(Number(body.durationMinutes) * 60);
    }

    if (isNaN(distanceKm) || distanceKm <= 0 || isNaN(durationSeconds) || durationSeconds <= 0) {
      return NextResponse.json(
        { error: 'Distância (km) e duração (segundos/minutos) válidas são obrigatórias.' },
        { status: 400 }
      );
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const date = body.date ? String(body.date).trim() : todayStr;
    const sessionRpe = body.sessionRpe != null ? Number(body.sessionRpe) : null;
    const avgHeartRate = body.avgHeartRate != null ? Number(body.avgHeartRate) : null;
    const maxHeartRate = body.maxHeartRate != null ? Number(body.maxHeartRate) : null;
    const notes = body.notes ? String(body.notes).trim() : null;
    const runningSessionId = body.runningSessionId ? String(body.runningSessionId).trim() : undefined;

    const avgPaceSec =
      body.avgPaceSec != null
        ? Number(body.avgPaceSec)
        : Math.round(durationSeconds / distanceKm);

    // Ensure athlete and running profiles exist
    await prisma.athleteProfile.upsert({
      where: { id: 'singleton' },
      update: {},
      create: { id: 'singleton', sessionDurationMin: 60 },
    });
    await prisma.runningProfile.upsert({
      where: { id: 'singleton' },
      update: {},
      create: { id: 'singleton' },
    });

    const executionResult = await prisma.$transaction(async (tx) => {
      // 1. Identify matching planned session
      let matchedSession = null;
      if (runningSessionId) {
        matchedSession = await tx.runningSession.findUnique({
          where: { id: runningSessionId },
        });
      } else {
        matchedSession = await tx.runningSession.findFirst({
          where: {
            scheduledDate: date,
            status: 'planned',
          },
          orderBy: { createdAt: 'desc' },
        });
      }

      // 2. Create RunningExecution record
      const execution = await tx.runningExecution.create({
        data: {
          runningProfileId: 'singleton',
          runningSessionId: matchedSession?.id ?? null,
          date,
          source: 'manual',
          distanceKm,
          durationSeconds,
          avgPaceSec,
          avgHeartRate,
          maxHeartRate,
          sessionRpe,
          notes,
        },
      });

      // 3. If matched with planned session, mark session completed and update CalendarEvent
      if (matchedSession) {
        await tx.runningSession.update({
          where: { id: matchedSession.id },
          data: { status: 'completed' },
        });

        const existingEvent = await tx.calendarEvent.findFirst({
          where: {
            referenceId: matchedSession.id,
            referenceModel: 'RunningSession',
          },
        });

        if (existingEvent) {
          await tx.calendarEvent.update({
            where: { id: existingEvent.id },
            data: {
              status: 'completed',
              referenceId: execution.id,
              referenceModel: 'RunningExecution',
              title: `${matchedSession.title} (${distanceKm.toFixed(1)} km)`,
            },
          });
        } else {
          await tx.calendarEvent.create({
            data: {
              athleteProfileId: 'singleton',
              date,
              eventType: 'running',
              referenceId: execution.id,
              referenceModel: 'RunningExecution',
              title: `${matchedSession.title} (${distanceKm.toFixed(1)} km)`,
              status: 'completed',
              colorCode: '#10b981',
              sortOrder: 1,
            },
          });
        }
      } else {
        // Create new completed CalendarEvent for unplanned execution
        await tx.calendarEvent.create({
          data: {
            athleteProfileId: 'singleton',
            date,
            eventType: 'running',
            referenceId: execution.id,
            referenceModel: 'RunningExecution',
            title: `Corrida Manual (${distanceKm.toFixed(1)} km)`,
            status: 'completed',
            colorCode: '#10b981',
            sortOrder: 1,
          },
        });
      }

      return execution;
    });

    return NextResponse.json({
      success: true,
      execution: executionResult,
    });
  } catch (error) {
    console.error('[Running Execution] Erro ao registrar execução manual:', error);
    return NextResponse.json(
      { error: 'Falha ao registrar execução manual de corrida.' },
      { status: 500 }
    );
  }
}
