import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAuthorized, unauthorizedResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/running/session/link
 * Returns unlinked running executions and candidate planned running sessions
 * for quick matching in calendar and running views.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return unauthorizedResponse();
  }

  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date');

    // 1. Fetch active running plan
    const activePlan = await prisma.runningPlan.findFirst({
      where: {
        runningProfileId: 'singleton',
        status: 'active',
      },
      include: {
        runningProfile: {
          select: {
            hrZones: true,
          },
        },
        sessions: {
          orderBy: [{ weekNumber: 'asc' }, { scheduledDate: 'asc' }],
          include: {
            executions: {
              orderBy: { date: 'desc' },
            },
          },
        },
      },
    });

    // 2. Fetch unlinked running executions (Strava or manual)
    const unlinkedExecutions = await prisma.runningExecution.findMany({
      where: {
        runningProfileId: 'singleton',
        runningSessionId: null,
      },
      orderBy: { date: 'desc' },
      take: 20,
    });

    // 3. Format candidate sessions
    const sessions = (activePlan?.sessions || []).map((s) => ({
      id: s.id,
      runningPlanId: s.runningPlanId,
      weekNumber: s.weekNumber,
      dayOfWeek: s.dayOfWeek,
      scheduledDate: s.scheduledDate,
      sessionType: s.sessionType,
      title: s.title,
      totalDistanceKm: s.totalDistanceKm,
      totalDurationMin: s.totalDurationMin,
      targetPaceSec: s.targetPaceSec,
      targetHrZone: s.targetHrZone,
      status: s.status,
      linkedExecutions: s.executions,
    }));

    return NextResponse.json({
      success: true,
      activePlanId: activePlan?.id || null,
      hrZones: (activePlan?.runningProfile?.hrZones as Record<string, unknown>) || null,
      unlinkedExecutions,
      sessions,
      queriedDate: date || null,
    });
  } catch (error) {
    console.error('[RunningLink API] Erro ao listar sessões e execuções:', error);
    return NextResponse.json(
      { error: 'Falha ao buscar dados de vínculo de corrida.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/running/session/link
 * Links or unlinks a RunningExecution with a RunningSession,
 * harmonizing CalendarEvent records to avoid duplicate cards.
 */
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return unauthorizedResponse();
  }

  try {
    const body = await req.json();
    const { action = 'link', executionId, sessionId } = body;

    if (!executionId) {
      return NextResponse.json(
        { error: 'executionId é obrigatório.' },
        { status: 400 }
      );
    }

    if (action === 'unlink') {
      const execution = await prisma.runningExecution.findUnique({
        where: { id: executionId },
      });

      if (!execution) {
        return NextResponse.json(
          { error: 'Execução de corrida não encontrada.' },
          { status: 404 }
        );
      }

      const previousSessionId = execution.runningSessionId;

      await prisma.$transaction(async (tx) => {
        await tx.runningExecution.update({
          where: { id: executionId },
          data: { runningSessionId: null },
        });

        if (previousSessionId) {
          const remaining = await tx.runningExecution.count({
            where: {
              runningSessionId: previousSessionId,
              id: { not: executionId },
            },
          });

          if (remaining === 0) {
            const session = await tx.runningSession.update({
              where: { id: previousSessionId },
              data: { status: 'planned' },
            });

            const existingSessionEvent = await tx.calendarEvent.findFirst({
              where: {
                athleteProfileId: 'singleton',
                eventType: 'running',
                referenceId: session.id,
                referenceModel: 'RunningSession',
              },
            });

            if (existingSessionEvent) {
              await tx.calendarEvent.update({
                where: { id: existingSessionEvent.id },
                data: {
                  status: 'planned',
                  title: session.title,
                  date: session.scheduledDate,
                  colorCode: null,
                },
              });
            } else {
              await tx.calendarEvent.create({
                data: {
                  athleteProfileId: 'singleton',
                  date: session.scheduledDate,
                  eventType: 'running',
                  referenceId: session.id,
                  referenceModel: 'RunningSession',
                  title: session.title,
                  status: 'planned',
                },
              });
            }
          }
        }

        const existingExecutionEvent = await tx.calendarEvent.findFirst({
          where: {
            athleteProfileId: 'singleton',
            eventType: 'running',
            referenceId: executionId,
            referenceModel: 'RunningExecution',
          },
        });

        const execTitle = execution.notes || (execution.source === 'strava' ? 'Corrida (Strava)' : 'Corrida Manual');
        if (!existingExecutionEvent) {
          await tx.calendarEvent.create({
            data: {
              athleteProfileId: 'singleton',
              date: execution.date,
              eventType: 'running',
              referenceId: execution.id,
              referenceModel: 'RunningExecution',
              title: `${execTitle} (${execution.distanceKm.toFixed(1)} km)`,
              status: 'completed',
              colorCode: '#10b981',
            },
          });
        }
      });

      return NextResponse.json({
        success: true,
        action: 'unlink',
        message: 'Corrida desvinculada do plano com sucesso.',
      });
    }

    // ACTION: LINK
    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId é obrigatório para vincular.' },
        { status: 400 }
      );
    }

    const execution = await prisma.runningExecution.findUnique({
      where: { id: executionId },
    });
    if (!execution) {
      return NextResponse.json(
        { error: 'Execução de corrida não encontrada.' },
        { status: 404 }
      );
    }

    const session = await prisma.runningSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      return NextResponse.json(
        { error: 'Sessão de treino planejada não encontrada.' },
        { status: 404 }
      );
    }

    const { updatedExecution, updatedSession } = await prisma.$transaction(async (tx) => {
      const updExec = await tx.runningExecution.update({
        where: { id: executionId },
        data: { runningSessionId: sessionId },
      });

      const updSess = await tx.runningSession.update({
        where: { id: sessionId },
        data: { status: 'completed' },
      });

      const sessionEvent = await tx.calendarEvent.findFirst({
        where: {
          athleteProfileId: 'singleton',
          eventType: 'running',
          referenceId: sessionId,
        },
      });

      const executionEvent = await tx.calendarEvent.findFirst({
        where: {
          athleteProfileId: 'singleton',
          eventType: 'running',
          referenceId: executionId,
        },
      });

      const displayTitle = execution.notes
        ? `${execution.notes} (${execution.distanceKm.toFixed(1)} km)`
        : `${session.title} (${execution.distanceKm.toFixed(1)} km)`;

      if (sessionEvent && executionEvent) {
        await tx.calendarEvent.update({
          where: { id: executionEvent.id },
          data: {
            title: displayTitle,
            status: 'completed',
            colorCode: '#10b981',
            date: execution.date,
            caloriesBurned: execution.caloriesBurned,
          },
        });
        await tx.calendarEvent.delete({
          where: { id: sessionEvent.id },
        });
      } else if (sessionEvent) {
        await tx.calendarEvent.update({
          where: { id: sessionEvent.id },
          data: {
            referenceId: execution.id,
            referenceModel: 'RunningExecution',
            title: displayTitle,
            status: 'completed',
            colorCode: '#10b981',
            date: execution.date,
            caloriesBurned: execution.caloriesBurned,
          },
        });
      } else if (executionEvent) {
        await tx.calendarEvent.update({
          where: { id: executionEvent.id },
          data: {
            title: displayTitle,
            status: 'completed',
            colorCode: '#10b981',
            caloriesBurned: execution.caloriesBurned,
          },
        });
      } else {
        await tx.calendarEvent.create({
          data: {
            athleteProfileId: 'singleton',
            date: execution.date,
            eventType: 'running',
            referenceId: execution.id,
            referenceModel: 'RunningExecution',
            title: displayTitle,
            status: 'completed',
            colorCode: '#10b981',
            caloriesBurned: execution.caloriesBurned,
          },
        });
      }

      return { updatedExecution: updExec, updatedSession: updSess };
    });

    return NextResponse.json({
      success: true,
      action: 'link',
      execution: updatedExecution,
      session: updatedSession,
      message: `Corrida vinculada com sucesso a "${session.title}"!`,
    });
  } catch (error) {
    console.error('[RunningLink API] Erro ao vincular sessão e execução:', error);
    return NextResponse.json(
      { error: 'Falha ao vincular treino de corrida.' },
      { status: 500 }
    );
  }
}
