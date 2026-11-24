import { shiftISODate, isISODate, dayOfWeekMon0 } from '@/lib/dates';

export type ResolvedSkipStrategy = 'skip_only' | 'skip_and_reschedule';

export interface CalendarSkipEventInput {
  id: string;
  date: string;
  eventType: string;
  title: string;
  status: string;
  skipStrategy?: string | null;
  originalDate?: string | null;
  referenceId?: string | null;
  referenceModel?: string | null;
}

export interface OccupiedScheduleEntry {
  id?: string;
  date: string;
  eventType: string;
  title: string;
  status: string;
  runningSessionType?: string | null;
  crossMuscleGroups?: unknown;
  crossSessionRpe?: number | null;
}

export interface ReschedulePlanItem {
  id: string;
  fromDate: string;
  toDate: string;
  originalDateToSave: string;
  avoidedCollision: boolean;
}

/**
 * Extrai uma data ISO válida de `originalDate`, ignorando prefixos legados de sentinela.
 */
export function extractPreservedISODate(originalDate?: string | null): string | null {
  if (!originalDate) return null;
  const candidateValue: unknown = originalDate;
  if (isISODate(candidateValue)) return originalDate;
  if (originalDate.includes('::')) {
    const parts = originalDate.split('::');
    const candidate: unknown = parts[1];
    return typeof candidate === 'string' && isISODate(candidate) ? candidate : null;
  }
  return null;
}

/**
 * Resolve a estratégia de skip priorizando a coluna tipada `skipStrategy`
 * com fallback para o formato legado em `originalDate`.
 */
export function resolveEventSkipStrategy(event: {
  skipStrategy?: string | null;
  originalDate?: string | null;
}): ResolvedSkipStrategy | null {
  if (event.skipStrategy === 'skip_and_reschedule' || event.skipStrategy === 'skip_only') {
    return event.skipStrategy;
  }
  if (
    event.originalDate === 'skip_and_reschedule' ||
    event.originalDate?.startsWith('skip_and_reschedule::')
  ) {
    return 'skip_and_reschedule';
  }
  if (event.originalDate === 'skip_only' || event.originalDate?.startsWith('skip_only::')) {
    return 'skip_only';
  }
  return null;
}

function isHighImpactRun(entry: OccupiedScheduleEntry): boolean {
  if (entry.eventType !== 'running') return false;
  if (
    entry.runningSessionType &&
    ['long_run', 'intervals', 'tempo', 'race_pace'].includes(entry.runningSessionType)
  ) {
    return true;
  }
  return /(long|longao|longão|tiro|interval|tempo|limiar|velocidade|prova)/i.test(entry.title);
}

function isHeavyLegCrossTraining(entry: OccupiedScheduleEntry): boolean {
  if (!['crossfit', 'cross_training', 'martial_arts', 'cycling'].includes(entry.eventType)) {
    return false;
  }
  const groups = Array.isArray(entry.crossMuscleGroups)
    ? entry.crossMuscleGroups.map((g) => String(g).toLowerCase())
    : [];
  const hasLower =
    groups.some((g) => /(perna|leg|quad|posterior|glute|full body)/i.test(g)) ||
    /(leg|perna|squat|agachamento|lunge|thruster|box jump)/i.test(entry.title);
  const highRpe = typeof entry.crossSessionRpe === 'number' && entry.crossSessionRpe >= 8;
  return hasLower || highRpe;
}

/**
 * Planeja o reagendamento dos treinos subsequentes ao pular uma sessão de força,
 * evitando colisões com outros treinos de força, corridas de alto impacto e CrossFit pesado,
 * e respeitando os dias disponíveis do atleta quando configurados.
 */
