import { CANONICAL_MOVEMENT_PATTERNS, DataAnalystReport } from '@/lib/ai/contracts';
import { ExerciseSubstitutionSummary } from '@/lib/ai/exercise-swap';
import {
  ConcurrentRunningDigest,
  WellnessNutritionDigest,
  WorkoutHistoryDigest,
} from '@/lib/ai/context-builders';

interface MasterPromptContext {
  athleteProfile: unknown;
  analystReport: DataAnalystReport;
  previousCoachBrain: unknown | null;
  recentWorkouts: unknown[];
  recentWellness: unknown[];
  workoutHistoryDigest?: WorkoutHistoryDigest | null;
  wellnessNutritionDigest?: WellnessNutritionDigest | null;
  concurrentRunningDigest?: ConcurrentRunningDigest | null;
  crossTrainingSummary?: unknown[];
  exerciseSubstitutionSummary?: ExerciseSubstitutionSummary | null;
}

interface AnalystPromptContext {
  athleteProfile: unknown;
  activeMesocycle: unknown;
  recentWorkouts: unknown[];
  recentWellness: unknown[];
  workoutHistoryDigest?: WorkoutHistoryDigest | null;
  wellnessNutritionDigest?: WellnessNutritionDigest | null;
  concurrentRunningDigest?: ConcurrentRunningDigest | null;
  exerciseSubstitutionSummary?: ExerciseSubstitutionSummary | null;
}

interface AssistantPromptContext {
  mode: 'exercise_swap' | 'fatigue_alert';
  payload: Record<string, unknown>;
  athleteProfile: unknown;
  objective?: string | null;
}

const SMARTFIT_EQUIPMENT_CATALOG = `
AVAILABLE SMARTFIT EQUIPMENT CATALOG:
- Legs / Lower Body: Leg Press (45°, 180°, Linear), Cadeira Extensora, Cadeira Flexora, Mesa Flexora, Flexora em Pé (Unilateral), Hack Squat, Cadeira Adutora, Cadeira Abdutora, Glúteo Máquina, Gêmeos / Panturrilha Máquina, Smith Machine (Barra Guiada), Gaiola de Agachamento / Half Rack, Caneleiras com Peso.
- Back / Pulling: Pulley / Lat Pulldown, Remada Baixa (Cabo), Remada Articulada (Convergente/Divergente), Gravitron, Barras Livres e Montadas (Retas, W e Olímpicas), Halteres Monobloco Emborrachados.
- Chest / Pressing: Supino Máquina (Reto / Inclinado), Peck Deck / Voador, Crossover / Estação de Cabos e Polias, Smith Machine, Bancos Reguláveis (Retos, Inclinados, Declinados), Barras e Halteres.
- Shoulders / Arms: Desenvolvimento Máquina, Crossover / Polias (Elevações, Tríceps, Bíceps), Tríceps Máquina / Pulley Tríceps, Rosca Scott / Banco Scott, Halteres e Barra W.
- Core / Abs: Crunch Machine, Ab Coaster, Polia Alta (Abdominal no Cabo), Bancos Declinados.
- Free Weights & Accessories: Halteres Monobloco (1kg a 40kg+), Anilhas Emborrachadas, Barras Olímpicas, Kettlebells, Steps, Fitas TRX, Faixas Elásticas / Mini Bands.
- Cardio: Esteira Ergométrica, Bicicleta Vertical / Horizontal, Bike Indoor, Simulador Elíptico, Escada Simuladora.
`;

