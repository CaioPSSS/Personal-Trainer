import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function formatPace(sec?: number | null): string {
  if (!sec || isNaN(sec) || sec <= 0) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}/km`;
}

function formatDateString(d: Date): string {
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getMondayOfCurrentWeek(): Date {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export async function GET() {
  try {
    const today = new Date();
    const todayStr = formatDateString(today);

    // Current week Monday to Sunday
    const currentMonday = getMondayOfCurrentWeek();
    const currentSunday = new Date(currentMonday);
    currentSunday.setDate(currentMonday.getDate() + 6);
    const mondayStr = formatDateString(currentMonday);
    const sundayStr = formatDateString(currentSunday);

    // -------------------------------------------------------------------------
    // 1. Running profile & executions for paceData and volumeData
    // -------------------------------------------------------------------------
    const [runningProfile, runningExecutions, runningPlan] = await Promise.all([
      prisma.runningProfile.findUnique({
        where: { id: 'singleton' },
      }),
      prisma.runningExecution.findMany({
        where: { runningProfileId: 'singleton' },
        orderBy: { date: 'asc' },
      }),
      prisma.runningPlan.findFirst({
        where: { runningProfileId: 'singleton', status: 'active' },
        include: { sessions: true },
      }),
    ]);

    // 1.1 paceData
    const paceData: Array<{
      date: string;
      pace5kSec: number;
      pace10kSec: number;
      formatted5k: string;
      formatted10k: string;
    }> = [];

    if (runningExecutions.length > 0) {
      for (const exec of runningExecutions) {
        if (!exec.avgPaceSec || exec.avgPaceSec <= 0 || !exec.distanceKm || exec.distanceKm <= 0) {
          continue;
        }

        // Peter Riegel formula: Pace2 = Pace1 * (D2 / D1)^0.06
        const pace5k = Math.round(exec.avgPaceSec * Math.pow(5 / exec.distanceKm, 0.06));
        const pace10k = Math.round(exec.avgPaceSec * Math.pow(10 / exec.distanceKm, 0.06));

        paceData.push({
          date: exec.date,
          pace5kSec: pace5k,
          pace10kSec: pace10k,
          formatted5k: formatPace(pace5k),
          formatted10k: formatPace(pace10k),
        });
      }
    }

    // If no execution runs exist yet, fallback to runningProfile baseline if present
    if (paceData.length === 0 && runningProfile?.currentPace5kSec) {
      const pace5k = runningProfile.currentPace5kSec;
      const pace10k = runningProfile.currentPace10kSec ?? Math.round(pace5k * 1.06);
      paceData.push({
        date: todayStr,
        pace5kSec: pace5k,
        pace10kSec: pace10k,
        formatted5k: formatPace(pace5k),
        formatted10k: formatPace(pace10k),
      });
    }

    // 1.2 volumeData (last 6 calendar weeks aggregated)
    const targetKmDefault = runningPlan?.weeklyTargetKm ?? 20.0;
    const volumeData: Array<{
      weekLabel: string;
      actualKm: number;
      targetKm: number;
    }> = [];

    for (let w = 5; w >= 0; w--) {
      const wMonday = new Date(currentMonday);
      wMonday.setDate(currentMonday.getDate() - w * 7);
      const wSunday = new Date(wMonday);
      wSunday.setDate(wMonday.getDate() + 6);

      const wMonStr = formatDateString(wMonday);
      const wSunStr = formatDateString(wSunday);

      const weekExecs = runningExecutions.filter(
        (e) => e.date >= wMonStr && e.date <= wSunStr
      );
      const actualKm = weekExecs.reduce((sum, e) => sum + (e.distanceKm || 0), 0);

      // Check planned sessions for that week if available
      const plannedWeekSessions = runningPlan?.sessions.filter(
        (s) => s.scheduledDate >= wMonStr && s.scheduledDate <= wSunStr
      );
      const plannedTargetKm = plannedWeekSessions && plannedWeekSessions.length > 0
        ? plannedWeekSessions.reduce((sum, s) => sum + (s.totalDistanceKm || 0), 0)
        : targetKmDefault;

      const weekLabel = `Sem ${wMonday.getDate()}/${wMonday.getMonth() + 1}`;
      volumeData.push({
        weekLabel,
        actualKm: Math.round(actualKm * 10) / 10,
        targetKm: Math.round(plannedTargetKm * 10) / 10,
      });
    }

    // -------------------------------------------------------------------------
    // 2. Strength Data strictly scoped to active and previous mesocycles
    // -------------------------------------------------------------------------
    const mesocycles = await prisma.mesocyclePlan.findMany({
      where: {
        athleteProfileId: 'singleton',
        OR: [
          { status: 'active' },
          { status: 'completed' },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 2,
    });

    let targetMesocycles = mesocycles;
    if (targetMesocycles.length === 0) {
      targetMesocycles = await prisma.mesocyclePlan.findMany({
        where: { athleteProfileId: 'singleton' },
        orderBy: { createdAt: 'desc' },
        take: 2,
      });
    }

    const mesoIds = targetMesocycles.map((m) => m.id);

    const workoutExecutions = mesoIds.length > 0
      ? await prisma.workoutExecution.findMany({
          where: {
            mesocyclePlanId: { in: mesoIds },
            status: 'completed',
          },
          include: {
            exerciseExecutions: {
              include: {
                setExecutions: true,
              },
            },
          },
          orderBy: { date: 'asc' },
        })
      : [];

    const strengthData: Array<{
      exerciseName: string;
      date: string;
      maxLoadKg: number;
      totalVolumeLoadKg: number;
    }> = [];

    for (const we of workoutExecutions) {
      for (const ee of we.exerciseExecutions) {
        if (!ee.setExecutions || ee.setExecutions.length === 0) continue;
        let maxLoad = 0;
        let totalVol = 0;

        for (const s of ee.setExecutions) {
          const load = s.loadKg ?? 0;
          if (load > maxLoad) maxLoad = load;
          totalVol += load * (s.reps ?? 0);
        }

        strengthData.push({
          exerciseName: ee.exerciseName,
          date: we.date,
          maxLoadKg: Math.round(maxLoad * 10) / 10,
          totalVolumeLoadKg: Math.round(totalVol * 10) / 10,
        });
      }
    }

    // -------------------------------------------------------------------------
    // 3. Adherence Data from CalendarEvent (last 6 weeks)
    // -------------------------------------------------------------------------
    const calendarEvents = await prisma.calendarEvent.findMany({
      where: { athleteProfileId: 'singleton' },
      orderBy: { date: 'asc' },
    });

    const adherenceData: Array<{
      weekLabel: string;
      completedCount: number;
      plannedCount: number;
      skippedCount: number;
      percentage: number;
    }> = [];

    for (let w = 5; w >= 0; w--) {
      const wMonday = new Date(currentMonday);
      wMonday.setDate(currentMonday.getDate() - w * 7);
      const wSunday = new Date(wMonday);
      wSunday.setDate(wMonday.getDate() + 6);

      const wMonStr = formatDateString(wMonday);
      const wSunStr = formatDateString(wSunday);

      const weekEvents = calendarEvents.filter(
        (e) => e.date >= wMonStr && e.date <= wSunStr
      );

      const completedCount = weekEvents.filter((e) => e.status === 'completed').length;
      const plannedCount = weekEvents.filter((e) => e.status === 'planned').length;
      const skippedCount = weekEvents.filter((e) => e.status === 'skipped').length;
      const total = completedCount + plannedCount + skippedCount;
      const percentage = total > 0 ? Math.round((completedCount / total) * 100) : 0;

      adherenceData.push({
        weekLabel: `Sem ${wMonday.getDate()}/${wMonday.getMonth() + 1}`,
        completedCount,
        plannedCount,
        skippedCount,
        percentage,
      });
    }

    // -------------------------------------------------------------------------
    // 4. Consecutive Day Streak Calculation
    // -------------------------------------------------------------------------
    const [completedCalendar, completedStrength, completedRunning, completedCross] =
      await Promise.all([
        prisma.calendarEvent.findMany({
          where: { athleteProfileId: 'singleton', status: 'completed' },
          select: { date: true },
        }),
        prisma.workoutExecution.findMany({
          where: { athleteProfileId: 'singleton', status: 'completed' },
          select: { date: true },
        }),
        prisma.runningExecution.findMany({
          where: { runningProfileId: 'singleton' },
          select: { date: true },
        }),
        prisma.crossTrainingActivity.findMany({
          where: { athleteProfileId: 'singleton', status: 'completed' },
          select: { date: true },
        }),
      ]);

    const completedDatesSet = new Set<string>();
    completedCalendar.forEach((c) => completedDatesSet.add(c.date));
    completedStrength.forEach((s) => completedDatesSet.add(s.date));
    completedRunning.forEach((r) => completedDatesSet.add(r.date));
    completedCross.forEach((x) => completedDatesSet.add(x.date));

    // Calculate streak
    let streak = 0;
    const checkDate = new Date();
    // If today has activity, streak starts from today
    // If today doesn't have activity yet, check yesterday to keep streak active
    if (!completedDatesSet.has(formatDateString(checkDate))) {
      checkDate.setDate(checkDate.getDate() - 1);
    }

    while (completedDatesSet.has(formatDateString(checkDate))) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }

    // -------------------------------------------------------------------------
    // 5. Weekly Volume for Current Week
    // -------------------------------------------------------------------------
    // Strength sets completed this week
    const currentWeekWorkouts = await prisma.workoutExecution.findMany({
      where: {
        athleteProfileId: 'singleton',
        status: 'completed',
        date: { gte: mondayStr, lte: sundayStr },
      },
      include: {
        exerciseExecutions: {
          include: {
            setExecutions: true,
          },
        },
      },
    });

    let strengthCompletedSets = 0;
    for (const cw of currentWeekWorkouts) {
      for (const ee of cw.exerciseExecutions) {
        strengthCompletedSets += ee.setExecutions.length;
      }
    }

    // Target strength sets from planned calendar events or templates
    const plannedStrengthEvents = calendarEvents.filter(
      (e) => e.eventType === 'strength' && e.date >= mondayStr && e.date <= sundayStr
    );
    const strengthTargetSets = Math.max(16, plannedStrengthEvents.length * 12);

    // Running km completed this week
    const currentWeekRuns = runningExecutions.filter(
      (e) => e.date >= mondayStr && e.date <= sundayStr
    );
    const runningCompletedKm = currentWeekRuns.reduce(
      (sum, e) => sum + (e.distanceKm || 0),
      0
    );
    const runningTargetKm = runningPlan?.weeklyTargetKm ?? 20.0;

    // Cross-training sessions completed this week
    const currentWeekCross = completedCross.filter(
      (x) => x.date >= mondayStr && x.date <= sundayStr
    );
    const crossCompletedSessions = currentWeekCross.length;
    const crossTargetSessions = 2;

    const weeklyVolume = {
      strength: {
        completedSets: strengthCompletedSets,
        targetSets: strengthTargetSets,
      },
      running: {
        completedKm: Math.round(runningCompletedKm * 10) / 10,
        targetKm: Math.round(runningTargetKm * 10) / 10,
      },
      crossTraining: {
        completedSessions: crossCompletedSessions,
        targetSessions: crossTargetSessions,
      },
    };

    return NextResponse.json({
      paceData,
      volumeData,
      strengthData,
      adherenceData,
      streak,
      weeklyVolume,
    });
  } catch (error) {
    console.error('[API /api/analytics] Erro ao agregar métricas analíticas:', error);
    return NextResponse.json(
      {
        error: 'Erro interno ao agregar dados analíticos.',
        paceData: [],
        volumeData: [],
        strengthData: [],
        adherenceData: [],
        streak: 0,
        weeklyVolume: {
          strength: { completedSets: 0, targetSets: 16 },
          running: { completedKm: 0, targetKm: 20 },
          crossTraining: { completedSessions: 0, targetSessions: 2 },
        },
      },
      { status: 500 }
    );
  }
}