export function planCollisionAwareReschedule(params: {
  skippedEvent: CalendarSkipEventInput;
  subsequentStrengthEvents: CalendarSkipEventInput[];
  occupiedEvents: OccupiedScheduleEntry[];
  availableDayIndices?: number[] | null;
  endOfWeek: string;
}): ReschedulePlanItem[] {
  const {
    skippedEvent,
    subsequentStrengthEvents,
    occupiedEvents,
    availableDayIndices,
    endOfWeek,
  } = params;

  const sortedItems = [...subsequentStrengthEvents].sort((a, b) => a.date.localeCompare(b.date));
  const usedStrengthDates = new Set<string>(
    occupiedEvents
      .filter(
        (ev) =>
          ev.eventType === 'strength' &&
          ev.status !== 'skipped' &&
          ev.id !== skippedEvent.id &&
          !sortedItems.some((s) => s.id === ev.id)
      )
      .map((ev) => ev.date)
  );

  const highImpactDates = new Set<string>();
  for (const ev of occupiedEvents) {
    if (ev.status === 'skipped') continue;
    if (isHighImpactRun(ev) || isHeavyLegCrossTraining(ev)) {
      highImpactDates.add(ev.date);
    }
  }

  const availSet =
    availableDayIndices && availableDayIndices.length > 0 ? new Set(availableDayIndices) : null;

  const overflowLimit = shiftISODate(endOfWeek, 2);
  let minAllowedDate = shiftISODate(skippedEvent.date, 1);

  const plans: ReschedulePlanItem[] = [];

  for (const item of sortedItems) {
    const earliestCandidate = shiftISODate(item.date, 1);
    const startSearch =
      earliestCandidate > minAllowedDate ? earliestCandidate : minAllowedDate;

    const searchRange = (limitDate: string, requireAvailable: boolean, avoidImpact: boolean) => {
      let cursor = startSearch;
      let guard = 0;
      while (cursor <= limitDate && guard < 14) {
        const dayIdx = dayOfWeekMon0(cursor);
        const matchesAvailability = !requireAvailable || !availSet || availSet.has(dayIdx);
        const hasStrengthCollision = usedStrengthDates.has(cursor);
        const hasImpactCollision = avoidImpact && highImpactDates.has(cursor);

        if (matchesAvailability && !hasStrengthCollision && !hasImpactCollision) {
          return cursor;
        }
        cursor = shiftISODate(cursor, 1);
        guard++;
      }
      return null;
    };

    // Cascata de prioridade:
    // 1. Mesmo ciclo semanal + dia disponível + zero colisão (força ou impacto)
    // 2. Até +2 dias da semana + dia disponível + sem choque de força/impacto
    // 3. Mesmo ciclo / +2 dias sem choque de força (ignora disponibilidade estrita se necessário)
    // 4. Fallback +1 dia preservando ordem cronológica
    const pass1 = searchRange(endOfWeek, true, true);
    const pass2 = pass1 ?? searchRange(overflowLimit, true, true);
    const pass3 = pass2 ?? searchRange(overflowLimit, false, true);
    const pass4 = pass3 ?? searchRange(overflowLimit, false, false);
    const chosenDate = pass4 ?? startSearch;

    usedStrengthDates.add(chosenDate);
    minAllowedDate = shiftISODate(chosenDate, 1);

    const preservedOriginal = extractPreservedISODate(item.originalDate);
    plans.push({
      id: item.id,
      fromDate: item.date,
      toDate: chosenDate,
      originalDateToSave: preservedOriginal ?? item.date,
      avoidedCollision: highImpactDates.has(earliestCandidate) && chosenDate !== earliestCandidate,
    });
  }

  return plans;
}

export interface UnskipRestoreItem {
  id: string;
  fromDate: string;
  toDate: string;
  originalDateToSave: string | null;
}

export interface UnskipPlanResult {
  wasRescheduled: boolean;
  shouldRevertSchedule: boolean;
  strategyUsed: 'restore_schedule' | 'unskip_only';
  restoredOriginalDate: string | null;
  eventsToRestore: UnskipRestoreItem[];
}

/**
 * Planeja a restauração de um evento despulado e dos treinos eventualmente adiados.
 */
export function planUnskipRestoration(params: {
  event: CalendarSkipEventInput;
  subsequentPlannedStrengthEvents: CalendarSkipEventInput[];
  strategy?: 'auto' | 'restore_schedule' | 'unskip_only';
}): UnskipPlanResult {
  const { event, subsequentPlannedStrengthEvents, strategy = 'auto' } = params;

  const resolvedSkipStrategy = resolveEventSkipStrategy(event);
  const wasRescheduled = resolvedSkipStrategy === 'skip_and_reschedule';
  const shouldRevertSchedule =
    strategy === 'restore_schedule' || (strategy === 'auto' && wasRescheduled);

  const eventsToRestore: UnskipRestoreItem[] = [];

  if (shouldRevertSchedule && event.eventType === 'strength') {
    for (const item of subsequentPlannedStrengthEvents) {
      const preserved = extractPreservedISODate(item.originalDate);
      if (preserved) {
        eventsToRestore.push({
          id: item.id,
          fromDate: item.date,
          toDate: preserved,
          originalDateToSave: null,
        });
      } else if (wasRescheduled) {
        eventsToRestore.push({
          id: item.id,
          fromDate: item.date,
          toDate: shiftISODate(item.date, -1),
          originalDateToSave: null,
        });
      }
    }
  }

  return {
    wasRescheduled,
    shouldRevertSchedule,
    strategyUsed: shouldRevertSchedule ? 'restore_schedule' : 'unskip_only',
    restoredOriginalDate: extractPreservedISODate(event.originalDate),
    eventsToRestore,
  };
}