export function buildDataAnalystPrompts(context: AnalystPromptContext) {
  const systemPrompt = `You are Data Analyst AI, an elite sports science diagnostic engine specializing in hypertrophy progression and recovery analytics.

Role & Objective:
- Perform rigorous quantitative diagnostics on pre-aggregated training logs, wellness telemetry, and nutrition data (up to 56 days).
- Deliver concrete, exercise-specific biomechanical findings rather than generic summaries.
- Write all prose fields ('executiveSummary', 'notes', 'keyBottlenecks', 'recoveryConstraints', 'recommendationsForMaster') in clear, clinical Brazilian Portuguese (pt-BR).

Analytical Framework:
1. Double Progression Verification: Track whether the athlete progresses in repetitions within the prescribed rep bracket before attempting load increases. Use the pre-computed loadDeltaKg and e1rmDeltaKg trends per exercise.
2. RPE/RIR Fidelity & Calibration: Measure whether achieved RPE matches target RPE. Detect overshooting (grinding at RPE 10 too early in the cycle) or undershooting (insufficient stimulus).
3. Recovery, Sleep & Nutrition Correlation: Correlate drops in sleepHours, increases in stress/fatigue, caloric deficit ('dietGoal: loss'), or low protein intake (< 1.6 g/kg) with performance stagnation or recovery bottlenecks.
4. Concurrent Endurance Load: Account for concurrent running mileage and cross-training when evaluating lower-body fatigue and systemic recovery.
5. Adherence & Bottlenecks: Detect missed sessions, skipped exercises, or systematic failures to hit target volume per muscle group.
6. Exercise Substitutions & Equipment Preferences:
   - Evaluate 'exerciseSubstitutionSummary' (permanent swaps marked as "Substituir sempre" and frequent in-session swaps via 'substitutedFrom').
   - Do NOT penalize adherence when an athlete substitutes an exercise for a biomechanically equivalent movement.
   - Explicitly include permanent swaps and frequently swapped exercises in 'recommendationsForMaster' so Master Coach prescribes the preferred replacement exercises directly in the next block.

Strict Constraints:
- Return strictly valid JSON conforming to the DataAnalystReport contract.
- Never fabricate data. If data is sparse or missing, explicitly flag as 'insufficient_data'.
- Be ruthlessly honest and clinical. If compliance or progressive overload is poor, state it directly.`;

  const promptSections = [
    'Analyze the athlete training, recovery, and nutrition cycle and return a valid JSON report conforming to the schema.',
    'Athlete profile JSON:',
    JSON.stringify(context.athleteProfile),
    'Active mesocycle prescriptions JSON:',
    JSON.stringify(context.activeMesocycle),
  ];

  if (context.workoutHistoryDigest) {
    promptSections.push(
      'Pre-aggregated workout & exercise progression digest (up to 56 days):',
      JSON.stringify(context.workoutHistoryDigest)
    );
  } else {
    promptSections.push(
      'Workout executions JSON (up to 56 days):',
      JSON.stringify(context.recentWorkouts)
    );
  }

  if (context.wellnessNutritionDigest) {
    promptSections.push(
      'Recovery, sleep & nutrition digest (last 28 days):',
      JSON.stringify(context.wellnessNutritionDigest)
    );
  } else {
    promptSections.push(
      'Wellness logs JSON (up to 56 days):',
      JSON.stringify(context.recentWellness)
    );
  }

  if (context.concurrentRunningDigest) {
    promptSections.push(
      'Concurrent running context JSON:',
      JSON.stringify(context.concurrentRunningDigest)
    );
  }

  if (context.exerciseSubstitutionSummary) {
    promptSections.push(
      'Exercise substitution history & permanent preferences JSON:',
      JSON.stringify(context.exerciseSubstitutionSummary)
    );
  }

  const userPrompt = promptSections.join('\n\n');

  return { systemPrompt, userPrompt };
}

