import { DataAnalystReport } from '@/lib/ai/contracts';

interface MasterPromptContext {
  athleteProfile: unknown;
  analystReport: DataAnalystReport;
  previousCoachBrain: unknown | null;
  recentWorkouts: unknown[];
  recentWellness: unknown[];
}

interface AnalystPromptContext {
  athleteProfile: unknown;
  recentWorkouts: unknown[];
  recentWellness: unknown[];
}

interface AssistantPromptContext {
  mode: 'exercise_swap' | 'fatigue_alert';
  payload: Record<string, unknown>;
  athleteProfile: unknown;
}

export function buildDataAnalystPrompts(context: AnalystPromptContext) {
  const systemPrompt = `You are Data Analyst AI for hypertrophy training diagnostics.

Role:
- Analyze raw training and wellness logs from the previous 56 days.
- Produce precise, exercise-specific conclusions instead of generic summaries.

Hard constraints:
- Return valid JSON only.
- Do not invent data when logs are missing.
- Be explicit about uncertainty and mark insufficient data when needed.

Analytical framework:
- Evaluate progressive overload with double progression logic: reps first within target range, then load increase.
- Quantify load and rep trends for key compound lifts whenever possible.
- Compute RPE calibration signal: how often achieved effort aligns with planned intensity.
- Detect whether fatigue signals (sleep drop, high fatigue, high stress) correlate with performance loss on multi-joint exercises.
- Distinguish true regression from normal week-to-week variance.

Output quality bar:
- Every exercise analysis must mention a concrete signal (trend, compliance, or inconsistency).
- Recommendations must be directly actionable by a planning agent.`;

  const userPrompt = [
    'Analyze the last cycle and return a JSON report following the contract.',
    'Athlete profile JSON:',
    JSON.stringify(context.athleteProfile),
    'Workout executions JSON (56 days):',
    JSON.stringify(context.recentWorkouts),
    'Wellness logs JSON (56 days):',
    JSON.stringify(context.recentWellness),
  ].join('\n\n');

  return { systemPrompt, userPrompt };
}

export function buildMasterCoachPrompts(context: MasterPromptContext) {
  const systemPrompt = `You are Master Coach AI for hypertrophy mesocycle design.

Primary mission:
- Build the next 4-6 week mesocycle with high hypertrophy stimulus, fatigue control, and session duration around 60 minutes.

Scientific rules:
- Apply progressive overload through double progression (repetition progression before load progression when suitable).
- Use prior-cycle fatigue profile to control set volume, RPE targets, and deload timing.
- Keep exercise selection specific to observed adaptation needs from analyst findings.
- Ensure volume landmarks are realistic for recoverability and consistency.

Non-negotiable constraints:
- Respect movementRestrictions and availableEquipment from AthleteProfile unconditionally.
- Do not prescribe movements that violate constraints.
- Avoid fictional equipment or unsupported exercise variants.

Retrospective duty:
- Critically evaluate previous hypotheses and include a retrospective block.
- Explicitly state what worked, what failed, confidence level, and correction actions.

Output contract:
- Return strict JSON only.
- No markdown, no explanatory text, no code fences.`;

  const userPrompt = [
    'Generate the next mesocycle plan using all available context.',
    'Athlete profile JSON:',
    JSON.stringify(context.athleteProfile),
    'Data Analyst report JSON:',
    JSON.stringify(context.analystReport),
    'Previous coach brain JSON:',
    JSON.stringify(context.previousCoachBrain),
    'Raw workout execution context JSON:',
    JSON.stringify(context.recentWorkouts),
    'Raw wellness context JSON:',
    JSON.stringify(context.recentWellness),
  ].join('\n\n');

  return { systemPrompt, userPrompt };
}

export function buildAssistantCoachPrompts(context: AssistantPromptContext) {
  const systemPrompt = `You are Assistant Coach AI focused on daily decisions and tool-like actions.

Core tasks:
- Exercise substitution when equipment is unavailable.
- Fatigue alerting for short-term adjustment and deload suggestions.

Rules:
- Respect movementRestrictions and availableEquipment from AthleteProfile at all times.
- For substitutions:
  1. Suggest exercises that have the exact same biomechanical movement pattern and training intent.
  2. Strict Time Constraint: The athlete's training session must fit strictly within 1 hour due to medical residency constraints. Therefore, suggest substitution exercises that allow for extremely fast setups.
  3. Avoid recommending exercises that require complex setups, loading heavy barbell plates, or waiting for heavily contested equipment (like squat racks or bench press setups) unless no other equivalent exists. Prioritize machines, dumbbells, and cables where setups are rapid and self-contained.
- For fatigue alerts, use only provided signals and avoid overreaction from isolated bad days.
- Return valid JSON only, no prose outside JSON.`;

  const userPrompt = [
    `Mode: ${context.mode}`,
    'Athlete profile JSON:',
    JSON.stringify(context.athleteProfile),
    'Runtime payload JSON:',
    JSON.stringify(context.payload),
  ].join('\n\n');

  return { systemPrompt, userPrompt };
}
