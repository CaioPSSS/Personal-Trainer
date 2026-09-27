export const RUNNING_PLAN_SCHEMA_VERSION = '1.0.0';

export type RunningSessionType =
  | 'easy'
  | 'tempo'
  | 'intervals'
  | 'long_run'
  | 'fartlek'
  | 'hill_repeats'
  | 'progression'
  | 'race_pace'
  | 'recovery';

export type RunningSegmentType =
  | 'warmup'
  | 'cooldown'
  | 'steady'
  | 'interval'
  | 'recovery_jog'
  | 'tempo'
  | 'race_pace';

export type RunningPhase = 'base' | 'build' | 'peak' | 'taper' | 'recovery';

export type DayOfWeek =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export interface RunningSegment {
  type: RunningSegmentType;
  distanceKm?: number;
  distanceM?: number;
  durationMin?: number;
  paceRangeSec?: [number, number]; // [minPaceSec, maxPaceSec] per km
  reps?: number;
  restSec?: number;
  hrZone?: string;
  notes?: string;
}

export interface RunningSessionPrescription {
  weekNumber: number; // 1 to 4
  dayOfWeek: DayOfWeek;
  sessionType: RunningSessionType;
  title: string;
  totalDistanceKm: number;
  totalDurationMin: number;
  targetPaceSec: number | null;
  targetHrZone: string | null;
  segments: RunningSegment[];
  notes: string;
}

// Type alias for backwards compatibility and clarity
export type RunningPlanSession = RunningSessionPrescription;

export interface RunningCoachBrain {
  hypotheses: string[];
  rationale: string[];
  monthlyProgression: string;
  riskFactors: string[];
  retrospective: {
    whatWorked: string[];
    whatFailed: string[];
    paceEvolution: string;
    volumeAdherence: number; // 0.0 to 1.0
    correctionActions: string[];
  };
}

export interface RunningPlanOutput {
  plan: {
    title: string;
    month: number; // 1-12
    year: number;
    objective: string;
    phase: RunningPhase;
    weeklyTargetKm: number;
    sessions: RunningSessionPrescription[];
  };
  coachBrain: RunningCoachBrain;
}

export const runningPlanOutputSchema = {
  $id: 'https://personaltrainer.ai/schemas/running-plan-output.json',
  type: 'object',
  additionalProperties: false,
  required: ['plan', 'coachBrain'],
  properties: {
    plan: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'month', 'year', 'objective', 'phase', 'weeklyTargetKm', 'sessions'],
      properties: {
        title: { type: 'string', minLength: 3 },
        month: { type: 'integer', minimum: 1, maximum: 12 },
        year: { type: 'integer', minimum: 2024, maximum: 2035 },
        objective: { type: 'string', minLength: 3 },
        phase: {
          type: 'string',
          enum: ['base', 'build', 'peak', 'taper', 'recovery'],
        },
        weeklyTargetKm: { type: 'number', minimum: 5, maximum: 250 },
        sessions: {
          type: 'array',
          minItems: 4,
          maxItems: 28,
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'weekNumber',
              'dayOfWeek',
              'sessionType',
              'title',
              'totalDistanceKm',
              'totalDurationMin',
              'targetPaceSec',
              'targetHrZone',
              'segments',
              'notes',
            ],
            properties: {
              weekNumber: { type: 'integer', minimum: 1, maximum: 4 },
              dayOfWeek: {
                type: 'string',
                enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
              },
              sessionType: {
                type: 'string',
                enum: [
                  'easy',
                  'tempo',
                  'intervals',
                  'long_run',
                  'fartlek',
                  'hill_repeats',
                  'progression',
                  'race_pace',
                  'recovery',
                ],
              },
              title: { type: 'string', minLength: 2 },
              totalDistanceKm: { type: 'number', minimum: 0.5, maximum: 60 },
              totalDurationMin: { type: 'integer', minimum: 10, maximum: 360 },
              targetPaceSec: {
                oneOf: [
                  { type: 'integer', minimum: 120, maximum: 900 },
                  { type: 'null' },
                ],
              },
              targetHrZone: {
                oneOf: [
                  { type: 'string', minLength: 2 },
                  { type: 'null' },
                ],
              },
              segments: {
                type: 'array',
                minItems: 1,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['type'],
                  properties: {
                    type: {
                      type: 'string',
                      enum: ['warmup', 'cooldown', 'steady', 'interval', 'recovery_jog', 'tempo', 'race_pace'],
                    },
                    distanceKm: { type: 'number', minimum: 0.05, maximum: 50 },
                    distanceM: { type: 'integer', minimum: 50, maximum: 50000 },
                    durationMin: { type: 'number', minimum: 0.5, maximum: 180 },
                    paceRangeSec: {
                      type: 'array',
                      minItems: 2,
                      maxItems: 2,
                      items: { type: 'integer', minimum: 120, maximum: 900 },
                    },
                    reps: { type: 'integer', minimum: 1, maximum: 50 },
                    restSec: { type: 'integer', minimum: 10, maximum: 600 },
                    hrZone: { type: 'string', minLength: 2 },
                    notes: { type: 'string' },
                  },
                },
              },
              notes: { type: 'string' },
            },
          },
        },
      },
    },
    coachBrain: {
      type: 'object',
      additionalProperties: false,
      required: ['hypotheses', 'rationale', 'monthlyProgression', 'riskFactors', 'retrospective'],
      properties: {
        hypotheses: {
          type: 'array',
          minItems: 1,
          items: { type: 'string', minLength: 3 },
        },
        rationale: {
          type: 'array',
          minItems: 1,
          items: { type: 'string', minLength: 3 },
        },
        monthlyProgression: { type: 'string', minLength: 3 },
        riskFactors: {
          type: 'array',
          items: { type: 'string' },
        },
        retrospective: {
          type: 'object',
          additionalProperties: false,
          required: ['whatWorked', 'whatFailed', 'paceEvolution', 'volumeAdherence', 'correctionActions'],
          properties: {
            whatWorked: {
              type: 'array',
              items: { type: 'string' },
            },
            whatFailed: {
              type: 'array',
              items: { type: 'string' },
            },
            paceEvolution: { type: 'string' },
            volumeAdherence: { type: 'number', minimum: 0, maximum: 1 },
            correctionActions: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
      },
    },
  },
};