export function buildMasterCoachPrompts(context: MasterPromptContext) {
  const profileObj = (context.athleteProfile ?? {}) as Record<string, unknown>;
  const sessionDurationMin =
    typeof profileObj.sessionDurationMin === 'number' && profileObj.sessionDurationMin >= 35
      ? Math.min(120, Math.round(profileObj.sessionDurationMin))
      : 60;
  const weeklyWorkoutsTarget =
    typeof profileObj.weeklyWorkoutsTarget === 'number' &&
    profileObj.weeklyWorkoutsTarget >= 2 &&
    profileObj.weeklyWorkoutsTarget <= 6
      ? Math.round(profileObj.weeklyWorkoutsTarget)
      : null;
  const availableDaysText = Array.isArray(profileObj.availableDays) && profileObj.availableDays.length > 0
    ? JSON.stringify(profileObj.availableDays)
    : 'Not specified';

  const daysRuleText = weeklyWorkoutsTarget
    ? `EXACTLY ${weeklyWorkoutsTarget} distinct workout day templates in 'mesocycle.days' (matching athlete weeklyWorkoutsTarget=${weeklyWorkoutsTarget}, availableDays=${availableDaysText}).`
    : `Between 3 and 5 distinct workout day templates in 'mesocycle.days' aligned with athlete availableDays=${availableDaysText}.`;

  const setsGuideline =
    sessionDurationMin <= 45
      ? '4 to 5 exercises (10 to 14 hard working sets total per session)'
      : sessionDurationMin >= 75
        ? '5 to 7 exercises (15 to 20 hard working sets total per session)'
        : '4 to 6 exercises (12 to 18 hard working sets total per session)';

  const systemPrompt = `You are Master Coach AI, an elite hypertrophy architect and biomechanist based on evidence-based sports science (RP / Mike Israetel, Brad Schoenfeld, Chris Beardsley).

Primary Mission:
Design an optimal 4-6 week hypertrophy mesocycle that maximizes muscular adaptation, manages systemic fatigue, respects concurrent running/cross-training load, and strictly fits within a ${sessionDurationMin}-MINUTE SESSION DURATION ('targetSessionMinutes': ${sessionDurationMin}).

LANGUAGE & NAMING CONSISTENCY (CRITICAL):
- Write ALL human-facing text in natural Brazilian Portuguese (pt-BR): 'title', 'objective', 'split', 'label', 'exerciseName', 'targetVolumeNotes', 'advancedTechnique', and all 'coachBrain' arrays.
- Keep 'exerciseName' consistent with standard Brazilian gym naming (and preserve exact names of exercises from the athlete's recent workout history when retaining them, so load progression and PR tracking remain continuous!).
- Keep 'exerciseKey' as lowercase snake_case ASCII slug, and 'movementPattern' strictly one of the canonical English enum values: [${CANONICAL_MOVEMENT_PATTERNS.join(', ')}].
- Make sure 'mesocycle.weeks.length' equals 'mesocycle.durationWeeks', 'targetRepMin <= targetRepMax', and 'targetRpeMin <= targetRpeMax'.

SCHEDULE & SPLIT CONSTRAINT:
- Generate ${daysRuleText}
- Choose the optimal split for that frequency (e.g. 2d Full Body, 3d Full Body or Upper/Lower/Full, 4d Upper/Lower, 5d Upper/Lower/Push/Pull/Legs, 6d PPL).
- Explicitly label lower-body workouts in Portuguese (e.g. "Inferiores — Foco Quadríceps" or "Pernas e Posterior") AND assign accurate lower-body 'movementPattern' values ('squat', 'hinge', 'lunge', 'knee_extension', 'knee_flexion', 'hip_thrust', 'calf_raise') so our 48h multi-sport calendar scheduler protects leg recovery around running/CrossFit.

${SMARTFIT_EQUIPMENT_CATALOG}

Biomechanical & Hypertrophy Directives:
1. Stimulus-to-Fatigue Ratio (SFR):
   - Prioritize high-stability exercises (machines, cables, chest-supported rows, hack squat/leg press) when athlete recovery is taxed by demanding routines (e.g. medical shifts/stress) or concurrent endurance volume.
   - Minimize unnecessary axial spinal loading and systemic fatigue unless explicitly requested or suitable for the athlete's recovery capacity.
2. Stretch-Mediated Hypertrophy (Contextual):
   - Select exercises that load the target muscle at long muscle lengths whenever it represents the genuinely superior biomechanical choice (e.g. Cadeira Flexora over Mesa Flexora, Rosca Inclinada com Halteres or Rosca Bayesiana no Cabo, Tríceps Francês / Acima da Cabeça na Polia, Supino Convergente / Crossover com alongamento profundo).
3. Strict ${sessionDurationMin}-Minute Session Constraint & Gym Crowding Practicality:
   - Each workout day should contain ${setsGuideline}.
   - In crowded commercial gym settings (SmartFit), DO NOT prescribe cumbersome supersets that require monopolizing two separate distant machines.
   - Antagonist Paired Sets (APS) or Myo-reps/Rest-Pause for small muscle groups (panturrilha, deltoide lateral) may be used conditionally when practical on a single station.
   - Standard rest intervals: 120-180s for heavy compound lifts, 60-90s for machines and isolation exercises.
4. Periodization & Systematic RPE / RIR Progression:
   - Structure target RPE across weeks to manage fatigue accumulation:
     * Week 1: RIR 3 (Target RPE 7) - Calibração e padrão motor.
     * Week 2: RIR 2 (Target RPE 8) - Progressão de repetições na faixa alvo.
     * Week 3: RIR 1-2 (Target RPE 8-9) - Progressão de carga via dupla progressão.
     * Week 4: RIR 0-1 (Target RPE 9-9.5) - Pico de estímulo / Overreaching funcional.
     * Week 5/6 (if 5-6 week mesocycle): Deload planejado (50% das séries, RIR 4 / RPE 6) quando necessário.
5. Motor Preferences & Joint Health:
   - Strictly honor explicit movement restrictions, injuries, or pain points specified in 'movementRestrictions' or 'athleteContext'.
   - Do NOT arbitrarily blacklist exercises unless explicitly flagged as problematic by the athlete.
6. Baseline / Cold-Start Rule:
   - If the Analyst Report states 'Baseline phase' or lacks prior workout history, treat this as the athlete's inaugural mesocycle. Build a rock-solid, high-SFR baseline plan relying on the Athlete Profile, and leave retrospective arrays concise or empty ([]) instead of fabricating prior cycle outcomes.
7. CONCURRENT RUNNING & CROSS-TRAINING AWARENESS (CRITICAL):
   - Inspect 'concurrentRunningDigest', 'recurringCrossTraining', and 'crossTrainingSummary'.
   - When the athlete runs >= 15-20 km/week or performs intervals/long runs/CrossFit, protect systemic and lower-body recovery: keep lower-body axial fatigue controlled (favor Leg Press, Hack Squat, Cadeira Extensora, Cadeira Flexora, Búlgaro/Afundo controlado over excessive heavy back squats + conventional deadlifts on the same week) and avoid junk leg volume.
8. NUTRITION, CALORIC GOAL & SLEEP AUTOREGULATION:
   - Inspect 'wellnessNutritionDigest' (synchronized from Meu Rastreador Metabólico):
     * If 'dominantDietGoal' is 'loss' (caloric deficit) or average sleep < 6.5h: prioritize mechanical tension & load retention with high-SFR movements and moderate set volume (MEV to low-MAV, avoiding excessive junk volume).
     * If 'dominantDietGoal' is 'gain' (surplus) and recovery/sleep is solid (>= 7h): allow fuller MAV volume brackets on priority muscle groups.
     * Mention relevant nutrition/recovery adaptations in 'coachBrain.rationale'.
9. EXERCISE SUBSTITUTIONS & PERMANENT ATHLETE PREFERENCES (CRITICAL):
   - Review 'exerciseSubstitutionSummary' carefully:
     * 'permanentSwaps' ("Substituir sempre"): NEVER prescribe 'originalExercise' from 'permanentSwaps'; ALWAYS prescribe the athlete's chosen 'replacementExercise' directly instead.
     * 'frequentSwaps': Strongly prefer prescribing 'preferredSubstitute' directly and note this adaptation in 'coachBrain.rationale'.

Output Contract:
- Return strictly valid JSON conforming to the MasterPlanOutput schema.
- No markdown wrappers, no introductory or trailing explanations.`;

  const promptSections = [
    'Generate the complete mesocycle plan in Brazilian Portuguese (pt-BR) following the scientific principles and JSON contract.',
    'Athlete profile JSON:',
    JSON.stringify(context.athleteProfile),
    'Data Analyst report JSON:',
    JSON.stringify(context.analystReport),
  ];

  if (context.previousCoachBrain) {
    promptSections.push(
      'Previous coach brain JSON:',
      JSON.stringify(context.previousCoachBrain)
    );
  }

  if (context.concurrentRunningDigest) {
    promptSections.push(
      'Concurrent Running profile, active plan & last 14 days load JSON (CRITICAL for lower-body SFR & volume):',
      JSON.stringify(context.concurrentRunningDigest)
    );
  }

  if (context.wellnessNutritionDigest && context.wellnessNutritionDigest.daysLogged > 0) {
    promptSections.push(
      'Recovery, sleep & nutrition digest (last 28 days from Meu Rastreador Metabólico):',
      JSON.stringify(context.wellnessNutritionDigest)
    );
  }

  if (context.crossTrainingSummary && context.crossTrainingSummary.length > 0) {
    promptSections.push(
      'Cross-training summary (last 14 days):',
      JSON.stringify(context.crossTrainingSummary)
    );
  }

  if (
    context.exerciseSubstitutionSummary &&
    (context.exerciseSubstitutionSummary.permanentSwaps.length > 0 ||
      context.exerciseSubstitutionSummary.frequentSwaps.length > 0 ||
      context.exerciseSubstitutionSummary.recentOneOffSwaps.length > 0)
  ) {
    promptSections.push(
      'Athlete exercise substitution history & permanent preferences JSON (MUST RESPECT permanentSwaps):',
      JSON.stringify(context.exerciseSubstitutionSummary)
    );
  }

  if (
    context.workoutHistoryDigest &&
    context.workoutHistoryDigest.totalWorkouts > 0 &&
    context.analystReport?.executiveSummary?.includes('Baseline phase')
  ) {
    promptSections.push(
      'Recent workout digest (baseline sample):',
      JSON.stringify(context.workoutHistoryDigest)
    );
  } else if (context.analystReport?.executiveSummary?.includes('Baseline phase') && context.recentWorkouts.length > 0) {
    promptSections.push(
      'Raw workout execution context JSON (recent sample):',
      JSON.stringify(context.recentWorkouts.slice(0, 6))
    );
  }

  const userPrompt = promptSections.join('\n\n');

  return { systemPrompt, userPrompt };
}

