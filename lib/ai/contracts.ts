export const MASTER_PLAN_SCHEMA_VERSION = '1.0.0';
export const ASSISTANT_OUTPUT_SCHEMA_VERSION = '1.0.0';
export const DATA_ANALYST_REPORT_SCHEMA_VERSION = '1.0.0';

interface PerformanceDelta {
  exerciseName: string;
  movementPattern: string;
  observedProgression: 'improved' | 'stagnant' | 'regressed' | 'insufficient_data';
  loadTrendKgPerWeek: number | null;
  repTrendPerWeek: number | null;
  rpeAccuracyRate: number | null;
  fatigueImpact: 'low' | 'moderate' | 'high' | 'unknown';
  notes: string;
}

export interface DataAnalystReport {
  executiveSummary: string;
  exercisePerformance: PerformanceDelta[];
  progressionSignals: {
    progressionCompliance: 'high' | 'moderate' | 'low';
    keyBottlenecks: string[];
    recoveryConstraints: string[];
  };
  recommendationsForMaster: string[];
}

export interface MasterPlanOutput {
  mesocycle: {
    title: string;
    objective: string;
    split: string;
    durationWeeks: number;
    targetSessionMinutes: number;
    weeks: Array<{
      weekNumber: number;
      isDeload: boolean;
      targetVolumeNotes: string;
    }>;
    days: Array<{
      dayOrder: number;
      label: string;
      estimatedDurationMin: number;
      exercises: Array<{
        exerciseKey: string;
        exerciseName: string;
        movementPattern: string;
        targetSets: number;
        targetRepMin: number;
        targetRepMax: number;
        targetRpeMin: number;
        targetRpeMax: number;
        restSeconds: number;
        advancedTechnique: string | null;
      }>;
    }>;
  };
  coachBrain: {
    hypotheses: string[];
    rationale: string[];
    nextCycleWatchouts: string[];
    retrospective: {
      whatWorked: string[];
      whatFailed: string[];
      confidenceScore: number;
      correctionActions: string[];
    };
  };
}

export interface AssistantOutput {
  mode: 'exercise_swap' | 'fatigue_alert';
  recommendations: Array<{
    title: string;
    reason: string;
    metadata?: Record<string, unknown>;
  }>;
  alert?: {
    type: string;
    severity: 'low' | 'medium' | 'high';
    message: string;
    action: string;
  };
}

