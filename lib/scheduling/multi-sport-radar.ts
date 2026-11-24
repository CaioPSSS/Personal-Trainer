import { diffISODays } from '@/lib/dates';

export interface RadarConflictItem {
  severity: 'high' | 'moderate';
  date: string;
  description: string;
}

export interface MultiSportRadarResult {
  status: 'synergy' | 'warning' | 'conflict';
  headline: string;
  summary: string;
  conflicts: RadarConflictItem[];
}

export interface RadarEventInput {
  date: string;
  eventType: string;
  title: string;
  status: string;
  referenceId?: string | null;
  referenceModel?: string | null;
}

export interface RadarTemplateInput {
  id: string;
  label: string;
  prescriptions?: Array<{
    movementPattern?: string | null;
    exerciseName?: string | null;
  }>;
}

export interface RadarRunningSessionInput {
  id: string;
  scheduledDate: string;
  sessionType: string;
  title: string;
  status?: string;
}

export interface RadarCrossActivityInput {
  id: string;
  date: string;
  activityType: string;
  title?: string | null;
  muscleGroups?: unknown;
  sessionRpe?: number | null;
  status?: string;
}

const LOWER_BODY_TITLE_OR_EXERCISE_RE =
  /(leg|perna|inferior|lower|quad|gl[uú]teo|coxa|panturrilha|squat|agachamento|stiff|terra|afundo|extensora|flexora|pelvica|pélvica)/i;

const LOWER_BODY_PATTERNS = new Set([
  'squat',
  'hinge',
  'lunge',
  'knee_extension',
  'knee_flexion',
  'quad_isolation',
  'hamstring_isolation',
  'calf',
  'calf_raise',
  'hip_thrust',
  'glute',
  'glute_isolation',
  'adductor',
  'abductor',
]);

function checkLowerBodyWorkout(
  title: string,
  prescriptions?: Array<{ movementPattern?: string | null; exerciseName?: string | null }>
): boolean {
  if (LOWER_BODY_TITLE_OR_EXERCISE_RE.test(title)) {
    return true;
  }
  if (!prescriptions || prescriptions.length === 0) {
    return false;
  }
  return prescriptions.some((p) => {
    const mp = (p.movementPattern || '').toLowerCase();
    const ex = (p.exerciseName || '').toLowerCase();
    return LOWER_BODY_PATTERNS.has(mp) || LOWER_BODY_TITLE_OR_EXERCISE_RE.test(ex);
  });
}

function isHighImpactRunningSession(sessionType: string | null | undefined, title: string): boolean {
  if (
    sessionType &&
    ['long_run', 'intervals', 'tempo', 'race_pace', 'hill_repeats'].includes(sessionType)
  ) {
    return true;
  }
  return /(long|longao|longão|tiro|interval|tempo|limiar|subida|prova)/i.test(title);
}

