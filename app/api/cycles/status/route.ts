import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAuthorized, unauthorizedResponse } from '@/lib/auth';
import { todayISO } from '@/lib/dates';
import { parseAvailableDayIndices } from '@/lib/scheduling/strength-scheduler';
import {
  evaluateRunningCycleStatus,
  evaluateStrengthCycleStatus,
} from '@/lib/scheduling/cycle-status';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return unauthorizedResponse();
  }

  try {
    const today = todayISO();

    const [
      athleteProfile,
      activeMesocycle,
      runningProfile,
      activeRunningPlan,
    ] = await Promise.all([
      prisma.athleteProfile.findUnique({
        where: { id: 'singleton' },
        select: {
          availableDays: true,
          weeklyWorkoutsTarget: true,
        },
      }),
      prisma.mesocyclePlan.findFirst({
        where: {
          athleteProfileId: 'singleton',
          status: 'active',
        },
        orderBy: { createdAt: 'desc' },
        include: {
          workoutDays: {
            select: { id: true },
          },
        },
      }),
      prisma.runningProfile.findUnique({
        where: { id: 'singleton' },
        select: {
          availableDays: true,
          weeklyRunsTarget: true,
        },
      }),
      prisma.runningPlan.findFirst({
        where: {
          runningProfileId: 'singleton',
          status: 'active',
        },
        orderBy: { createdAt: 'desc' },
        include: {
          sessions: {
            select: {
              scheduledDate: true,
              status: true,
            },
            orderBy: { scheduledDate: 'asc' },
          },
        },
      }),
    ]);

    const strengthAvailableDays = parseAvailableDayIndices(athleteProfile?.availableDays);
    const strengthWeeklyTarget =
      athleteProfile?.weeklyWorkoutsTarget ??
      (activeMesocycle?.workoutDays.length || 3);

    const runningAvailableDays = parseAvailableDayIndices(
      runningProfile?.availableDays ?? ['tuesday', 'thursday', 'saturday']
    );
    const runningWeeklyTarget = runningProfile?.weeklyRunsTarget ?? 3;

    let completedWorkoutsCount = 0;
    let remainingStrengthPlannedCount = 0;
    let lastStrengthScheduledDate: string | null = null;

    if (activeMesocycle) {
      const [completedCount, remainingPlanned, latestStrengthEvent] = await Promise.all([
        prisma.workoutExecution.count({
          where: {
            athleteProfileId: 'singleton',
            mesocyclePlanId: activeMesocycle.id,
            status: 'completed',
          },
        }),
        prisma.calendarEvent.count({
          where: {
            athleteProfileId: 'singleton',
            eventType: 'strength',
            status: 'planned',
            date: { gte: today },
          },
        }),
        prisma.calendarEvent.findFirst({
          where: {
            athleteProfileId: 'singleton',
            eventType: 'strength',
            date: activeMesocycle.startDate ? { gte: activeMesocycle.startDate } : undefined,
          },
          orderBy: { date: 'desc' },
          select: { date: true },
        }),
      ]);

      completedWorkoutsCount = completedCount;
      remainingStrengthPlannedCount = remainingPlanned;
      lastStrengthScheduledDate = latestStrengthEvent?.date ?? null;
    }

    const strength = evaluateStrengthCycleStatus({
      today,
      activePlan: activeMesocycle,
      availableDayIndices: strengthAvailableDays,
      weeklyWorkoutsTarget: strengthWeeklyTarget,
      completedWorkoutsCount,
      remainingPlannedCount: remainingStrengthPlannedCount,
      lastScheduledEventDate: lastStrengthScheduledDate,
    });

    const running = evaluateRunningCycleStatus({
      today,
      activePlan: activeRunningPlan,
      availableDayIndices: runningAvailableDays,
      weeklyRunsTarget: runningWeeklyTarget,
    });

    return NextResponse.json({
      today,
      strength,
      running,
      anyNeedsRenewal: strength.needsRenewal || running.needsRenewal,
    });
  } catch (error) {
    console.error('[GET /api/cycles/status] Erro ao avaliar status dos ciclos:', error);
    return NextResponse.json(
      { error: 'Falha ao verificar status dos ciclos de treino.' },
      { status: 500 }
    );
  }
}
