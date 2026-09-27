export interface RunningCoachProfileContext {
  id: string;
  currentPace5kSec?: number | null;
  currentPace10kSec?: number | null;
  currentPaceHalfSec?: number | null;
  weeklyVolumeKm?: number | null;
  maxHeartRate?: number | null;
  restingHeartRate?: number | null;
  primaryObjective?: string | null;
  targetPaceSec?: number | null;
  targetDistanceKm?: number | null;
  availableDays?: string[] | null;
  injuryHistory?: unknown | null;
  primaryTerrain?: string | null;
  hrZones?: Record<string, { min: number; max: number; label: string }> | null;
}

export interface RunningCoachContext {
  runningProfile: RunningCoachProfileContext;
  recentExecutions: Array<{
    date: string;
    distanceKm: number;
    durationSeconds: number;
    avgPaceSec?: number | null;
    avgHeartRate?: number | null;
    sessionRpe?: number | null;
    notes?: string | null;
    source: string;
  }>;
  previousBrainEntries: Array<{
    month: number;
    year: number;
    decayWeight: number;
    hypotheses: unknown;
    retrospective: unknown;
  }>;
  crossTrainingActivities?: Array<{
    date: string;
    activityType: string;
    durationMinutes: number;
    sessionRpe?: number | null;
    muscleGroups?: unknown;
    notes?: string | null;
  }>;
  recentStrengthWorkouts?: Array<{
    date: string;
    workoutTitle?: string;
    targetMuscleGroups?: string[];
    rpeAvg?: number | null;
  }>;
  targetMonth: number;
  targetYear: number;
}

/**
 * Calculates Karvonen Heart Rate Reserve (HRR) zones.
 * Formula: Target HR = Resting HR + % * (Max HR - Resting HR)
 */
export function calculateKarvonenZones(maxHeartRate: number, restingHeartRate: number) {
  const hrr = Math.max(0, maxHeartRate - restingHeartRate);
  return {
    zone1: {
      min: Math.round(restingHeartRate + 0.50 * hrr),
      max: Math.round(restingHeartRate + 0.60 * hrr),
      label: 'Zona 1: Recuperação Ativa (50-60% HRR)',
    },
    zone2: {
      min: Math.round(restingHeartRate + 0.60 * hrr),
      max: Math.round(restingHeartRate + 0.70 * hrr),
      label: 'Zona 2: Base Aeróbica / Conversacional (60-70% HRR)',
    },
    zone3: {
      min: Math.round(restingHeartRate + 0.70 * hrr),
      max: Math.round(restingHeartRate + 0.80 * hrr),
      label: 'Zona 3: Tempo / Aeróbico Médio (70-80% HRR)',
    },
    zone4: {
      min: Math.round(restingHeartRate + 0.80 * hrr),
      max: Math.round(restingHeartRate + 0.90 * hrr),
      label: 'Zona 4: Limiar de Lactato / Threshold (80-90% HRR)',
    },
    zone5: {
      min: Math.round(restingHeartRate + 0.90 * hrr),
      max: maxHeartRate,
      label: 'Zona 5: VO2max / Capacidade Anaeróbica (90-100% HRR)',
    },
  };
}

/**
 * Calculates estimated Jack Daniels VDOT functional training paces based on 5K pace in seconds/km.
 */
export function estimateVdotPaces(pace5kSec: number) {
  return {
    easyPaceRangeSec: [Math.round(pace5kSec * 1.15), Math.round(pace5kSec * 1.25)] as [number, number],
    marathonPaceRangeSec: [Math.round(pace5kSec * 1.08), Math.round(pace5kSec * 1.14)] as [number, number],
    thresholdPaceRangeSec: [Math.round(pace5kSec * 1.03), Math.round(pace5kSec * 1.07)] as [number, number],
    intervalPaceRangeSec: [Math.round(pace5kSec * 0.95), Math.round(pace5kSec * 0.99)] as [number, number],
    repetitionPaceRangeSec: [Math.round(pace5kSec * 0.88), Math.round(pace5kSec * 0.94)] as [number, number],
  };
}

export function formatPace(paceSec: number): string {
  const min = Math.floor(paceSec / 60);
  const sec = Math.round(paceSec % 60);
  return `${min}:${sec.toString().padStart(2, '0')}/km`;
}

