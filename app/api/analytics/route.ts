import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { todayISO, mondayOfISODate, shiftISODate } from '@/lib/dates';
import {
  computeMesocycleComparison,
  computePersonalRecordsHallOfFame,
  computeWeeklyMuscleVolume,
} from '@/lib/analytics/hypertrophy-analytics';
import {
  computeDailyReadinessScore,
  computeWeeklyReview,
} from '@/lib/analytics/readiness-score';
import {
  estimateVdotFrom5kPaceSec,
  estimateVdotFromExecution,
  predictRaceTimesFrom5kPace,
} from '@/lib/running/vdot-predictor';

export const dynamic = 'force-dynamic';

function formatPace(sec?: number | null): string {
  if (!sec || isNaN(sec) || sec <= 0) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}/km`;
}

function formatWeekLabelFromISO(mondayStr: string): string {
  const [, month, day] = mondayStr.split('-').map(Number);
  return `Sem ${day}/${month}`;
}

export async function GET() {
  try {
    const todayStr = todayISO();

    // Current week Monday to Sunday in the athlete's timezone
    const mondayStr = mondayOfISODate(todayStr);
    const sundayStr = shiftISODate(mondayStr, 6);
    const prevMondayStr = shiftISODate(mondayStr, -7);
    const prevSundayStr = shiftISODate(mondayStr, -1);
    const sixWeeksAgoMondayStr = shiftISODate(mondayStr, -35);
    const threeDaysAgoStr = shiftISODate(todayStr, -3);

    // -------------------------------------------------------------------------
    // 1. Running profile & executions for paceData, VDOT, racePredictions, volumeData
    // -------------------------------------------------------------------------
    const [runningProfile, runningExecutions, runningPlan, recentWellnessLogs] = await Promise.all([
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
      prisma.wellnessDaily.findMany({
        where: { athleteProfileId: 'singleton', date: { gte: prevMondayStr, lte: todayStr } },
        orderBy: { date: 'desc' },
      }),
    ]);

    // 1.1 paceData + VDOT
    const paceData: Array<{
      date: string;
      pace5kSec: number;
      pace10kSec: number;
      vdot: number;
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
        const vdot =
          estimateVdotFromExecution({
            distanceKm: exec.distanceKm,
            durationSeconds: exec.durationSeconds || exec.avgPaceSec * exec.distanceKm,
            avgHeartRate: exec.avgHeartRate,
            maxHeartRate: runningProfile?.maxHeartRate,
            restingHeartRate: runningProfile?.restingHeartRate,
          }) ?? estimateVdotFrom5kPaceSec(pace5k);

        paceData.push({
          date: exec.date,
          pace5kSec: pace5k,
          pace10kSec: pace10k,
          vdot,
          formatted5k: formatPace(pace5k),
          formatted10k: formatPace(pace10k),
        });
      }
    }

    // If no execution runs exist yet, fallback to runningProfile baseline if present
    if (paceData.length === 0 && runningProfile?.currentPace5kSec) {
      const pace5k = runningProfile.currentPace5kSec;
      const pace10k = runningProfile.currentPace10kSec ?? Math.round(pace5k * 1.06);
      const vdot = estimateVdotFrom5kPaceSec(pace5k);
      paceData.push({
        date: todayStr,
        pace5kSec: pace5k,
        pace10kSec: pace10k,
        vdot,
        formatted5k: formatPace(pace5k),
        formatted10k: formatPace(pace10k),
      });
    }

    const latestPaceEntry = paceData[paceData.length - 1];
    const baseline5kPaceSec =
      latestPaceEntry?.pace5kSec ?? runningProfile?.currentPace5kSec ?? 330;
    const currentVdot =
      latestPaceEntry?.vdot ?? estimateVdotFrom5kPaceSec(baseline5kPaceSec);
    const racePredictions = predictRaceTimesFrom5kPace(baseline5kPaceSec);

    // 1.2 volumeData (last 6 calendar weeks aggregated)
    const targetKmDefault = runningPlan?.weeklyTargetKm ?? 20.0;
    const volumeData: Array<{
      weekLabel: string;
      actualKm: number;
      targetKm: number;
    }> = [];

    for (let w = 5; w >= 0; w--) {
      const wMonStr = shiftISODate(mondayStr, -w * 7);
      const wSunStr = shiftISODate(wMonStr, 6);

      const weekExecs = runningExecutions.filter(
        (e) => e.date >= wMonStr && e.date <= wSunStr
      );
      const actualKm = weekExecs.reduce((sum, e) => sum + (e.distanceKm || 0), 0);

      const plannedWeekSessions = runningPlan?.sessions.filter(
        (s) => s.scheduledDate >= wMonStr && s.scheduledDate <= wSunStr
      );
      const plannedTargetKm =
        plannedWeekSessions && plannedWeekSessions.length > 0
          ? plannedWeekSessions.reduce((sum, s) => sum + (s.totalDistanceKm || 0), 0)
          : targetKmDefault;

      const weekLabel = formatWeekLabelFromISO(wMonStr);
      volumeData.push({
        weekLabel,
        actualKm: Math.round(actualKm * 10) / 10,
        targetKm: Math.round(plannedTargetKm * 10) / 10,
      });
    }

    // -------------------------------------------------------------------------
    // 2. Strength Data & Mesocycles
    // -------------------------------------------------------------------------
    const mesocycles = await prisma.mesocyclePlan.findMany({
      where: {
        athleteProfileId: 'singleton',
        OR: [{ status: 'active' }, { status: 'completed' }],
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

    const allCompletedWorkouts = await prisma.workoutExecution.findMany({
      where: {
        athleteProfileId: 'singleton',
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
    });

    const mesoIds = new Set(targetMesocycles.map((m) => m.id));
    const workoutExecutions =
      mesoIds.size > 0
        ? allCompletedWorkouts.filter((w) => w.mesocyclePlanId && mesoIds.has(w.mesocyclePlanId))
        : allCompletedWorkouts;

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

    // PR Hall of Fame (#4) & Mesocycle Comparison (#24)
    const personalRecords = computePersonalRecordsHallOfFame(allCompletedWorkouts);
    const mesocycleComparison = computeMesocycleComparison({
      activeMesocycle: targetMesocycles[0] ?? null,
      previousMesocycle: targetMesocycles[1] ?? null,
      workouts: allCompletedWorkouts,
    });

    // -------------------------------------------------------------------------
    // 3. Adherence Data from CalendarEvent (last 6 weeks)
    // -------------------------------------------------------------------------
    const calendarEvents = await prisma.calendarEvent.findMany({
      where: {
        athleteProfileId: 'singleton',
        date: { gte: sixWeeksAgoMondayStr, lte: sundayStr },
      },
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
      const wMonStr = shiftISODate(mondayStr, -w * 7);
      const wSunStr = shiftISODate(wMonStr, 6);

      const weekEvents = calendarEvents.filter(
        (e) => e.date >= wMonStr && e.date <= wSunStr
      );

      const completedCount = weekEvents.filter((e) => e.status === 'completed').length;
      const plannedCount = weekEvents.filter((e) => e.status === 'planned').length;
      const skippedCount = weekEvents.filter((e) => e.status === 'skipped').length;
      const total = completedCount + plannedCount + skippedCount;
      const percentage = total > 0 ? Math.round((completedCount / total) * 100) : 0;

      adherenceData.push({
        weekLabel: formatWeekLabelFromISO(wMonStr),
        completedCount,
        plannedCount,
        skippedCount,
        percentage,
      });
    }

    // -------------------------------------------------------------------------
    // 4. Consecutive Day Streak Calculation & Cross-Training
    // -------------------------------------------------------------------------
    const [completedCalendar, completedCross] = await Promise.all([
      prisma.calendarEvent.findMany({
        where: { athleteProfileId: 'singleton', status: 'completed' },
        select: { date: true },
      }),
      prisma.crossTrainingActivity.findMany({
        where: { athleteProfileId: 'singleton', status: 'completed' },
      }),
    ]);

    const completedDatesSet = new Set<string>();
    completedCalendar.forEach((c) => completedDatesSet.add(c.date));
    allCompletedWorkouts.forEach((s) => completedDatesSet.add(s.date));
    runningExecutions.forEach((r) => completedDatesSet.add(r.date));
    completedCross.forEach((x) => completedDatesSet.add(x.date));

    let streak = 0;
    let checkDateStr = todayStr;
    if (!completedDatesSet.has(checkDateStr)) {
      checkDateStr = shiftISODate(todayStr, -1);
    }

    while (completedDatesSet.has(checkDateStr)) {
      streak++;
      checkDateStr = shiftISODate(checkDateStr, -1);
    }

    // -------------------------------------------------------------------------
    // 5. Weekly Volume, Muscle Landmarks (#3), Readiness (#16), Weekly Review (#23)
    // -------------------------------------------------------------------------
    const currentWeekWorkouts = allCompletedWorkouts.filter(
      (w) => w.date >= mondayStr && w.date <= sundayStr
    );
    const prevWeekWorkouts = allCompletedWorkouts.filter(
      (w) => w.date >= prevMondayStr && w.date <= prevSundayStr
    );

    const calcWorkoutsStats = (list: typeof allCompletedWorkouts) => {
      let sets = 0;
      let tonnage = 0;
      let calories = 0;
      for (const cw of list) {
        calories += cw.caloriesBurned ?? 0;
        for (const ee of cw.exerciseExecutions) {
          for (const s of ee.setExecutions) {
            if ((s.reps ?? 0) > 0) {
              sets += 1;
              tonnage += (s.loadKg ?? 0) * s.reps;
            }
          }
        }
      }
      return { sets, tonnage, calories };
    };

    const currStrengthStats = calcWorkoutsStats(currentWeekWorkouts);
    const prevStrengthStats = calcWorkoutsStats(prevWeekWorkouts);

    const plannedStrengthEvents = calendarEvents.filter(
      (e) => e.eventType === 'strength' && e.date >= mondayStr && e.date <= sundayStr
    );
    const strengthTargetSets = Math.max(16, plannedStrengthEvents.length * 12);

    const currentWeekRuns = runningExecutions.filter(
      (e) => e.date >= mondayStr && e.date <= sundayStr
    );
    const prevWeekRuns = runningExecutions.filter(
      (e) => e.date >= prevMondayStr && e.date <= prevSundayStr
    );

    const runningCompletedKm = currentWeekRuns.reduce((sum, e) => sum + (e.distanceKm || 0), 0);
    const prevRunningKm = prevWeekRuns.reduce((sum, e) => sum + (e.distanceKm || 0), 0);
    const runningTargetKm = runningPlan?.weeklyTargetKm ?? 20.0;

    const currentWeekCross = completedCross.filter(
      (x) => x.date >= mondayStr && x.date <= sundayStr
    );
    const prevWeekCross = completedCross.filter(
      (x) => x.date >= prevMondayStr && x.date <= prevSundayStr
    );

    const crossCompletedSessions = currentWeekCross.length;
    const crossTargetSessions = 2;

    const weeklyVolume = {
      strength: {
        completedSets: currStrengthStats.sets,
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

    // #3: Weekly Muscle Volume Landmarks (MEV / MAV / MRV + CrossFit overlap)
    const muscleVolume = computeWeeklyMuscleVolume({
      weekWorkouts: currentWeekWorkouts,
      weekCrossTraining: currentWeekCross,
    });

    // #16: Daily Multi-Sport Readiness Score (0-100%)
    const recent3dStrength = allCompletedWorkouts.filter((w) => w.date >= threeDaysAgoStr && w.date <= todayStr);
    const recent3dRuns = runningExecutions.filter((r) => r.date >= threeDaysAgoStr && r.date <= todayStr);
    const recent3dCross = completedCross.filter((c) => c.date >= threeDaysAgoStr && c.date <= todayStr);
    const recentHighIntensityCount3d =
      recent3dStrength.filter((w) => (w.sessionRpe ?? 0) >= 8.5).length +
      recent3dRuns.filter((r) => (r.sessionRpe ?? 0) >= 8).length +
      recent3dCross.filter((c) => (c.sessionRpe ?? 0) >= 8).length;

    const readiness = computeDailyReadinessScore({
      latestWellness: recentWellnessLogs[0] ?? null,
      todayStr,
      recentStrengthCount3d: recent3dStrength.length,
      recentRunningCount3d: recent3dRuns.length,
      recentCrossCount3d: recent3dCross.length,
      recentHighIntensityCount3d,
    });

    // #23: Weekly Review Summary (Current Week vs Previous Week)
    const currWeekCalories =
      currStrengthStats.calories +
      currentWeekRuns.reduce((s, r) => s + (r.caloriesBurned ?? 0), 0) +
      currentWeekCross.reduce((s, c) => s + (c.caloriesBurned ?? 0), 0);

    const prevWeekCalories =
      prevStrengthStats.calories +
      prevWeekRuns.reduce((s, r) => s + (r.caloriesBurned ?? 0), 0) +
      prevWeekCross.reduce((s, c) => s + (c.caloriesBurned ?? 0), 0);

    const currWeekSleepLogs = recentWellnessLogs.filter(
      (w) => w.date >= mondayStr && w.date <= sundayStr && w.sleepHours != null && w.sleepHours > 0
    );
    const avgSleepHours =
      currWeekSleepLogs.length > 0
        ? currWeekSleepLogs.reduce((s, w) => s + (w.sleepHours ?? 0), 0) / currWeekSleepLogs.length
        : null;

    const currentAdherenceObj = adherenceData[adherenceData.length - 1];
    const prevAdherenceObj = adherenceData[adherenceData.length - 2];

    const weeklyReview = computeWeeklyReview({
      currentWeekLabel: formatWeekLabelFromISO(mondayStr),
      previousWeekLabel: formatWeekLabelFromISO(prevMondayStr),
      currentAdherencePercent: currentAdherenceObj?.percentage ?? 0,
      previousAdherencePercent: prevAdherenceObj?.percentage ?? 0,
      currentTonnageKg: currStrengthStats.tonnage,
      previousTonnageKg: prevStrengthStats.tonnage,
      currentSets: currStrengthStats.sets,
      previousSets: prevStrengthStats.sets,
      currentRunningKm: runningCompletedKm,
      previousRunningKm: prevRunningKm,
      currentCrossSessions: currentWeekCross.length,
      previousCrossSessions: prevWeekCross.length,
      currentCaloriesBurned: currWeekCalories,
      previousCaloriesBurned: prevWeekCalories,
      avgSleepHours,
      underMevMuscles: muscleVolume
        .filter((m) => m.status === 'below_mev' && m.directSets > 0)
        .map((m) => m.muscleGroup),
    });

    return NextResponse.json({
      paceData,
      currentVdot,
      racePredictions,
      volumeData,
      strengthData,
      adherenceData,
      streak,
      weeklyVolume,
      muscleVolume,
      personalRecords,
      mesocycleComparison,
      readiness,
      weeklyReview,
    });
  } catch (error) {
    console.error('[API /api/analytics] Erro ao agregar métricas analíticas:', error);
    return NextResponse.json(
      {
        error: 'Erro interno ao agregar dados analíticos.',
        paceData: [],
        currentVdot: null,
        racePredictions: [],
        volumeData: [],
        strengthData: [],
        adherenceData: [],
        streak: 0,
        weeklyVolume: {
          strength: { completedSets: 0, targetSets: 16 },
          running: { completedKm: 0, targetKm: 20 },
          crossTraining: { completedSessions: 0, targetSessions: 2 },
        },
        muscleVolume: [],
        personalRecords: [],
        mesocycleComparison: null,
        readiness: null,
        weeklyReview: null,
      },
      { status: 500 }
    );
  }
}