function formatBRDate(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}`;
}

/**
 * Avalia dinamicamente a interferência neuromuscular e metabólica real da semana entre
 * força de membros inferiores, corridas de alto impacto e sessões de cross-training.
 */
export function analyzeMultiSportRadar(params: {
  weekEvents: RadarEventInput[];
  templatesWithPrescriptions?: RadarTemplateInput[];
  runningSessions?: RadarRunningSessionInput[];
  crossTrainingActivities?: RadarCrossActivityInput[];
}): MultiSportRadarResult {
  const {
    weekEvents,
    templatesWithPrescriptions = [],
    runningSessions = [],
    crossTrainingActivities = [],
  } = params;

  const templateMap = new Map(templatesWithPrescriptions.map((t) => [t.id, t]));
  const runSessionMap = new Map(runningSessions.map((s) => [s.id, s]));
  const crossMap = new Map(crossTrainingActivities.map((c) => [c.id, c]));

  const activeEvents = weekEvents.filter((ev) => ev.status !== 'skipped');

  const lowerStrengthDates: Array<{ date: string; title: string }> = [];
  const highImpactRunDates: Array<{ date: string; title: string }> = [];
  const legCrossDates: Array<{ date: string; title: string }> = [];

  for (const ev of activeEvents) {
    if (ev.eventType === 'strength') {
      const tpl =
        ev.referenceModel === 'WorkoutDayTemplate' && ev.referenceId
          ? templateMap.get(ev.referenceId)
          : templatesWithPrescriptions.find(
              (t) => ev.title.toLowerCase().includes(t.label.toLowerCase())
            );
      if (checkLowerBodyWorkout(tpl?.label || ev.title, tpl?.prescriptions)) {
        lowerStrengthDates.push({ date: ev.date, title: ev.title });
      }
    } else if (ev.eventType === 'running') {
      const rs = ev.referenceId ? runSessionMap.get(ev.referenceId) : undefined;
      if (isHighImpactRunningSession(rs?.sessionType, rs?.title || ev.title)) {
        highImpactRunDates.push({ date: ev.date, title: ev.title });
      }
    } else if (
      ev.eventType === 'crossfit' ||
      ev.eventType === 'cross_training' ||
      ev.eventType === 'cycling'
    ) {
      const ct = ev.referenceId ? crossMap.get(ev.referenceId) : undefined;
      const groups = Array.isArray(ct?.muscleGroups)
        ? ct.muscleGroups.map((g) => String(g).toLowerCase())
        : [];
      const hasLegCross =
        groups.some((g) => /(perna|leg|quad|posterior|glute|full body)/i.test(g)) ||
        (typeof ct?.sessionRpe === 'number' && ct.sessionRpe >= 8) ||
        /(crossfit|wod|leg|perna)/i.test(ev.title);
      if (hasLegCross) {
        legCrossDates.push({ date: ev.date, title: ev.title });
      }
    }
  }

  const conflicts: RadarConflictItem[] = [];
  const seenKey = new Set<string>();

  for (const str of lowerStrengthDates) {
    for (const run of highImpactRunDates) {
      const diff = diffISODays(str.date, run.date);
      if (diff === 0) {
        const key = `same-run::${str.date}::${run.title}`;
        if (!seenKey.has(key)) {
          seenKey.add(key);
          conflicts.push({
            severity: 'high',
            date: str.date,
            description: `Conflito no mesmo dia (${formatBRDate(str.date)}): ${str.title} + ${run.title}.`,
          });
        }
      } else if (diff === 1) {
        const key = `adj-run::${str.date}::${run.date}`;
        if (!seenKey.has(key)) {
          seenKey.add(key);
          conflicts.push({
            severity: 'high',
            date: str.date,
            description: `Janela < 24h entre pernas (${formatBRDate(str.date)}: ${str.title}) e corrida intensa (${formatBRDate(run.date)}: ${run.title}).`,
          });
        }
      }
    }

    for (const cross of legCrossDates) {
      if (str.date === cross.date) {
        const key = `same-cross::${str.date}::${cross.title}`;
        if (!seenKey.has(key)) {
          seenKey.add(key);
          conflicts.push({
            severity: 'moderate',
            date: str.date,
            description: `Sobrecarga no mesmo dia (${formatBRDate(str.date)}): ${str.title} com ${cross.title}.`,
          });
        }
      }
    }
  }

  const hasHigh = conflicts.some((c) => c.severity === 'high');
  if (hasHigh) {
    return {
      status: 'conflict',
      headline: `${conflicts.length} conflito(s) de interferência detectado(s) na semana`,
      summary: conflicts[0].description,
      conflicts,
    };
  }

  if (conflicts.length > 0) {
    return {
      status: 'warning',
      headline: `${conflicts.length} alerta(s) moderado(s) de sobrecarga acumulada`,
      summary: conflicts[0].description,
      conflicts,
    };
  }

  if (activeEvents.length === 0) {
    return {
      status: 'synergy',
      headline: 'Agenda semanal livre de colisões',
      summary: 'Nenhum treino ativo ou conflito registrado nesta semana.',
      conflicts: [],
    };
  }

  return {
    status: 'synergy',
    headline: 'Sinergia ativa na semana',
    summary:
      'Sem colisões detectadas: sessões de membros inferiores e corridas intensas respeitam janela regenerativa adequada.',
    conflicts: [],
  };
}