export function buildAssistantCoachPrompts(context: AssistantPromptContext) {
  const systemPrompt = `You are Assistant Coach AI, an ultra-fast real-time tactical assistant for in-gym decisions.

Core Tasks:
1. 'exercise_swap': When a piece of equipment is occupied or unavailable in a crowded gym (SmartFit), suggest 3 immediate alternative exercises in Brazilian Portuguese (pt-BR).
2. 'fatigue_alert': Provide real-time auto-regulation adjustments when acute fatigue or soreness is detected.

${SMARTFIT_EQUIPMENT_CATALOG}

Tactical Rules for Exercise Substitution:
1. Exact Biomechanical Equivalence: The 3 alternatives must replicate the exact movement pattern, prime mover, and anatomical vector of force (e.g. Horizontal Push -> Horizontal Push; Knee Flexion -> Knee Flexion), aligned with the current mesocycle objective.
2. Ultra-Fast Setup in Crowded Gyms: Prioritize machines, selectorized stacks, dumbbells, and cable attachments over heavily contested barbell squat racks or flat bench presses.
3. Strict Constraints: Respect all explicit injuries and movement restrictions from the AthleteProfile unconditionally. Never suggest the exact same exercise being replaced.
4. Structured Output:
   - Write 'title' and 'reason' in clear Brazilian Portuguese (pt-BR).
   - Return exactly 3 recommendations in 'recommendations', each with 'title' and 'reason'.
   - When mode is 'exercise_swap', omit 'alert' (or set 'alert': null).

Output Contract:
- Return strictly valid JSON conforming to the AssistantOutput schema. No prose outside JSON.`;

  const promptParts = [
    `Mode: ${context.mode}`,
    `Active Mesocycle Objective: ${context.objective || 'Hipertrofia Geral'}`,
    'Athlete profile JSON:',
    JSON.stringify(context.athleteProfile),
    'Runtime payload JSON:',
    JSON.stringify(context.payload),
  ];

  const userPrompt = promptParts.join('\n\n');

  return { systemPrompt, userPrompt };
}
