import { prisma } from '@/lib/prisma';
import { shiftISODate, todayISO } from '@/lib/dates';
import { computeDailyReadinessScore, DailyReadinessResult } from '@/lib/analytics/readiness-score';

export interface HybridCoachingContext {
  runningProfile: {
    id: string;
    primaryObjective: string | null;
    weeklyVolumeKm: number | null;
    currentPace5kSec: number | null;
    currentPace10kSec: number | null;
    injuryHistory: unknown;
    availableDays: unknown;
    weeklyRunsTarget: number | null;
    primaryTerrain: string | null;
  } | null;
  runningSummary: Record<string, unknown> | null;
  crossTrainingSummary: Array<{
    date: string;
    activityType: string;
    title: string | null;
    durationMinutes: number;
    sessionRpe: number | null;
    muscleGroups: unknown;
    caloriesBurned: number | null;
    notes: string | null;
    status: string;
  }>;
  readinessSummary: DailyReadinessResult;
}

/**
 * Fetches cross-sport telemetry (running profile/plan/executions, cross-training 30d,
 * and DailyReadinessScore) for Analyst Coach, Master Coach, Running Coach, and Assistant Coach.
 */
export async function fetchHybridCoachingContext(referenceDate?: string): Promise<HybridCoachingContext> {
  const today = referenceDate ?? todayISO();
  const sixtyDaysAgo = shiftISODate(today, -60);
  const thirtyDaysAgo = shiftISODate(today, -30);
  const sevenDaysAgo = shiftISODate(today, -6);
  const threeDaysAgo = shiftISODate(today, -2);

  const [
    runningProfile,
    activeRunningPlan,
    recentRuns60d,
    recentCross30d,
    recentWorkouts7d,
    recentWellness7d,
  ] = await Promise.all([
    prisma.runningProfile.findUnique({
      where: { id: 'singleton' },
      select: {
        id: true,
        primaryObjective: true,
        weeklyVolumeKm: true,
        currentPace5kSec: true,
        currentPace10kSec: true,
        injuryHistory: true,
        availableDays: true,
        weeklyRunsTarget: true,
        primaryTerrain: true,
      },
    }),
    prisma.runningPlan.findFirst({
      where: { runningProfileId: 'singleton', status: 'active' },
      include: {
        sessions: {
          orderBy: [{ weekNumber: 'asc' }, { scheduledDate: 'asc' }],
          select: {
            scheduledDate: true,
            sessionType: true,
            title: true,
            totalDistanceKm: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.runningExecution.findMany({
      where: { runningProfileId: 'singleton', date: { gte: sixtyDaysAgo } },
      orderBy: { date: 'desc' },
      take: 40,
      select: {
        date: true,
        distanceKm: true,
        durationSeconds: true,
        avgPaceSec: true,
        avgHeartRate: true,
        sessionRpe: true,
        caloriesBurned: true,
        source: true,
        runningSession: { select: { sessionType: true } },
      },
    }),
    prisma.crossTrainingActivity.findMany({
      where: { athleteProfileId: 'singleton', date: { gte: thirtyDaysAgo } },
      orderBy: { date: 'desc' },
      take: 25,
      select: {
        date: true,
        activityType: true,
        title: true,
        durationMinutes: true,
        sessionRpe: true,
        muscleGroups: true,
        caloriesBurned: true,
        notes: true,
        status: true,
      },
    }),
    prisma.workoutExecution.findMany({
      where: { athleteProfileId: 'singleton', status: 'completed', date: { gte: sevenDaysAgo } },
      select: { date: true, sessionRpe: true },
    }),
    prisma.wellnessDaily.findMany({
      where: { athleteProfileId: 'singleton', date: { gte: sevenDaysAgo } },
      orderBy: { date: 'desc' },
      take: 7,
    }),
  ]);

  const runs3d = recentRuns60d.filter((r) => r.date >= threeDaysAgo && r.date <= today);
  const cross3d = recentCross30d.filter(
    (c) => c.status === 'completed' && c.date >= threeDaysAgo && c.date <= today
  );
  const strength3d = recentWorkouts7d.filter((w) => w.date >= threeDaysAgo && w.date <= today);

  const recentHighIntensityCount3d =
    strength3d.filter((w) => (w.sessionRpe ?? 0) >= 8.5).length +
    runs3d.filter(
      (r) =>
        (r.sessionRpe ?? 0) >= 8 ||
        ['long_run', 'intervals', 'tempo'].includes(r.runningSession?.sessionType ?? '')
    ).length +
    cross3d.filter((c) => (c.sessionRpe ?? 0) >= 8).length;

  const latestWellness = recentWellness7d[0] ?? null;

  const readinessSummary = computeDailyReadinessScore({
    latestWellness,
    todayStr: today,
    recentStrengthCount3d: strength3d.length,
    recentRunningCount3d: runs3d.length,
    recentCrossCount3d: cross3d.length,
    recentHighIntensityCount3d,
  });

  const weeklyKmLast7d = Math.round(
    recentRuns60d
      .filter((r) => r.date >= sevenDaysAgo && r.date <= today)
      .reduce((sum, r) => sum + r.distanceKm, 0) * 10
  ) / 10;

  const runningSummary =
    runningProfile || activeRunningPlan || recentRuns60d.length > 0
      ? {
          profile: runningProfile,
          activePlan: activeRunningPlan
            ? {
                title: activeRunningPlan.title,
                phase: activeRunningPlan.phase,
                objective: activeRunningPlan.objective,
                weeklyTargetKm: activeRunningPlan.weeklyTargetKm,
                upcomingOrRecentSessions: activeRunningPlan.sessions.slice(0, 12),
              }
            : null,
          weeklyKmLast7d,
          executionsLast60dCount: recentRuns60d.length,
          recentExecutions60d: recentRuns60d.slice(0, 20),
        }
      : null;

  return {
    runningProfile,
    runningSummary,
    crossTrainingSummary: recentCross30d,
    readinessSummary,
  };
}
