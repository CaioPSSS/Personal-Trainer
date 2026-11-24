import { prisma } from '@/lib/prisma';
import { dayOfWeekName, shiftISODate, todayISO } from '@/lib/dates';
import {
  harmonizeRunningCalendarEvents,
  isLikelySameRun,
  restoreSessionIfOrphan,
} from '@/lib/strava/client';

export interface RunningRepairReport {
  sessionsRealigned: number;
  duplicatesMerged: number;
  linksFixed: number;
  sessionsRestored: number;
  cardsHarmonized: number;
  orphanCardsRemoved: number;
  /** Dates whose activity totals changed (must be re-sent to the Metabolic Tracker). */
  affectedDates: string[];
}

/**
 * Idempotent self-healing pass over running data. Fixes the side effects of the previous
 * Strava sync logic (duplicates, stolen ±1-day session links, orphan cards) and migrates
 * calendar reschedules into RunningSession.scheduledDate.
 *
 * @param lookbackDays - how far back to inspect (default 120 days)
 */
export async function repairRunningRecords(lookbackDays = 120): Promise<RunningRepairReport> {
  const since = shiftISODate(todayISO(), -lookbackDays);
  const affected = new Set<string>();
  const report: RunningRepairReport = {
    sessionsRealigned: 0,
    duplicatesMerged: 0,
    linksFixed: 0,
    sessionsRestored: 0,
    cardsHarmonized: 0,
    orphanCardsRemoved: 0,
    affectedDates: [],
  };

  // 1. Calendar is the source of truth for WHEN a planned session happens (drag-and-drop)
  const plannedSessionCards = await prisma.calendarEvent.findMany({
    where: {
      athleteProfileId: 'singleton',
      eventType: 'running',
      referenceModel: 'RunningSession',
      status: 'planned',
    },
    select: { id: true, referenceId: true, date: true },
  });
  const plannedSessionIds = plannedSessionCards
    .map((c) => c.referenceId)
    .filter((id): id is string => Boolean(id));
  const plannedSessions = plannedSessionIds.length
    ? await prisma.runningSession.findMany({ where: { id: { in: plannedSessionIds } } })
    : [];
  const sessionById = new Map(plannedSessions.map((s) => [s.id, s]));

  for (const card of plannedSessionCards) {
    const session = card.referenceId ? sessionById.get(card.referenceId) : undefined;
    if (!session) {
      // Planned card pointing to a deleted session
      await prisma.calendarEvent.delete({ where: { id: card.id } });
      report.orphanCardsRemoved++;
      continue;
    }
    if (session.status === 'planned' && session.scheduledDate !== card.date) {
      await prisma.runningSession.update({
        where: { id: session.id },
        data: { scheduledDate: card.date, dayOfWeek: dayOfWeekName(card.date) },
      });
      report.sessionsRealigned++;
    }
  }

  // 2. Merge manual runs that duplicate a Strava run (same day, similar distance)
  const recentRuns = await prisma.runningExecution.findMany({
    where: { runningProfileId: 'singleton', date: { gte: since } },
    orderBy: { createdAt: 'asc' },
  });
  const stravaRuns = recentRuns.filter((r) => r.stravaActivityId);
  const manualRuns = recentRuns.filter((r) => !r.stravaActivityId);
  const deletedIds = new Set<string>();

  for (const strava of stravaRuns) {
    for (const manual of manualRuns) {
      if (deletedIds.has(manual.id)) continue;
      if (!isLikelySameRun(strava, manual)) continue;

      await prisma.$transaction(async (tx) => {
        await tx.runningExecution.update({
          where: { id: strava.id },
          data: {
            runningSessionId: strava.runningSessionId ?? manual.runningSessionId,
            sessionRpe: strava.sessionRpe ?? manual.sessionRpe,
            notes: manual.notes ?? strava.notes,
          },
        });
        await tx.calendarEvent.deleteMany({
          where: { athleteProfileId: 'singleton', referenceId: manual.id },
        });
        await tx.runningExecution.delete({ where: { id: manual.id } });
      });
      strava.runningSessionId = strava.runningSessionId ?? manual.runningSessionId;
      deletedIds.add(manual.id);
      affected.add(manual.date);
      report.duplicatesMerged++;
    }
  }

  // 3. Sessions flagged "completed" without any execution (left behind by stolen links)
  const completedSessions = await prisma.runningSession.findMany({
    where: { status: 'completed', scheduledDate: { gte: since } },
    select: { id: true, _count: { select: { executions: true } } },
  });
  for (const s of completedSessions) {
    if (s._count.executions === 0 && (await restoreSessionIfOrphan(s.id))) {
      report.sessionsRestored++;
    }
  }

  // 5. Exactly one completed calendar card per run (batch-fetched calendar events, eliminating N+1)
  const [finalRuns, recentRunningEvents] = await Promise.all([
    prisma.runningExecution.findMany({
      where: { runningProfileId: 'singleton', date: { gte: since } },
    }),
    prisma.calendarEvent.findMany({
      where: {
        athleteProfileId: 'singleton',
        eventType: 'running',
        date: { gte: since },
      },
    }),
  ]);
  const finalRunIds = new Set(finalRuns.map((r) => r.id));

  const cardsByRefId = new Map<string, typeof recentRunningEvents>();
  for (const ev of recentRunningEvents) {
    if (!ev.referenceId) continue;
    const list = cardsByRefId.get(ev.referenceId) ?? [];
    list.push(ev);
    cardsByRefId.set(ev.referenceId, list);
  }

  for (const run of finalRuns) {
    const runCards = (cardsByRefId.get(run.id) ?? []).filter(
      (ev) => ev.referenceModel === 'RunningExecution' || ev.referenceId === run.id
    );
    const sessionCards = run.runningSessionId
      ? (cardsByRefId.get(run.runningSessionId) ?? []).filter(
          (ev) => ev.referenceModel === 'RunningSession'
        )
      : [];

    const consistent =
      runCards.length === 1 &&
      sessionCards.length === 0 &&
      runCards[0].date === run.date &&
      runCards[0].status === 'completed' &&
      runCards[0].caloriesBurned === run.caloriesBurned;
    if (consistent) continue;

    for (const c of runCards) if (c.date !== run.date) affected.add(c.date);
    await harmonizeRunningCalendarEvents({
      executionId: run.id,
      sessionId: run.runningSessionId,
      date: run.date,
      caloriesBurned: run.caloriesBurned,
    });
    report.cardsHarmonized++;
    affected.add(run.date);
  }

  // 6. Completed running cards pointing to runs that no longer exist (batched check)
  const runCardsInWindow = recentRunningEvents.filter(
    (c) => c.referenceModel === 'RunningExecution'
  );
  const candidateMissingRunIds = Array.from(
    new Set(
      runCardsInWindow
        .map((c) => c.referenceId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0 && !finalRunIds.has(id))
    )
  );
  const stillExistingOutsideWindow =
    candidateMissingRunIds.length > 0
      ? await prisma.runningExecution.findMany({
          where: { id: { in: candidateMissingRunIds } },
          select: { id: true },
        })
      : [];
  const existingRunIdSet = new Set([
    ...Array.from(finalRunIds),
    ...stillExistingOutsideWindow.map((r) => r.id),
  ]);

  const danglingIds: string[] = [];
  for (const card of runCardsInWindow) {
    if (!card.referenceId || !existingRunIdSet.has(card.referenceId)) {
      danglingIds.push(card.id);
      affected.add(card.date);
    }
  }
  if (danglingIds.length > 0) {
    await prisma.calendarEvent.deleteMany({ where: { id: { in: danglingIds } } });
    report.orphanCardsRemoved += danglingIds.length;
  }

  report.affectedDates = Array.from(affected).sort();
  return report;
}