export function buildRunningCoachPrompts(context: RunningCoachContext) {
  const { runningProfile, targetMonth, targetYear } = context;

  const baseline5kPace = runningProfile.currentPace5kSec ?? 330; // default 5:30/km if uncalibrated
  const vdotPaces = estimateVdotPaces(baseline5kPace);

  const systemPrompt = `You are Running Coach AI, a world-class endurance architect and exercise physiologist specializing in periodized running programs based on Jack Daniels VDOT, Pete Pfitzinger endurance principles, and 80/20 polarized volume distribution.

MISSION & ATHLETE OBJECTIVE:
Design a precise, periodized 4-week running mesocycle (month: ${targetMonth}, year: ${targetYear}) tailored to the athlete's baseline fitness, weekly available days, terrain, and concurrent cross-training / hypertrophy load.

CORE SCIENTIFIC FRAMEWORK:

1. JACK DANIELS VDOT PACING & FUNCTIONAL EFFORT BRACKETS:
   Base 5K Pace Reference: ${formatPace(baseline5kPace)} (${baseline5kPace} sec/km).
   - E-Pace (Easy / Aerobic): ${formatPace(vdotPaces.easyPaceRangeSec[0])} - ${formatPace(vdotPaces.easyPaceRangeSec[1])} (${vdotPaces.easyPaceRangeSec[0]}-${vdotPaces.easyPaceRangeSec[1]} sec/km). Zone 1-2. Foundation building, capillarization, mitochondrial biogenesis, and recovery.
   - M-Pace (Marathon / Steady): ${formatPace(vdotPaces.marathonPaceRangeSec[0])} - ${formatPace(vdotPaces.marathonPaceRangeSec[1])} (${vdotPaces.marathonPaceRangeSec[0]}-${vdotPaces.marathonPaceRangeSec[1]} sec/km). Zone 3. Aerobic stamina and pacing efficiency.
   - T-Pace (Threshold): ${formatPace(vdotPaces.thresholdPaceRangeSec[0])} - ${formatPace(vdotPaces.thresholdPaceRangeSec[1])} (${vdotPaces.thresholdPaceRangeSec[0]}-${vdotPaces.thresholdPaceRangeSec[1]} sec/km). Zone 4. Lactate threshold, comfortably hard, steady state clearance.
   - I-Pace (Interval): ${formatPace(vdotPaces.intervalPaceRangeSec[0])} - ${formatPace(vdotPaces.intervalPaceRangeSec[1])} (${vdotPaces.intervalPaceRangeSec[0]}-${vdotPaces.intervalPaceRangeSec[1]} sec/km). Zone 5. VO2max stimulus, 3-5 minute work bouts (e.g. 5x800m, 4x1000m) with 1:1 or 1:0.75 recovery jog.
   - R-Pace (Repetition): ${formatPace(vdotPaces.repetitionPaceRangeSec[0])} - ${formatPace(vdotPaces.repetitionPaceRangeSec[1])} (${vdotPaces.repetitionPaceRangeSec[0]}-${vdotPaces.repetitionPaceRangeSec[1]} sec/km). Anaerobic power, running economy, and neuromuscular turnover (200m-400m strides with full recovery).

2. PETE PFITZINGER 4-WEEK MESOCYCLE PERIODIZATION:
   - Exactly 4 calendar weeks (Week 1 to Week 4).
   - Mesocycle Phases:
     * 'base': Aerobic volume build, low intensity, anatomical adaptation.
     * 'build': Progressive introduction of lactate threshold and aerobic power intervals.
     * 'peak': Specificity, race pace rehearsal, sharp interval work.
     * 'taper': 30-40% volume drop maintaining high intensity prior to target race.
     * 'recovery': Deload and active recovery cycle following an intense phase or race.
   - Weekly Volume Progression:
     * Week 1: Baseline introduction.
     * Week 2: Moderate volume increase (+5% to +10%).
     * Week 3: Peak volume/stimulus week (+5%).
     * Week 4: Physiological adaptation and regeneration week (15-20% drop in volume, keeping neuromuscular sharpness).
   - Hard-Easy Rule: Never prescribe two consecutive high-impact or high-intensity days (intervals, tempo, long run). Always place an easy day or rest day between them.

3. 80/20 POLARIZED TRAINING (Stephen Seiler / Matt Fitzgerald):
   - 80% of weekly mileage/time MUST be low-intensity (Zone 1-2, Easy Pace, conversational effort).
   - 20% of weekly mileage/time allocated to quality sessions (Zone 4-5, Tempo, Intervals, Hill Repeats).
   - Strictly avoid the "moderate slog" (Zone 3 grey zone) during easy sessions: easy runs must stay easy to allow optimal recovery for quality days.

4. CANONICAL 9 SESSION TYPES:
   Each session in the plan must strictly use one of the 9 canonical sessionType enums:
   1. 'easy': Continuous Zone 2 aerobic run (30-60 min).
   2. 'tempo': Sustained threshold effort (Zone 4) bracketed by warmup and cooldown.
   3. 'intervals': High-intensity repetitions at VO2max pace with structured recovery jog intervals.
   4. 'long_run': Extended aerobic run in Zone 2 to build endurance, glycogen sparing, and mental resilience.
   5. 'fartlek': Unstructured or structured speed play alternating between fast surges and easy aerobic floats.
   6. 'hill_repeats': Incline repetitions (6-10x 45-90s) focusing on power, stride mechanics, and minimal impact force.
   7. 'progression': Run starting at easy Zone 2 pace and gradually accelerating to tempo or race pace in the final 20-30%.
   8. 'race_pace': Specific rehearsal of target race pace and cadence.
   9. 'recovery': Gentle 20-30 min shakeout run strictly in Zone 1 for active blood flow.

5. GRANULAR WORKOUT SEGMENTS:
   Every session MUST break down into structured segments with types:
   'warmup', 'cooldown', 'steady', 'interval', 'recovery_jog', 'tempo', 'race_pace'.
   Specify target distance, duration, pace range in seconds ([minPaceSec, maxPaceSec]), and HR zone where applicable.

6. CONCURRENT CROSS-TRAINING & HYPERTROPHY RECOVERY AWARENESS:
   - The athlete also logs strength training (hypertrophy) and cross-training (CrossFit, swimming, cycling).
   - Pay close attention to recent lower-body fatigue (quadriceps, hamstrings, calves, glutes, axial spinal loading).
   - When recent heavy leg workouts or demanding CrossFit WODs are detected, do NOT schedule hard track intervals or high-impact hill repeats the following day. Space long runs and intervals with adequate recovery buffer.

7. TEMPORAL MEMORY DECAY & COACH BRAIN CONTINUITY:
   - Previous coach brain entries reflect past hypotheses and retrospectives with decay weights:
     * Decay Weight 1.0 (Month -0): High active relevance.
     * Decay Weight 0.7 (Month -1): Moderate historical trend.
     * Decay Weight 0.4 (Month -2): Low background context.
   - Formulate new forward-looking hypotheses, rationale, monthly progression summary, and retrospective insights.

OUTPUT FORMAT:
Return strictly a valid JSON object matching the RunningPlanOutput schema.
No markdown wrappers, no introductory prose, no code comments.`;

  const userPrompt = [
    `Generate the periodized 4-week running plan for month ${targetMonth}, year ${targetYear}.`,
    'ATHLETE RUNNING PROFILE:',
    JSON.stringify(runningProfile, null, 2),
    'CALCULATED HR ZONES (KARVONEN):',
    JSON.stringify(
      runningProfile.hrZones ??
        (runningProfile.maxHeartRate && runningProfile.restingHeartRate
          ? calculateKarvonenZones(runningProfile.maxHeartRate, runningProfile.restingHeartRate)
          : null),
      null,
      2
    ),
    'RECENT RUNNING EXECUTIONS (LAST 60 DAYS):',
    JSON.stringify(context.recentExecutions, null, 2),
    'PREVIOUS COACH BRAIN MEMORY WITH TEMPORAL DECAY:',
    JSON.stringify(context.previousBrainEntries, null, 2),
    'CONCURRENT CROSS-TRAINING SESSIONS (LAST 30 DAYS):',
    JSON.stringify(context.crossTrainingActivities ?? [], null, 2),
    'RECENT STRENGTH WORKOUTS (HYPERTROPHY FATIGUE):',
    JSON.stringify(context.recentStrengthWorkouts ?? [], null, 2),
  ].join('\n\n');

  return { systemPrompt, userPrompt };
}
