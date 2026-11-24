/**
 * Filtro determinístico de segurança clínica/biomecânica e disponibilidade de equipamentos.
 * Atua como barreira secundária após prompts de IA e sobre fallbacks determinísticos.
 */

export type RestrictionTag =
  | 'shoulder'
  | 'knee'
  | 'lower_back'
  | 'elbow'
  | 'wrist'
  | 'hip'
  | 'ankle_shin';

export type EquipmentCategory =
  | 'barbell'
  | 'dumbbells'
  | 'cables'
  | 'machines'
  | 'bodyweight';

export const ALL_EQUIPMENT_CATEGORIES: EquipmentCategory[] = [
  'barbell',
  'dumbbells',
  'cables',
  'machines',
  'bodyweight',
];

function normalizeSafetyText(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const RESTRICTION_PATTERNS: Array<{ tag: RestrictionTag; pattern: RegExp }> = [
  {
    tag: 'shoulder',
    pattern: /(ombro|shoulder|manguito|rotator|supraespinal|bursite|tendinite.*ombro|subacromial|clavicul|luxacao.*ombro)/,
  },
  {
    tag: 'knee',
    pattern: /(joelho|knee|patela|patelar|condromalacia|menisco|lca|acl|ligamento.*joelho)/,
  },
  {
    tag: 'lower_back',
    pattern: /(lombar|lower back|coluna|hernia|l4|l5|s1|ciatico|sciatica|protusao|lombalgia|costas baixas)/,
  },
  {
    tag: 'elbow',
    pattern: /(cotovelo|elbow|epicondilite|tennis elbow|golfer)/,
  },
  {
    tag: 'wrist',
    pattern: /(punho|wrist|carpo|carpal|pulso)/,
  },
  {
    tag: 'hip',
    pattern: /(quadril|hip|pubalgia|labrum|piriforme|trocanter|bursite.*quadril)/,
  },
  {
    tag: 'ankle_shin',
    pattern: /(tornozelo|ankle|canelite|shin|aquiles|achilles|fascite|fascia plantar|pe\b)/,
  },
];

function flattenTextTokens(input: unknown): string {
  if (!input) return '';
  if (typeof input === 'string') return input;
  if (Array.isArray(input)) {
    return input.map((item) => flattenTextTokens(item)).join(' ');
  }
  if (typeof input === 'object') {
    return Object.values(input as Record<string, unknown>)
      .map((val) => flattenTextTokens(val))
      .join(' ');
  }
  return String(input);
}

/**
 * Extrai tags anatômicas de restrição a partir de texto livre (`movementRestrictions`)
 * e histórico estruturado de lesões de corrida (`injuryHistory`).
 */
export function parseRestrictionTags(
  movementRestrictions?: unknown,
  injuryHistory?: unknown
): RestrictionTag[] {
  const raw = `${flattenTextTokens(movementRestrictions)} ${flattenTextTokens(injuryHistory)}`;
  const norm = normalizeSafetyText(raw);
  if (!norm || norm === 'nenhuma' || norm === 'sem restricoes' || norm === 'none') {
    return [];
  }

  const found = new Set<RestrictionTag>();
  for (const { tag, pattern } of RESTRICTION_PATTERNS) {
    if (pattern.test(norm)) {
      found.add(tag);
    }
  }
  return Array.from(found);
}

/**
 * Normaliza equipamentos disponíveis para categorias canônicas.
 * Se nada for configurado, retorna todas as categorias (sem bloqueios espúrios).
 */
export function parseAvailableEquipment(availableEquipment?: unknown): EquipmentCategory[] {
  if (!availableEquipment) return [...ALL_EQUIPMENT_CATEGORIES];

  const items = Array.isArray(availableEquipment)
    ? availableEquipment
    : typeof availableEquipment === 'string'
      ? availableEquipment.split(',')
      : [];

  if (items.length === 0) return [...ALL_EQUIPMENT_CATEGORIES];

  const resolved = new Set<EquipmentCategory>();
  for (const item of items) {
    const norm = normalizeSafetyText(String(item));
    if (!norm) continue;
    if (norm.includes('barbell') || norm.includes('barra')) resolved.add('barbell');
    if (norm.includes('dumbbell') || norm.includes('halter') || norm.includes('kettlebell')) {
      resolved.add('dumbbells');
    }
    if (norm.includes('cable') || norm.includes('cabo') || norm.includes('polia') || norm.includes('pulley')) {
      resolved.add('cables');
    }
    if (
      norm.includes('machine') ||
      norm.includes('maquina') ||
      norm.includes('aparelho') ||
      norm.includes('smith')
    ) {
      resolved.add('machines');
    }
    if (
      norm.includes('bodyweight') ||
      norm.includes('peso corporal') ||
      norm.includes('calistenia') ||
      norm.includes('funcional')
    ) {
      resolved.add('bodyweight');
    }
  }

  return resolved.size > 0 ? Array.from(resolved) : [...ALL_EQUIPMENT_CATEGORIES];
}

/**
 * Infere a categoria de equipamento exigida pelo nome do exercício.
 */
export function detectRequiredEquipment(exerciseName: string): EquipmentCategory {
  const norm = normalizeSafetyText(exerciseName);

  // Máquinas têm prioridade (ex.: "Agachamento no Smith" usa máquina guiada, não barra livre)
  if (
    /(maquina|machine|smith|guiada|articulad|leg press|hack|extensora|flexora|peck deck|voador|gravitron|panturrilha sentado|abdutor|adutor)/.test(
      norm
    )
  ) {
    return 'machines';
  }

  if (/(polia|cabo|cable|pulley|crossover|corda|triangulo|pulldown)/.test(norm)) {
    return 'cables';
  }

  if (/(halter|dumbbell|kettlebell|anilha)/.test(norm)) {
    return 'dumbbells';
  }

  if (
    /(peso corporal|bodyweight|barra fixa|pull up|chin up|flexao|push up|paralela|mergulho|dips|prancha|plank|abdominal|elevacao de pernas)/.test(
      norm
    )
  ) {
    return 'bodyweight';
  }

  if (
    /(barra|barbell|olimpic|barra w|rosca w|levantamento terra|agachamento livre|supino reto|supino inclinado barra|stiff com barra|remada curvada)/.test(
      norm
    )
  ) {
    return 'barbell';
  }

  return 'bodyweight';
}

interface ContraindicationRule {
  tag: RestrictionTag;
  pattern: RegExp;
  reason: string;
}

const CONTRAINDICATION_RULES: ContraindicationRule[] = [
  {
    tag: 'shoulder',
    pattern: /(atras da nuca|behind the neck|nuca|guilhotina|remada alta|upright row|paralela|mergulho|\bdips?\b|crucifixo reto extremo)/,
    reason: 'Alto cisalhamento subacromial/anterior de ombro contraindicado para restrição de ombro.',
  },
  {
    tag: 'knee',
    pattern: /(sissy squat|agachamento com salto|jump squat|box jump|pistol|agachamento livre profundo|extensora maxima)/,
    reason: 'Elevada força de cisalhamento patelofemoral contraindicada para restrição de joelho.',
  },
  {
    tag: 'lower_back',
    pattern: /(levantamento terra|deadlift|good morning|bom dia|remada curvada livre|remada curvada com barra|agachamento livre com barra|stiff com barra)/,
    reason: 'Alta compressão/cisalhamento axial lombar contraindicado para histórico de coluna/lombar.',
  },
  {
    tag: 'elbow',
    pattern: /(triceps testa.*barra|skull crusher|frances pesado|rosca direta barra reta)/,
    reason: 'Torque elevado no tendão distal e epicôndilos para restrição de cotovelo.',
  },
  {
    tag: 'wrist',
    pattern: /(rosca direta barra reta|flexao de punho|flexao no solo|agachamento frontal barra)/,
    reason: 'Hiperextensão ou desvio ulnar rígido no punho contraindicado para restrição de punho.',
  },
  {
    tag: 'hip',
    pattern: /(agachamento sumo profundo|bulgaro profundo|afundo profundo)/,
    reason: 'Impacto femoroacetabular em flexão/rotação profunda para restrição de quadril.',
  },
  {
    tag: 'ankle_shin',
    pattern: /(box jump|salto|pliometric|jump squat|corrida no lugar)/,
    reason: 'Impacto excêntrico elevado contraindicado para canelite/tornozelo.',
  },
];

export interface SafetyEvaluationResult {
  safe: boolean;
  reasons: string[];
  restrictionHit?: RestrictionTag;
  missingEquipment?: EquipmentCategory;
}

/**
 * Avalia deterministicamente se um exercício respeita restrições articulares e equipamentos disponíveis.
 */
export function isExerciseSafeForAthlete(
  exerciseName: string,
  _movementPattern: string | null | undefined,
  restrictions: RestrictionTag[],
  equipment: EquipmentCategory[]
): SafetyEvaluationResult {
  const norm = normalizeSafetyText(exerciseName);
  const reasons: string[] = [];
  let restrictionHit: RestrictionTag | undefined;
  let missingEquipment: EquipmentCategory | undefined;

  if (restrictions.length > 0) {
    for (const rule of CONTRAINDICATION_RULES) {
      if (restrictions.includes(rule.tag) && rule.pattern.test(norm)) {
        reasons.push(rule.reason);
        restrictionHit = rule.tag;
        break;
      }
    }
  }

  if (equipment.length > 0 && equipment.length < ALL_EQUIPMENT_CATEGORIES.length) {
    const required = detectRequiredEquipment(exerciseName);
    if (!equipment.includes(required)) {
      missingEquipment = required;
      reasons.push(`Requer equipamento "${required}" não listado como disponível no perfil.`);
    }
  }

  return {
    safe: reasons.length === 0,
    reasons,
    restrictionHit,
    missingEquipment,
  };
}

/**
 * Filtra sugestões de substituição mantendo apenas opções seguras e compatíveis com equipamentos.
 */
export function filterSwapRecommendations<T extends { title: string; reason: string }>(
  recommendations: T[],
  movementPattern: string | null | undefined,
  restrictions: RestrictionTag[],
  equipment: EquipmentCategory[]
): {
  safe: T[];
  blocked: Array<{ title: string; reasons: string[] }>;
} {
  const safe: T[] = [];
  const blocked: Array<{ title: string; reasons: string[] }> = [];

  for (const rec of recommendations) {
    const check = isExerciseSafeForAthlete(rec.title, movementPattern, restrictions, equipment);
    if (check.safe) {
      safe.push(rec);
    } else {
      blocked.push({ title: rec.title, reasons: check.reasons });
    }
  }

  return { safe, blocked };
}

interface SafePoolEntry {
  patterns: string[];
  title: string;
  movementPattern: string;
}

const SAFE_EXERCISE_POOL: SafePoolEntry[] = [
  // Horizontal Push
  { patterns: ['horizontal_push', 'chest'], title: 'Supino Máquina Articulado', movementPattern: 'horizontal_push' },
  { patterns: ['horizontal_push', 'chest'], title: 'Supino com Halteres no Banco', movementPattern: 'horizontal_push' },
  { patterns: ['horizontal_push', 'chest'], title: 'Crossover na Polia Média', movementPattern: 'horizontal_push' },
  { patterns: ['horizontal_push', 'chest'], title: 'Flexão de Braços no Banco ou Solo', movementPattern: 'horizontal_push' },
  { patterns: ['horizontal_push', 'chest'], title: 'Supino Reto com Barra', movementPattern: 'horizontal_push' },
  // Vertical Push
  { patterns: ['vertical_push', 'shoulder'], title: 'Desenvolvimento Máquina Convergente', movementPattern: 'vertical_push' },
  { patterns: ['vertical_push', 'shoulder'], title: 'Desenvolvimento com Halteres Sentado', movementPattern: 'vertical_push' },
  { patterns: ['vertical_push', 'shoulder'], title: 'Elevação Lateral na Polia Baixa', movementPattern: 'lateral_raise' },
  { patterns: ['vertical_push', 'shoulder', 'lateral_raise'], title: 'Elevação Lateral com Halteres Sentado', movementPattern: 'lateral_raise' },
  // Vertical Pull
  { patterns: ['vertical_pull', 'pull'], title: 'Puxada Frontal no Pulley (Pegada Aberta)', movementPattern: 'vertical_pull' },
  { patterns: ['vertical_pull', 'pull'], title: 'Puxada no Pulley com Triângulo', movementPattern: 'vertical_pull' },
  { patterns: ['vertical_pull', 'pull'], title: 'Gravitron (Barra Fixa Assistida)', movementPattern: 'vertical_pull' },
  { patterns: ['vertical_pull', 'pull'], title: 'Barra Fixa (Pull-up)', movementPattern: 'vertical_pull' },
  // Horizontal Pull
  { patterns: ['horizontal_pull', 'row'], title: 'Remada Máquina Articulada (Peito Apoiado)', movementPattern: 'horizontal_pull' },
  { patterns: ['horizontal_pull', 'row'], title: 'Remada Baixa no Cabo com Triângulo', movementPattern: 'horizontal_pull' },
  { patterns: ['horizontal_pull', 'row'], title: 'Remada Peito Apoiado com Halteres no Banco Inclinado', movementPattern: 'horizontal_pull' },
  // Knee / Squat
  { patterns: ['squat', 'quad_isolation', 'lunge'], title: 'Leg Press 45°', movementPattern: 'squat' },
  { patterns: ['squat', 'quad_isolation', 'lunge'], title: 'Hack Squat Máquina', movementPattern: 'squat' },
  { patterns: ['squat', 'quad_isolation', 'lunge'], title: 'Cadeira Extensora', movementPattern: 'quad_isolation' },
  { patterns: ['squat', 'quad_isolation', 'lunge'], title: 'Afundo Estacionário com Halteres', movementPattern: 'lunge' },
  // Hinge / Hamstring / Glute
  { patterns: ['hinge', 'hamstring_isolation', 'glute'], title: 'Cadeira Flexora Sentado', movementPattern: 'hamstring_isolation' },
  { patterns: ['hinge', 'hamstring_isolation', 'glute'], title: 'Mesa Flexora', movementPattern: 'hamstring_isolation' },
  { patterns: ['hinge', 'glute'], title: 'Elevação Pélvica na Máquina', movementPattern: 'glute' },
  { patterns: ['hinge', 'glute'], title: 'Elevação Pélvica com Halter', movementPattern: 'glute' },
  { patterns: ['hinge'], title: 'Stiff com Halteres', movementPattern: 'hinge' },
  // Arms / Calves / Core
  { patterns: ['biceps', 'biceps_curl'], title: 'Rosca Martelo com Halteres', movementPattern: 'biceps_curl' },
  { patterns: ['biceps', 'biceps_curl'], title: 'Rosca na Polia Baixa com Corda', movementPattern: 'biceps_curl' },
  { patterns: ['biceps', 'biceps_curl'], title: 'Rosca Scott Máquina', movementPattern: 'biceps_curl' },
  { patterns: ['triceps', 'triceps_extension'], title: 'Tríceps Pulley com Corda', movementPattern: 'triceps_extension' },
  { patterns: ['triceps', 'triceps_extension'], title: 'Tríceps Coice com Halter', movementPattern: 'triceps_extension' },
  { patterns: ['triceps', 'triceps_extension'], title: 'Tríceps Máquina Guiada', movementPattern: 'triceps_extension' },
  { patterns: ['calf'], title: 'Panturrilha Sentado na Máquina', movementPattern: 'calf' },
  { patterns: ['calf'], title: 'Panturrilha Unilateral com Halter', movementPattern: 'calf' },
  { patterns: ['core'], title: 'Prancha Abdominal Isométrica', movementPattern: 'core' },
  { patterns: ['core'], title: 'Abdominal Supra na Polia Alta', movementPattern: 'core' },
];

export interface PlanExerciseLike {
  exerciseName: string;
  movementPattern: string;
  [key: string]: unknown;
}

export interface PlanDayLike<T extends PlanExerciseLike = PlanExerciseLike> {
  label: string;
  exercises: T[];
  [key: string]: unknown;
}

export interface SanitizedReplacementLog {
  dayLabel: string;
  originalExercise: string;
  replacementExercise: string;
  reasons: string[];
}

/**
 * Sanitiza um plano gerado pela IA substituindo exercícios inseguros para as restrições
 * ou incompatíveis com os equipamentos do atleta por equivalentes seguros.
 */
export function sanitizePlanPrescriptions<
  TEx extends PlanExerciseLike,
  TDay extends PlanDayLike<TEx>,
>(params: {
  days: TDay[];
  movementRestrictions?: unknown;
  injuryHistory?: unknown;
  availableEquipment?: unknown;
}): {
  sanitizedDays: TDay[];
  replacements: SanitizedReplacementLog[];
} {
  const restrictions = parseRestrictionTags(params.movementRestrictions, params.injuryHistory);
  const equipment = parseAvailableEquipment(params.availableEquipment);
  const replacements: SanitizedReplacementLog[] = [];

  if (restrictions.length === 0 && equipment.length === ALL_EQUIPMENT_CATEGORIES.length) {
    return { sanitizedDays: params.days, replacements };
  }

  const sanitizedDays = params.days.map((day) => {
    const usedTitles = new Set(day.exercises.map((e) => normalizeSafetyText(e.exerciseName)));
    const nextExercises = day.exercises.map((ex) => {
      const check = isExerciseSafeForAthlete(
        ex.exerciseName,
        ex.movementPattern,
        restrictions,
        equipment
      );
      if (check.safe) {
        return ex;
      }

      const normPat = normalizeSafetyText(ex.movementPattern).replace(/\s+/g, '_');
      const patternCandidates = SAFE_EXERCISE_POOL.filter((entry) =>
        entry.patterns.some((p) => normPat.includes(p) || p.includes(normPat))
      );
      const fallbackPool = patternCandidates.length > 0 ? patternCandidates : SAFE_EXERCISE_POOL;

      const safePick =
        fallbackPool.find((entry) => {
          if (usedTitles.has(normalizeSafetyText(entry.title))) return false;
          return isExerciseSafeForAthlete(
            entry.title,
            entry.movementPattern,
            restrictions,
            equipment
          ).safe;
        }) ||
        SAFE_EXERCISE_POOL.find(
          (entry) =>
            isExerciseSafeForAthlete(entry.title, entry.movementPattern, restrictions, equipment)
              .safe
        );

      if (!safePick) {
        return ex;
      }

      usedTitles.add(normalizeSafetyText(safePick.title));
      replacements.push({
        dayLabel: day.label,
        originalExercise: ex.exerciseName,
        replacementExercise: safePick.title,
        reasons: check.reasons,
      });

      return {
        ...ex,
        exerciseName: safePick.title,
        movementPattern: safePick.movementPattern,
        safetyReplacedFrom: ex.exerciseName,
      };
    });

    return {
      ...day,
      exercises: nextExercises,
    };
  });

  return { sanitizedDays, replacements };
}
