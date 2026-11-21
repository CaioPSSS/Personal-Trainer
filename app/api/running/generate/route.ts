import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { isAuthorized } from '@/lib/auth';
import {
  DayOfWeek,
  RunningPlanOutput,
  runningPlanOutputSchema,
  RUNNING_PLAN_SCHEMA_VERSION,
  validateRunningPlanSemantics,
} from '@/lib/ai/running-contracts';
import { buildRunningCoachPrompts } from '@/lib/ai/running-prompts';
import {
  RUNNING_COACH_DEFAULT_CASCADE,
  resolveModelCascade,
} from '@/lib/ai/models';
import { buildWellnessNutritionDigest } from '@/lib/ai/context-builders';
import { generateStructuredOutput } from '@/lib/ai/openrouter';
import {
  parseAvailableDayIndices,
  rebalanceWeekSchedule,
} from '@/lib/scheduling/strength-scheduler';
import {
  isISODate,
  shiftISODate,
  todayISO,
} from '@/lib/dates';
import {
  resolveCycleAnchorMonday,
  resolveRunningPlanMonthYear,
} from '@/lib/scheduling/plan-dates';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const DAY_OFFSETS: Record<string, number> = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6,
};

const ALL_CANONICAL_DAYS: DayOfWeek[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

function dayDistance(dayA: string, dayB: string): number {
  const offsetA = DAY_OFFSETS[dayA.toLowerCase()] ?? 0;
  const offsetB = DAY_OFFSETS[dayB.toLowerCase()] ?? 0;
  const diff = Math.abs(offsetA - offsetB);
  return Math.min(diff, 7 - diff);
}

function resolveSessionDay(
  dayOfWeek: string,
  availableDays?: string[] | null,
  usedDaysInWeek?: Set<string>
): DayOfWeek {
  const cleanTarget = (dayOfWeek || 'monday').toLowerCase();

  const validAvailable = (
    Array.isArray(availableDays) && availableDays.length > 0
      ? availableDays.map((d) => d.toLowerCase())
      : ALL_CANONICAL_DAYS
  ).filter((d): d is DayOfWeek => DAY_OFFSETS[d] !== undefined);

  const candidatePool = validAvailable.length > 0 ? validAvailable : ALL_CANONICAL_DAYS;

  // 1. If target day is in candidate pool and unused in this week, choose it directly
  if (
    candidatePool.includes(cleanTarget as DayOfWeek) &&
    (!usedDaysInWeek || !usedDaysInWeek.has(cleanTarget))
  ) {
    return cleanTarget as DayOfWeek;
  }

  // 2. Otherwise prefer unused days in candidate pool closest to target day
  const unusedCandidates = usedDaysInWeek
    ? candidatePool.filter((d) => !usedDaysInWeek.has(d))
    : candidatePool;

  const poolToSearch = unusedCandidates.length > 0 ? unusedCandidates : candidatePool;

  let bestCandidate = poolToSearch[0];
  let bestDist = dayDistance(bestCandidate, cleanTarget);
  for (let i = 1; i < poolToSearch.length; i++) {
    const dist = dayDistance(poolToSearch[i], cleanTarget);
    if (dist < bestDist) {
      bestDist = dist;
      bestCandidate = poolToSearch[i];
    }
  }

  return bestCandidate;
}

function computeSessionSchedule(
  anchorMonday: string,
  weekNumber: number,
  dayOfWeek: string,
  availableDays?: string[] | null,
  usedDaysInWeek?: Set<string>
): { scheduledDate: string; resolvedDay: DayOfWeek } {
  const resolvedDay = resolveSessionDay(dayOfWeek, availableDays, usedDaysInWeek);
  const dayOffset = DAY_OFFSETS[resolvedDay] ?? 0;
  const scheduledDate = shiftISODate(anchorMonday, (weekNumber - 1) * 7 + dayOffset);
  return { scheduledDate, resolvedDay };
}

export async function GET() {
  try {
    const activePlan = await prisma.runningPlan.findFirst({
      where: {
        runningProfileId: 'singleton',
        status: 'active',
      },
      include: {
        sessions: {
          orderBy: [
            { weekNumber: 'asc' },
            { scheduledDate: 'asc' },
          ],
          include: {
            executions: {
              orderBy: { date: 'desc' },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!activePlan) {
      return NextResponse.json({ plan: null }, { status: 200 });
    }

    return NextResponse.json({ plan: activePlan }, { status: 200 });
  } catch (error) {
    console.error('[Running Generate] Erro ao buscar plano ativo:', error);
    return NextResponse.json({ error: 'Falha ao buscar plano de corrida.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const modelCascade = resolveModelCascade(
    process.env.RUNNING_COACH_CASCADE,
    RUNNING_COACH_DEFAULT_CASCADE
  );

  try {
    // Ensure base athlete profile singleton exists for CalendarEvent relation
    await prisma.athleteProfile.upsert({
      where: { id: 'singleton' },
      update: {},
      create: {
        id: 'singleton',
        sessionDurationMin: 60,
      },
    });

    // 1. Query RunningProfile (singleton)
    const runningProfile = await prisma.runningProfile.findUnique({
      where: { id: 'singleton' },
    });

    if (!runningProfile) {
      return NextResponse.json(
        { error: 'Perfil de corrida não encontrado. Complete o onboarding primeiro.' },
        { status: 400 }
      );
    }

    let body: { month?: number; year?: number; startDate?: string } = {};
    try {
      body = await req.json();
    } catch {
      // Empty or no body passed
    }

    const todayStr = todayISO();
    const requestedStartDate =
      typeof body.startDate === 'string' && isISODate(body.startDate)
        ? body.startDate
        : null;

    const availableDayIndices = parseAvailableDayIndices(runningProfile.availableDays);
    const weeklyRunsTarget =
      runningProfile.weeklyRunsTarget ??
      (availableDayIndices.length >= 3 ? 3 : availableDayIndices.length);

    const anchor = resolveCycleAnchorMonday({
      today: todayStr,
      availableDayIndices,
      weeklyTarget: weeklyRunsTarget,
      requestedStartDate,
    });

    const derivedMonthYear = resolveRunningPlanMonthYear(anchor.anchorMonday);
    const targetMonth = body.month ?? derivedMonthYear.month;
    const targetYear = body.year ?? derivedMonthYear.year;

    const sixtyDaysAgoStr = shiftISODate(todayStr, -60);
    const thirtyDaysAgoStr = shiftISODate(todayStr, -30);

    // 2. Query recent running executions, brain entries, cross-training, strength workouts, active plan adherence, wellness/nutrition & recurring cross-training
    const [
      recentExecutions,
      rawBrainEntries,
      recentCrossTraining,
      recentWorkouts,
      activePlan,
      athleteRecord,
      recentWellness,
    ] = await Promise.all([
      prisma.runningExecution.findMany({
        where: {
          runningProfileId: 'singleton',
          date: { gte: sixtyDaysAgoStr },
        },
        orderBy: { date: 'desc' },
        take: 30,
      }),
      prisma.runningBrainEntry.findMany({
        where: { runningProfileId: 'singleton' },
        orderBy: { createdAt: 'desc' },
        take: 3,
      }),
      prisma.crossTrainingActivity.findMany({
        where: {
          athleteProfileId: 'singleton',
          date: { gte: thirtyDaysAgoStr },
        },
        orderBy: { date: 'desc' },
        take: 14,
      }),
      prisma.workoutExecution.findMany({
        where: {
          athleteProfileId: 'singleton',
          date: { gte: thirtyDaysAgoStr },
        },
        orderBy: { date: 'desc' },
        take: 14,
        include: {
          exerciseExecutions: true,
        },
      }),
      prisma.runningPlan.findFirst({
        where: {
          runningProfileId: 'singleton',
          status: 'active',
        },
        include: {
          sessions: {
            include: { executions: true },
          },
        },
      }),
      prisma.athleteProfile.findUnique({
        where: { id: 'singleton' },
        select: { recurringCrossTraining: true, bodyWeightKg: true },
      }),
      prisma.wellnessDaily.findMany({
        where: {
          athleteProfileId: 'singleton',
          date: { gte: thirtyDaysAgoStr },
        },
        orderBy: { date: 'desc' },
        take: 28,
      }),
    ]);

    const wellnessNutritionDigest = buildWellnessNutritionDigest(
      recentWellness,
      athleteRecord?.bodyWeightKg
    );

    // 3. Apply temporal memory decay: 1.0 (current), 0.7 (month -1), 0.4 (month -2)
    const decaySchedule = [1.0, 0.7, 0.4];
    const previousBrainEntries = rawBrainEntries.map((entry, index) => {
      const decayWeight = decaySchedule[index] ?? 0.0;
      return {
        month: entry.month,
        year: entry.year,
        decayWeight,
        hypotheses: entry.hypotheses,
        retrospective: entry.retrospective,
      };
    });

    const recentStrengthWorkouts = recentWorkouts.map((w) => ({
      date: w.date,
      workoutTitle:
        w.exerciseExecutions.length > 0
          ? `Treino de Força (${w.exerciseExecutions.map((e) => e.exerciseName).slice(0, 3).join(', ')})`
          : 'Treino de Força',
      targetMuscleGroups: Array.from(
        new Set(
          w.exerciseExecutions
            .map((e) => e.movementPattern)
            .filter((mp): mp is string => Boolean(mp))
        )
      ),
      rpeAvg: w.sessionRpe,
    }));

    // 4. Build prompt context
    const athleteAvailableDays = Array.isArray(runningProfile.availableDays)
      ? (runningProfile.availableDays as string[])
      : null;

    // 4. Calculate active plan adherence summary & extract recurring cross-training
    let planAdherenceSummary = null;
    if (activePlan && activePlan.sessions.length > 0) {
      const totalPlannedSessions = activePlan.sessions.length;
      const completedSessions = activePlan.sessions.filter((s) => s.status === 'completed');
      const skippedSessions = activePlan.sessions.filter((s) => s.status === 'skipped');
      const totalPlannedKm = activePlan.sessions.reduce((acc, s) => acc + (s.totalDistanceKm || 0), 0);
      const totalExecutedKm = completedSessions.reduce((acc, s) => {
        const execKm = s.executions.reduce((eAcc, e) => eAcc + e.distanceKm, 0);
        return acc + (execKm > 0 ? execKm : (s.totalDistanceKm || 0));
      }, 0);

      const adherencePercentage = Math.round((completedSessions.length / totalPlannedSessions) * 100);

      planAdherenceSummary = {
        totalPlannedSessions,
        completedCount: completedSessions.length,
        skippedCount: skippedSessions.length,
        adherencePercentage,
        totalPlannedKm: Math.round(totalPlannedKm * 10) / 10,
        totalExecutedKm: Math.round(totalExecutedKm * 10) / 10,
        skippedSessions: skippedSessions.map((s) => ({
          title: s.title,
          sessionType: s.sessionType,
          scheduledDate: s.scheduledDate,
          notes: s.notes,
        })),
      };
    }

    const rawRecurring = athleteRecord?.recurringCrossTraining;
    const recurringCrossTraining = Array.isArray(rawRecurring)
      ? (rawRecurring as Array<{
          activityType: string;
          title: string;
          daysOfWeek: string[];
          durationMinutes: number;
        }>)
      : null;

    const { systemPrompt, userPrompt } = buildRunningCoachPrompts({
      runningProfile: {
        id: runningProfile.id,
        currentPace5kSec: runningProfile.currentPace5kSec,
        currentPace10kSec: runningProfile.currentPace10kSec,
        currentPaceHalfSec: runningProfile.currentPaceHalfSec,
        weeklyVolumeKm: runningProfile.weeklyVolumeKm,
        maxHeartRate: runningProfile.maxHeartRate,
        restingHeartRate: runningProfile.restingHeartRate,
        primaryObjective: runningProfile.primaryObjective,
        targetPaceSec: runningProfile.targetPaceSec,
        targetDistanceKm: runningProfile.targetDistanceKm,
        availableDays: athleteAvailableDays,
        weeklyRunsTarget: runningProfile.weeklyRunsTarget,
        injuryHistory: runningProfile.injuryHistory,
        primaryTerrain: runningProfile.primaryTerrain,
        hrZones: (runningProfile.hrZones as Record<string, { min: number; max: number; label: string }>) ?? null,
      },
      recentExecutions: recentExecutions.map((e) => ({
        date: e.date,
        distanceKm: e.distanceKm,
        durationSeconds: e.durationSeconds,
        avgPaceSec: e.avgPaceSec,
        avgHeartRate: e.avgHeartRate,
        sessionRpe: e.sessionRpe,
        notes: e.notes,
        source: e.source,
      })),
      previousBrainEntries,
      crossTrainingActivities: recentCrossTraining.map((ct) => ({
        date: ct.date,
        activityType: ct.activityType,
        durationMinutes: ct.durationMinutes,
        sessionRpe: ct.sessionRpe,
        muscleGroups: ct.muscleGroups,
        notes: ct.notes,
      })),
      recentStrengthWorkouts,
      planAdherenceSummary,
      recurringCrossTraining,
      wellnessNutritionDigest: wellnessNutritionDigest.daysLogged > 0 ? wellnessNutritionDigest : null,
      targetMonth,
      targetYear,
    });

    // 5. Execute OpenRouter Cascade with Ajv Schema + semantic validation
    const generationResult = await generateStructuredOutput<RunningPlanOutput>({
      schemaId: `running-plan-${RUNNING_PLAN_SCHEMA_VERSION}`,
      schema: runningPlanOutputSchema,
      systemPrompt,
      userPrompt,
      modelCascade,
      temperature: 0.2,
      maxRetries: 1,
      reasoningEffort: 'medium',
      maxTokens: 12000,
      perModelTimeoutsMs: [180_000, 65_000, 30_000],
      totalBudgetMs: 275_000,
      semanticValidator: (plan) => validateRunningPlanSemantics(plan, weeklyRunsTarget),
    });

    const output = generationResult.data;

    // 6. Log AI run
    let aiRunLogId: string | null = null;
    try {
      const aiRunLog = await prisma.aiRunLog.create({
        data: {
          runType: 'running_coach_monthly_plan',
          status: 'success',
          primaryModel: modelCascade[0] ?? RUNNING_COACH_DEFAULT_CASCADE[0],
          fallbackModel:
            generationResult.modelUsed !== modelCascade[0] ? generationResult.modelUsed : null,
          attemptCount: generationResult.attempts,
          latencyMs: generationResult.latencyMs,
          requestPayload: {
            targetMonth,
            targetYear,
          },
          responsePayload: output as unknown as Prisma.InputJsonValue,
        },
      });
      aiRunLogId = aiRunLog.id;
    } catch (logErr) {
      console.warn('[Running Generate] Não foi possível salvar aiRunLog:', logErr);
    }

    // 7. Atomically save to Prisma: RunningPlan, RunningSession[], RunningBrainEntry, and CalendarEvent[]
    const saved = await prisma.$transaction(async (tx) => {
      // Enforce deterministic targetMonth / targetYear derived from anchorMonday
      const effectiveMonth = targetMonth;
      const effectiveYear = targetYear;

      // Clean up previous draft or plan for this specific month/year if present
      const existingPlan = await tx.runningPlan.findUnique({
        where: {
          runningProfileId_month_year: {
            runningProfileId: 'singleton',
            month: effectiveMonth,
            year: effectiveYear,
          },
        },
        include: { sessions: true },
      });

      const today = todayStr;

      if (existingPlan) {
        // STRICT FORWARD-ONLY RULE:
        // Do NOT delete completed sessions, sessions with executions, or sessions in the past (< todayISO())!
        // Only delete FUTURE PLANNED sessions (scheduledDate >= today and status === 'planned')!
        const futurePlannedSessions = existingPlan.sessions.filter(
          (s) => s.status === 'planned' && s.scheduledDate >= today
        );
        const sessionIdsToDelete = futurePlannedSessions.map((s) => s.id);
        if (sessionIdsToDelete.length > 0) {
          await tx.calendarEvent.deleteMany({
            where: {
              referenceId: { in: sessionIdsToDelete },
              referenceModel: 'RunningSession',
              status: 'planned',
            },
          });
          await tx.runningSession.deleteMany({
            where: { id: { in: sessionIdsToDelete } },
          });
        }
      }

      // Mark any other active running plans as completed
      await tx.runningPlan.updateMany({
        where: {
          runningProfileId: 'singleton',
          status: 'active',
          NOT: {
            month: effectiveMonth,
            year: effectiveYear,
          },
        },
        data: { status: 'completed' },
      });

      // Upsert new active running plan
      const plan = await tx.runningPlan.upsert({
        where: {
          runningProfileId_month_year: {
            runningProfileId: 'singleton',
            month: effectiveMonth,
            year: effectiveYear,
          },
        },
        update: {
          title: output.plan.title,
          objective: output.plan.objective,
          phase: output.plan.phase,
          weeklyTargetKm: output.plan.weeklyTargetKm,
          status: 'active',
          rawPlan: output as unknown as Prisma.InputJsonValue,
          createdByAiRunId: aiRunLogId,
        },
        create: {
          runningProfileId: 'singleton',
          title: output.plan.title,
          month: effectiveMonth,
          year: effectiveYear,
          objective: output.plan.objective,
          phase: output.plan.phase,
          weeklyTargetKm: output.plan.weeklyTargetKm,
          status: 'active',
          rawPlan: output as unknown as Prisma.InputJsonValue,
          createdByAiRunId: aiRunLogId,
        },
      });

      // Create running sessions & planned calendar events
      const createdSessions = [];
      const usedDaysPerWeek = new Map<number, Set<string>>();
      for (let w = 1; w <= 4; w++) {
        usedDaysPerWeek.set(w, new Set<string>());
      }

      for (const session of output.plan.sessions) {
        const weekSet = usedDaysPerWeek.get(session.weekNumber) ?? new Set<string>();
        // For Week 1, restrict candidate days to anchor.week1AllowedDayNames so no sessions
        // are ever placed in the past and silently discarded.
        const allowedDaysForWeek =
          session.weekNumber === 1
            ? anchor.week1AllowedDayNames
            : athleteAvailableDays;

        const { scheduledDate, resolvedDay } = computeSessionSchedule(
          anchor.anchorMonday,
          session.weekNumber,
          session.dayOfWeek,
          allowedDaysForWeek,
          weekSet
        );
        weekSet.add(resolvedDay);
        usedDaysPerWeek.set(session.weekNumber, weekSet);

        // STRICT FORWARD-ONLY RULE:
        // Never schedule planned sessions or calendar events in the past (< today)
        if (scheduledDate < today) {
          continue;
        }

        const createdSession = await tx.runningSession.create({
          data: {
            runningPlanId: plan.id,
            scheduledDate,
            dayOfWeek: resolvedDay,
            weekNumber: session.weekNumber,
            sessionType: session.sessionType,
            title: session.title,
            totalDistanceKm: session.totalDistanceKm,
            totalDurationMin: session.totalDurationMin,
            targetPaceSec: session.targetPaceSec,
            targetHrZone: session.targetHrZone,
            segments: session.segments as unknown as Prisma.InputJsonValue,
            notes: session.notes,
            status: 'planned',
          },
        });
        createdSessions.push(createdSession);

        await tx.calendarEvent.create({
          data: {
            athleteProfileId: 'singleton',
            date: scheduledDate,
            eventType: 'running',
            referenceId: createdSession.id,
            referenceModel: 'RunningSession',
            title: session.title,
            status: 'planned',
            colorCode: '#10b981',
            sortOrder: 1,
          },
        });
      }

      // Upsert RunningBrainEntry
      await tx.runningBrainEntry.upsert({
        where: {
          runningProfileId_month_year: {
            runningProfileId: 'singleton',
            month: plan.month,
            year: plan.year,
          },
        },
        update: {
          aiRunLogId,
          hypotheses: output.coachBrain.hypotheses as unknown as Prisma.InputJsonValue,
          retrospective: output.coachBrain.retrospective as unknown as Prisma.InputJsonValue,
          decayWeight: 1.0,
        },
        create: {
          runningProfileId: 'singleton',
          aiRunLogId,
          month: plan.month,
          year: plan.year,
          hypotheses: output.coachBrain.hypotheses as unknown as Prisma.InputJsonValue,
          retrospective: output.coachBrain.retrospective as unknown as Prisma.InputJsonValue,
          decayWeight: 1.0,
        },
      });

      return { plan, sessions: createdSessions };
    });

    // 8. Harmonize multi-sport calendar by rebalancing strength workouts around running sessions
    try {
      await rebalanceWeekSchedule('singleton', anchor.anchorMonday);
    } catch (rebalanceError) {
      console.warn('[Running Generate] Falha ao rebalancear calendário multi-esportes:', rebalanceError);
    }

    return NextResponse.json({
      success: true,
      planId: saved.plan.id,
      sessionsCount: saved.sessions.length,
      startDate: anchor.effectiveStartDate,
      anchorMonday: anchor.anchorMonday,
      rolledToNextWeek: anchor.rolledToNextWeek,
      month: saved.plan.month,
      year: saved.plan.year,
      modelUsed: generationResult.modelUsed,
      attempts: generationResult.attempts,
      latencyMs: generationResult.latencyMs,
    });
  } catch (error) {
    console.error('[Running Generate] Erro ao gerar plano:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Falha ao gerar plano com IA de corrida.',
      },
      { status: 500 }
    );
  }
}