export const masterPlanOutputSchema = {
  $id: 'masterPlanOutput',
  type: 'object',
  additionalProperties: false,
  required: ['mesocycle', 'coachBrain'],
  properties: {
    mesocycle: {
      type: 'object',
      additionalProperties: false,
      required: [
        'title',
        'objective',
        'split',
        'durationWeeks',
        'targetSessionMinutes',
        'weeks',
        'days',
      ],
      properties: {
        title: { type: 'string', minLength: 3 },
        objective: { type: 'string', minLength: 3 },
        split: { type: 'string', minLength: 2 },
        durationWeeks: { type: 'integer', minimum: 4, maximum: 6 },
        targetSessionMinutes: { type: 'integer', minimum: 45, maximum: 90 },
        weeks: {
          type: 'array',
          minItems: 4,
          maxItems: 6,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['weekNumber', 'isDeload', 'targetVolumeNotes'],
            properties: {
              weekNumber: { type: 'integer', minimum: 1, maximum: 6 },
              isDeload: { type: 'boolean' },
              targetVolumeNotes: { type: 'string', minLength: 3 },
            },
          },
        },
        days: {
          type: 'array',
          minItems: 3,
          maxItems: 6,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['dayOrder', 'label', 'estimatedDurationMin', 'exercises'],
            properties: {
              dayOrder: { type: 'integer', minimum: 1, maximum: 7 },
              label: { type: 'string', minLength: 2 },
              estimatedDurationMin: { type: 'integer', minimum: 35, maximum: 90 },
              exercises: {
                type: 'array',
                minItems: 3,
                maxItems: 10,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: [
                    'exerciseKey',
                    'exerciseName',
                    'movementPattern',
                    'targetSets',
                    'targetRepMin',
                    'targetRepMax',
                    'targetRpeMin',
                    'targetRpeMax',
                    'restSeconds',
                    'advancedTechnique',
                  ],
                  properties: {
                    exerciseKey: { type: 'string', minLength: 2 },
                    exerciseName: { type: 'string', minLength: 2 },
                    movementPattern: { type: 'string', minLength: 2 },
                    targetSets: { type: 'integer', minimum: 1, maximum: 8 },
                    targetRepMin: { type: 'integer', minimum: 1, maximum: 25 },
                    targetRepMax: { type: 'integer', minimum: 1, maximum: 30 },
                    targetRpeMin: { type: 'number', minimum: 5, maximum: 10 },
                    targetRpeMax: { type: 'number', minimum: 5, maximum: 10 },
                    restSeconds: { type: 'integer', minimum: 30, maximum: 360 },
                    advancedTechnique: {
                      oneOf: [
                        { type: 'string', minLength: 2 },
                        { type: 'null' }
                      ]
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    coachBrain: {
      type: 'object',
      additionalProperties: false,
      required: ['hypotheses', 'rationale', 'nextCycleWatchouts', 'retrospective'],
      properties: {
        hypotheses: {
          type: 'array',
          minItems: 1,
          items: { type: 'string', minLength: 5 },
        },
        rationale: {
          type: 'array',
          minItems: 1,
          items: { type: 'string', minLength: 5 },
        },
        nextCycleWatchouts: {
          type: 'array',
          minItems: 1,
          items: { type: 'string', minLength: 5 },
        },
        retrospective: {
          type: 'object',
          additionalProperties: false,
          required: ['whatWorked', 'whatFailed', 'confidenceScore', 'correctionActions'],
          properties: {
            whatWorked: {
              type: 'array',
              minItems: 1,
              items: { type: 'string', minLength: 5 },
            },
            whatFailed: {
              type: 'array',
              minItems: 1,
              items: { type: 'string', minLength: 5 },
            },
            confidenceScore: { type: 'number', minimum: 0, maximum: 1 },
            correctionActions: {
              type: 'array',
              minItems: 1,
              items: { type: 'string', minLength: 5 },
            },
          },
        },
      },
    },
  },
} as const;

export const dataAnalystReportSchema = {
  $id: 'dataAnalystReport',
  type: 'object',
  additionalProperties: false,
  required: ['executiveSummary', 'exercisePerformance', 'progressionSignals', 'recommendationsForMaster'],
  properties: {
    executiveSummary: { type: 'string', minLength: 20 },
    exercisePerformance: {
      type: 'array',
      minItems: 1,
      maxItems: 30,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'exerciseName',
          'movementPattern',
          'observedProgression',
          'loadTrendKgPerWeek',
          'repTrendPerWeek',
          'rpeAccuracyRate',
          'fatigueImpact',
          'notes',
        ],
        properties: {
          exerciseName: { type: 'string', minLength: 2 },
          movementPattern: { type: 'string', minLength: 2 },
          observedProgression: {
            type: 'string',
            enum: ['improved', 'stagnant', 'regressed', 'insufficient_data'],
          },
          loadTrendKgPerWeek: { type: ['number', 'null'] },
          repTrendPerWeek: { type: ['number', 'null'] },
          rpeAccuracyRate: { type: ['number', 'null'], minimum: 0, maximum: 1 },
          fatigueImpact: { type: 'string', enum: ['low', 'moderate', 'high', 'unknown'] },
          notes: { type: 'string', minLength: 10 },
        },
      },
    },
    progressionSignals: {
      type: 'object',
      additionalProperties: false,
      required: ['progressionCompliance', 'keyBottlenecks', 'recoveryConstraints'],
      properties: {
        progressionCompliance: { type: 'string', enum: ['high', 'moderate', 'low'] },
        keyBottlenecks: {
          type: 'array',
          minItems: 1,
          items: { type: 'string', minLength: 5 },
        },
        recoveryConstraints: {
          type: 'array',
          minItems: 1,
          items: { type: 'string', minLength: 5 },
        },
      },
    },
    recommendationsForMaster: {
      type: 'array',
      minItems: 3,
      items: { type: 'string', minLength: 8 },
    },
  },
} as const;

export const assistantOutputSchema = {
  $id: 'assistantOutput',
  type: 'object',
  additionalProperties: false,
  required: ['mode', 'recommendations'],
  properties: {
    mode: { type: 'string', enum: ['exercise_swap', 'fatigue_alert'] },
    recommendations: {
      type: 'array',
      minItems: 1,
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'reason'],
        properties: {
          title: { type: 'string', minLength: 3 },
          reason: { type: 'string', minLength: 6 },
          metadata: { type: 'object', nullable: true },
        },
      },
    },
    alert: {
      type: 'object',
      nullable: true,
      additionalProperties: false,
      required: ['type', 'severity', 'message', 'action'],
      properties: {
        type: { type: 'string', minLength: 3 },
        severity: { type: 'string', enum: ['low', 'medium', 'high'] },
        message: { type: 'string', minLength: 6 },
        action: { type: 'string', minLength: 6 },
      },
    },
  },
} as const;
