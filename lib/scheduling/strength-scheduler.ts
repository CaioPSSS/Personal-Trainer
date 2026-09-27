import type { PrismaClient } from '@prisma/client';

// Lazy loader for PrismaClient to allow importing pure scheduler helpers in unit tests without Next.js path alias issues
let prismaInstance: PrismaClient | null = null;
async function getPrisma(): Promise<PrismaClient> {
  if (!prismaInstance) {
    const mod = await import('@/lib/prisma');
    prismaInstance = mod.prisma;
  }
  return prismaInstance;
}

/**
 * Returns Monday (start of week) at 00:00:00 UTC for a given date.
 */
export function getMondayOfDate(d: Date): Date {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay(); // 0 is Sunday, 1 is Monday...
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}
export const getMondayOfWeek = getMondayOfDate;

/**
 * Formats a Date object as YYYY-MM-DD.
 */
export function formatISODate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
export const formatDateISO = formatISODate;

/**
 * Distributes training days throughout the calendar week (Monday=0 to Sunday=6)
 * balancing recovery periods and honoring split logic.
 *
 * Examples:
 * - 4-day split (Upper/Lower): Day 1 Upper (Mon), Day 2 Lower (Tue), Day 3 Rest (Wed),
 *   Day 4 Upper (Thu), Day 5 Lower (Fri), Days 6-7 Rest (Sat, Sun) -> offsets: [0, 1, 3, 4]
 * - 3-day split: Mon, Wed, Fri -> offsets: [0, 2, 4]
 * - 5-day split: Mon, Tue, Wed, Fri, Sat -> offsets: [0, 1, 2, 4, 5]
 * - 6-day split: Mon-Sat -> offsets: [0, 1, 2, 3, 4, 5]
 */
export function getSplitDayOffsets(daysCount: number): number[] {
  switch (daysCount) {
    case 1:
      return [2]; // Wednesday
    case 2:
      return [1, 3]; // Tuesday, Thursday
    case 3:
      return [0, 2, 4]; // Monday, Wednesday, Friday
    case 4:
      return [0, 1, 3, 4]; // Monday, Tuesday, Thursday, Friday (Upper/Lower)
    case 5:
      return [0, 1, 2, 4, 5]; // Mon, Tue, Wed, Fri, Sat
    case 6:
      return [0, 1, 2, 3, 4, 5]; // Mon to Sat
    case 7:
    default:
      return Array.from({ length: Math.min(daysCount, 7) }, (_, i) => i);
  }
}
export const getDayOffsetsForSplit = getSplitDayOffsets;

/**
 * Deterministically schedules workout days across the active mesocycle into CalendarEvent records.
 *
 * @param athleteProfileId - ID of the athlete profile (e.g. 'singleton')
 * @param startDate - Optional start date. Defaults to mesocycle startDate or current week Monday.
 */
