import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAuthorized, unauthorizedResponse } from '@/lib/auth';
import { todayISO, mondayOfISODate, shiftISODate } from '@/lib/dates';
import {
  computeMesocycleComparison,
  computePersonalRecordsHallOfFame,
  computeStreakMetrics,
  computeWeeklyMuscleVolume,
  filterQualifyingPerformanceRuns,
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
import { analyzeMultiSportRadar } from '@/lib/scheduling/multi-sport-radar';

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

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return unauthorizedResponse();
  }

  try {
    const todayStr = todayISO();

    // Current week Monday to Sunday in the athlete's timezone
    const mondayStr = mondayOfISODate(todayStr);
    const sundayStr = shiftISODate(mondayStr, 6);
    const prevMondayStr = shiftISODate(mondayStr, -7);
    const prevSundayStr = shiftISODate(mondayStr, -1);
    const sixWeeksAgoMondayStr = shiftISODate(mondayStr, -35);
    const threeDaysAgoStr = shiftISODate(todayStr, -2);
    const oneYearAgoStr = shiftISODate(todayStr, -365);

    // -------------------------------------------------------------------------
    // 1. Running profile, bounded executions, active plan, wellness & athlete rules
    // -------------------------------------------------------------------------
    const [runningProfile, runningExecutions, runningPlan, recentWellnessLogs, athleteProfile] =
      await Promise.all([
        prisma.runningProfile.findUnique({
          where: { id: 'singleton' },
        }),
        prisma.runningExecution.findMany({
          where: {
            runningProfileId: 'singleton',
            date: { gte: oneYearAgoStr },
          },
          include: {
            runningSession: {
              select: { sessionType: true },
            },
          },
          orderBy: { date: 'asc' },
          take: 500,
        }),
        prisma.runningPlan.findFirst({
          where: { runningProfileId: 'singleton', status: 'active' },
          include: { sessions: true },
        }),
        prisma.wellnessDaily.findMany({
          where: { athleteProfileId: 'singleton', date: { gte: prevMondayStr, lte: todayStr } },
          orderBy: { date: 'desc' },
          take: 90,
        }),
        prisma.athleteProfile.findUnique({
          where: { id: 'singleton' },
          select: { recurringCrossTraining: true },
        }),
      ]);

    // 1.1 paceData + VDOT (filtered to qualifying performance runs)
    const qualifyingRuns = filterQualifyingPerformanceRuns(
      runningExecutions.map((exec) => ({
        ...exec,
        sessionType: exec.runningSession?.sessionType ?? null,
      }))
    );

    const paceData: Array<{
      date: string;
      pace5kSec: number;
      pace10kSec: number;
      vdot: number;
      formatted5k: string;
      formatted10k: string;
    }> = [];

    for (const exec of qualifyingRuns) {
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

    // Fallback to runningProfile baseline when no qualifying performance executions exist
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
    // 2. Bounded Strength Data, Mesocycles & Templates (for Radar)
    // -------------------------------------------------------------------------
    let targetMesocycles = await prisma.mesocyclePlan.findMany({
      where: {
        athleteProfileId: 'singleton',
        OR: [{ status: 'active' }, { status: 'completed' }],
      },
      include: {
        workoutDays: {
          include: {
            prescriptions: {
              select: { movementPattern: true, exerciseName: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 2,
    });

    if (targetMesocycles.length === 0) {
      targetMesocycles = await prisma.mesocyclePlan.findMany({
        where: { athleteProfileId: 'singleton' },
        include: {
          workoutDays: {
            include: {
              prescriptions: {
                select: { movementPattern: true, exerciseName: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 2,
      });
    }

    const recentCompletedWorkoutsDesc = await prisma.workoutExecution.findMany({
      where: {
        athleteProfileId: 'singleton',
        status: 'completed',
        date: { gte: oneYearAgoStr },
      },
      include: {
        exerciseExecutions: {
          include: {
            setExecutions: true,
          },
        },
      },
      orderBy: { date: 'desc' },
      take: 500,
    });
    const allCompletedWorkouts = [...recentCompletedWorkoutsDesc].reverse();

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

    const personalRecords = computePersonalRecordsHallOfFame(allCompletedWorkouts);
    const mesocycleComparison = computeMesocycleComparison({
      activeMesocycle: targetMesocycles[0] ?? null,
      previousMesocycle: targetMesocycles[1] ?? null,
      workouts: allCompletedWorkouts,
    });

    // -------------------------------------------------------------------------
    // 3. Adherence Data from CalendarEvent (last 6 weeks) & Bounded Streak/Cross
    // -------------------------------------------------------------------------
    const [calendarEvents, completedCalendar, allCrossActivities] = await Promise.all([
      prisma.calendarEvent.findMany({
        where: {
          athleteProfileId: 'singleton',
          date: { gte: sixWeeksAgoMondayStr, lte: sundayStr },
        },
        orderBy: { date: 'asc' },
      }),
      prisma.calendarEvent.findMany({
        where: {
          athleteProfileId: 'singleton',
          status: 'completed',
          date: { gte: oneYearAgoStr },
        },
        select: { date: true },
        orderBy: { date: 'desc' },
        take: 1500,
      }),
      prisma.crossTrainingActivity.findMany({
        where: {
          athleteProfileId: 'singleton',
          date: { gte: oneYearAgoStr },
        },
        orderBy: { date: 'desc' },
        take: 500,
      }),
    ]);

    const completedCross = allCrossActivities.filter((c) => c.status === 'completed');

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
    // 4. Current & Record Consecutive Day Streak Calculation
    // -------------------------------------------------------------------------
    const completedDates: string[] = [
      ...completedCalendar.map((c) => c.date),
      ...allCompletedWorkouts.map((s) => s.date),
      ...runningExecutions.map((r) => r.date),
      ...completedCross.map((x) => x.date),
    ];

    const { currentStreak: streak, recordStreak } = computeStreakMetrics(
      completedDates,
      todayStr
    );

    // -------------------------------------------------------------------------
    // 5. Weekly Volume, Muscle Landmarks (#3), Readiness (#16), Radar, Weekly Review (#23)
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

    const currentWeekCrossEvents = calendarEvents.filter(
      (e) =>
        ['crossfit', 'swimming', 'cycling', 'yoga', 'martial_arts', 'other'].includes(
          e.eventType
        ) &&
        e.status !== 'skipped' &&
        e.date >= mondayStr &&
        e.date <= sundayStr
    );

    let recurringWeeklyTarget = 0;
    if (Array.isArray(athleteProfile?.recurringCrossTraining)) {
      for (const r of athleteProfile.recurringCrossTraining as Array<{
        daysOfWeek?: unknown;
      }>) {
        if (Array.isArray(r?.daysOfWeek)) {
          recurringWeeklyTarget += r.daysOfWeek.length;
        }
      }
    }

    const crossCompletedSessions = currentWeekCross.length;
    const crossTargetSessions = Math.max(
      recurringWeeklyTarget,
      currentWeekCrossEvents.length,
      crossCompletedSessions
    );

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

    const muscleVolume = computeWeeklyMuscleVolume({
      weekWorkouts: currentWeekWorkouts,
      weekCrossTraining: currentWeekCross,
    });

    const recent3dStrength = allCompletedWorkouts.filter((w) => w.date >= threeDaysAgoStr && w.date <= todayStr);
    const recent3dRuns = runningExecutions.filter((r) => r.date >= threeDaysAgoStr && r.date <= todayStr);
    const recent3dCross = completedCross.filter((c) => c.date >= threeDaysAgoStr && c.date <= todayStr);
    const recentHighIntensityCount3d =
      recent3dStrength.filter((w) => (w.sessionRpe ?? 0) >= 8.5).length +
      recent3dRuns.filter(
        (r) =>
          (r.sessionRpe ?? 0) >= 8 ||
          ['long_run', 'intervals', 'tempo'].includes(r.runningSession?.sessionType ?? '')
      ).length +
      recent3dCross.filter((c) => (c.sessionRpe ?? 0) >= 8).length;

    const readiness = computeDailyReadinessScore({
      latestWellness: recentWellnessLogs[0] ?? null,
      todayStr,
      recentStrengthCount3d: recent3dStrength.length,
      recentRunningCount3d: recent3dRuns.length,
      recentCrossCount3d: recent3dCross.length,
      recentHighIntensityCount3d,
    });

    // Multi-Sport Radar for current calendar week
    const currentWeekEvents = calendarEvents.filter(
      (e) => e.date >= mondayStr && e.date <= sundayStr
    );
    const multiSportRadar = analyzeMultiSportRadar({
      weekEvents: currentWeekEvents,
      templatesWithPrescriptions: targetMesocycles[0]?.workoutDays ?? [],
      runningSessions: runningPlan?.sessions ?? [],
      crossTrainingActivities: allCrossActivities.filter(
        (c) => c.date >= mondayStr && c.date <= sundayStr
      ),
    });

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
        .filter((m) => m.status === 'below_mev' && m.effectiveSets > 0)
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
      recordStreak,
      weeklyVolume,
      muscleVolume,
      personalRecords,
      mesocycleComparison,
      readiness,
      multiSportRadar,
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
        recordStreak: 0,
        weeklyVolume: {
          strength: { completedSets: 0, targetSets: 16 },
          running: { completedKm: 0, targetKm: 20 },
          crossTraining: { completedSessions: 0, targetSessions: 0 },
        },
        muscleVolume: [],
        personalRecords: [],
        mesocycleComparison: null,
        readiness: null,
        multiSportRadar: null,
        weeklyReview: null,
      },
      { status: 500 }
    );
  }
}