export async function scheduleMesocycleWorkouts(
  athleteProfileId: string,
  startDate?: Date
): Promise<void> {
  const prisma = await getPrisma();
  const activePlan = await prisma.mesocyclePlan.findFirst({
    where: {
      athleteProfileId,
      status: 'active',
    },
    include: {
      workoutDays: {
        orderBy: { dayOrder: 'asc' },
      },
      weeks: {
        orderBy: { weekNumber: 'asc' },
      },
    },
  });

  if (!activePlan || activePlan.workoutDays.length === 0) {
    return;
  }

  // Ensure athlete profile exists
  let athlete = await prisma.athleteProfile.findUnique({
    where: { id: athleteProfileId },
  });
  if (!athlete) {
    athlete = await prisma.athleteProfile.create({
      data: { id: athleteProfileId },
    });
  }

  // Determine base Monday for scheduling
  let baseDate = startDate;
  if (!baseDate && activePlan.startDate) {
    const parts = activePlan.startDate.split('-').map(Number);
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      baseDate = new Date(parts[0], parts[1] - 1, parts[2]);
    }
  }
  if (!baseDate) {
    baseDate = new Date();
  }

  const baseMonday = getMondayOfDate(baseDate);
  const dayTemplates = activePlan.workoutDays;
  const numWeeks = activePlan.durationWeeks || (activePlan.weeks.length > 0 ? activePlan.weeks.length : 4);
  const dayOffsets = getSplitDayOffsets(dayTemplates.length);

  for (let weekIndex = 0; weekIndex < numWeeks; weekIndex++) {
    const weekStart = new Date(baseMonday);
    weekStart.setDate(baseMonday.getDate() + weekIndex * 7);

    for (let tIdx = 0; tIdx < dayTemplates.length; tIdx++) {
      const template = dayTemplates[tIdx];
      const offset = dayOffsets[tIdx] ?? (tIdx % 7);
      const workoutDate = new Date(weekStart);
      workoutDate.setDate(weekStart.getDate() + offset);
      const dateStr = formatISODate(workoutDate);

      // Check if any strength event already exists for this date and template/title
      const existing = await prisma.calendarEvent.findFirst({
        where: {
          athleteProfileId,
          date: dateStr,
          eventType: 'strength',
          OR: [
            { referenceId: template.id },
            { title: template.label },
            { referenceModel: 'WorkoutExecution' },
          ],
        },
      });

      if (!existing) {
        await prisma.calendarEvent.create({
          data: {
            athleteProfileId,
            date: dateStr,
            eventType: 'strength',
            referenceModel: 'WorkoutDayTemplate',
            referenceId: template.id,
            title: template.label,
            status: 'planned',
            sortOrder: tIdx,
          },
        });
      }
    }
  }

  // Ensure no duplicates exist after scheduling
  await cleanupDuplicateStrengthEvents(athleteProfileId);
}

/**
 * Removes duplicate planned strength events on the same date with the same title,
 * keeping only the earliest created event for each date/title combination.
 */
export async function cleanupDuplicateStrengthEvents(athleteProfileId: string): Promise<number> {
  const prisma = await getPrisma();
  const plannedEvents = await prisma.calendarEvent.findMany({
    where: {
      athleteProfileId,
      eventType: 'strength',
      status: 'planned',
    },
    orderBy: { createdAt: 'asc' },
  });

  const seen = new Set<string>();
  const duplicateIds: string[] = [];

  for (const ev of plannedEvents) {
    const key = `${ev.date}::${ev.title.trim().toLowerCase()}`;
    if (seen.has(key)) {
      duplicateIds.push(ev.id);
    } else {
      seen.add(key);
    }
  }

  if (duplicateIds.length > 0) {
    await prisma.calendarEvent.deleteMany({
      where: { id: { in: duplicateIds } },
    });
    console.log(`[Scheduler] Removidos ${duplicateIds.length} eventos de força duplicados.`);
  }

  return duplicateIds.length;
}

/**
 * Ensures planned strength workout events exist in CalendarEvent for the current active mesocycle.
 * Cleans up any duplicate events, and if none exist for the athlete, triggers scheduleMesocycleWorkouts.
 *
 * @param athleteProfileId - ID of the athlete profile (e.g. 'singleton')
 */
export async function syncPlannedCalendarEvents(athleteProfileId: string): Promise<void> {
  const prisma = await getPrisma();

  // 1. Purge any duplicate planned strength events
  await cleanupDuplicateStrengthEvents(athleteProfileId);

  const activePlan = await prisma.mesocyclePlan.findFirst({
    where: {
      athleteProfileId,
      status: 'active',
    },
    include: {
      workoutDays: true,
      weeks: true,
    },
  });

  if (!activePlan || activePlan.workoutDays.length === 0) {
    return;
  }

  // Count all strength events (both planned templates and completed executions)
  const existingEventsCount = await prisma.calendarEvent.count({
    where: {
      athleteProfileId,
      eventType: 'strength',
      referenceModel: { in: ['WorkoutDayTemplate', 'WorkoutExecution'] },
    },
  });

  if (existingEventsCount === 0) {
    await scheduleMesocycleWorkouts(athleteProfileId);
  }
}

