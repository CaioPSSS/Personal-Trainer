import { AssistantRecommendation } from '@/lib/ai/contracts';
import {
  filterSwapRecommendations,
  parseAvailableEquipment,
  parseRestrictionTags,
} from '@/lib/ai/safety-filter';

export interface StoredSubstitutionHints {
  objective?: string;
  originalExerciseName?: string;
  permanentReplacement?: {
    fromExercise: string;
    toExercise: string;
    objective: string;
    updatedAt: string;
  } | null;
  savedSuggestions?: AssistantRecommendation[];
}

export interface SwapHistoryRecord {
  id: string;
  requestedExercise: string;
  requestedPattern: string | null;
  suggestions: unknown;
  selectedIndex: number | null;
  createdAt?: Date | string;
}

export interface PermanentSwapSummaryItem {
  originalExercise: string;
  replacementExercise: string;
  movementPattern: string | null;
  objective: string;
  updatedAt: string | null;
}

export interface FrequentSwapSummaryItem {
  originalExercise: string;
  preferredSubstitute: string;
  movementPattern: string | null;
  swapCount: number;
  objective: string | null;
}

export interface ExerciseSubstitutionSummary {
  permanentSwaps: PermanentSwapSummaryItem[];
  frequentSwaps: FrequentSwapSummaryItem[];
  recentOneOffSwaps: Array<{
    date?: string;
    originalExercise: string;
    substitutedWith: string;
    movementPattern: string | null;
  }>;
}

export function normalizeTextKey(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function slugifyExerciseKey(exerciseName: string): string {
  const norm = normalizeTextKey(exerciseName);
  return norm.replace(/\s+/g, '_') || 'custom_exercise';
}

export function isSameExerciseName(a: string | null | undefined, b: string | null | undefined): boolean {
  const normA = normalizeTextKey(a);
  const normB = normalizeTextKey(b);
  return normA.length > 0 && normA === normB;
}

export function isSameObjective(
  targetObjective: string | null | undefined,
  savedObjective: string | null | undefined
): boolean {
  const normTarget = normalizeTextKey(targetObjective);
  const normSaved = normalizeTextKey(savedObjective);

  // If neither has an objective or one wasn't tagged yet (legacy saved suggestion), allow match
  if (!normTarget || !normSaved) {
    return true;
  }

  if (normTarget === normSaved) {
    return true;
  }

  return false;
}

export function parseRecommendationsJson(raw: unknown): AssistantRecommendation[] {
  if (!Array.isArray(raw)) return [];
  const valid: AssistantRecommendation[] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const title = typeof rec.title === 'string' ? rec.title.trim() : '';
    const reason = typeof rec.reason === 'string' ? rec.reason.trim() : '';
    if (!title || !reason) continue;

    const metadata =
      rec.metadata && typeof rec.metadata === 'object' && !Array.isArray(rec.metadata)
        ? (rec.metadata as Record<string, unknown>)
        : null;

    valid.push({
      title,
      reason,
      metadata,
    });
  }

  return valid;
}

export function parseSubstitutionHints(raw: unknown): StoredSubstitutionHints | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  const savedSuggestions = parseRecommendationsJson(obj.savedSuggestions);
  let permanentReplacement: StoredSubstitutionHints['permanentReplacement'] = null;

  if (obj.permanentReplacement && typeof obj.permanentReplacement === 'object' && !Array.isArray(obj.permanentReplacement)) {
    const pr = obj.permanentReplacement as Record<string, unknown>;
    if (typeof pr.fromExercise === 'string' && typeof pr.toExercise === 'string') {
      permanentReplacement = {
        fromExercise: pr.fromExercise,
        toExercise: pr.toExercise,
        objective: typeof pr.objective === 'string' ? pr.objective : '',
        updatedAt: typeof pr.updatedAt === 'string' ? pr.updatedAt : '',
      };
    }
  }

  return {
    objective: typeof obj.objective === 'string' ? obj.objective : undefined,
    originalExerciseName: typeof obj.originalExerciseName === 'string' ? obj.originalExerciseName : undefined,
    permanentReplacement,
    savedSuggestions,
  };
}

export function sortAndDedupeRecommendations(
  recommendations: AssistantRecommendation[]
): AssistantRecommendation[] {
  const seen = new Set<string>();
  const unique: AssistantRecommendation[] = [];

  for (const rec of recommendations) {
    const key = normalizeTextKey(rec.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(rec);
  }

  return unique
    .sort((a, b) => {
      const aPerm = a.metadata?.isPermanent ? 1 : 0;
      const bPerm = b.metadata?.isPermanent ? 1 : 0;
      if (bPerm !== aPerm) return bPerm - aPerm;

      const aCount = typeof a.metadata?.selectedCount === 'number' ? a.metadata.selectedCount : 0;
      const bCount = typeof b.metadata?.selectedCount === 'number' ? b.metadata.selectedCount : 0;
      return bCount - aCount;
    })
    .slice(0, 3);
}

export function tagRecommendationsWithObjective(
  recommendations: AssistantRecommendation[],
  objective: string,
  existingRecommendations?: AssistantRecommendation[]
): AssistantRecommendation[] {
  const existingMap = new Map<string, AssistantRecommendation>();
  if (existingRecommendations) {
    for (const ex of existingRecommendations) {
      existingMap.set(normalizeTextKey(ex.title), ex);
    }
  }

  return sortAndDedupeRecommendations(
    recommendations.map((rec) => {
      const prev = existingMap.get(normalizeTextKey(rec.title));
      const prevCount = typeof prev?.metadata?.selectedCount === 'number' ? prev.metadata.selectedCount : 0;
      const prevPerm = Boolean(prev?.metadata?.isPermanent);
      const prevLast = typeof prev?.metadata?.lastSelectedAt === 'string' ? prev.metadata.lastSelectedAt : undefined;

      return {
        title: rec.title.trim(),
        reason: rec.reason.trim(),
        metadata: {
          ...(rec.metadata || {}),
          objective,
          selectedCount: typeof rec.metadata?.selectedCount === 'number' ? rec.metadata.selectedCount : prevCount,
          isPermanent: typeof rec.metadata?.isPermanent === 'boolean' ? rec.metadata.isPermanent : prevPerm,
          ...(prevLast ? { lastSelectedAt: prevLast } : {}),
        },
      };
    })
  );
}

export function findSavedSwapSuggestions(params: {
  exerciseName: string;
  objective: string;
  prescriptionHints?: unknown;
  swapHistory: SwapHistoryRecord[];
}): {
  swapSuggestionId: string | null;
  recommendations: AssistantRecommendation[];
  permanentReplacement?: StoredSubstitutionHints['permanentReplacement'];
} | null {
  const { exerciseName, objective, prescriptionHints, swapHistory } = params;

  // 1. Check prescription's own substitutionHints first
  const parsedHints = parseSubstitutionHints(prescriptionHints);
  if (
    parsedHints &&
    parsedHints.savedSuggestions &&
    parsedHints.savedSuggestions.length > 0 &&
    isSameObjective(objective, parsedHints.objective)
  ) {
    // Also check if there is a matching SwapHistoryRecord to return its ID
    const matchingRecord = swapHistory.find((row) => isSameExerciseName(row.requestedExercise, exerciseName));
    return {
      swapSuggestionId: matchingRecord?.id ?? null,
      recommendations: sortAndDedupeRecommendations(parsedHints.savedSuggestions),
      permanentReplacement: parsedHints.permanentReplacement ?? null,
    };
  }

  // 2. Search ExerciseSwapSuggestion history for exact same exercise + exact same objective first
  for (const row of swapHistory) {
    if (!isSameExerciseName(row.requestedExercise, exerciseName)) continue;
    const recs = parseRecommendationsJson(row.suggestions);
    if (recs.length === 0) continue;

    const recObjective =
      typeof recs[0]?.metadata?.objective === 'string' ? recs[0].metadata.objective : undefined;

    if (recObjective && normalizeTextKey(recObjective) === normalizeTextKey(objective)) {
      const tagged = recs.map((r, idx) => {
        const currentCount = typeof r.metadata?.selectedCount === 'number' ? r.metadata.selectedCount : 0;
        const wasSelectedByIndex = row.selectedIndex === idx && currentCount === 0 ? 1 : currentCount;
        return {
          ...r,
          metadata: {
            ...(r.metadata || {}),
            objective: recObjective,
            selectedCount: wasSelectedByIndex,
          },
        };
      });
      return {
        swapSuggestionId: row.id,
        recommendations: sortAndDedupeRecommendations(tagged),
        permanentReplacement: parsedHints?.permanentReplacement ?? null,
      };
    }
  }

  // 3. Fallback to legacy saved suggestion for the exact same exercise where objective was not tagged yet
  for (const row of swapHistory) {
    if (!isSameExerciseName(row.requestedExercise, exerciseName)) continue;
    const recs = parseRecommendationsJson(row.suggestions);
    if (recs.length === 0) continue;

    const recObjective =
      typeof recs[0]?.metadata?.objective === 'string' ? recs[0].metadata.objective : undefined;

    if (!recObjective) {
      const tagged = recs.map((r, idx) => {
        const currentCount = typeof r.metadata?.selectedCount === 'number' ? r.metadata.selectedCount : 0;
        const wasSelectedByIndex = row.selectedIndex === idx && currentCount === 0 ? 1 : currentCount;
        return {
          ...r,
          metadata: {
            ...(r.metadata || {}),
            objective,
            selectedCount: wasSelectedByIndex,
          },
        };
      });
      return {
        swapSuggestionId: row.id,
        recommendations: sortAndDedupeRecommendations(tagged),
        permanentReplacement: parsedHints?.permanentReplacement ?? null,
      };
    }
  }

  return null;
}

export function recordSwapSelectionInSuggestions(params: {
  recommendations: AssistantRecommendation[];
  selectedTitle: string;
  selectedReason?: string;
  objective: string;
  isPermanent: boolean;
  nowISO: string;
}): {
  updatedRecommendations: AssistantRecommendation[];
  selectedIndex: number;
} {
  const { recommendations, selectedTitle, selectedReason, objective, isPermanent, nowISO } = params;
  const targetKey = normalizeTextKey(selectedTitle);

  let found = false;
  const updated = recommendations.map((rec) => {
    const isMatch = normalizeTextKey(rec.title) === targetKey;
    if (isMatch) {
      found = true;
      const prevCount = typeof rec.metadata?.selectedCount === 'number' ? rec.metadata.selectedCount : 0;
      return {
        ...rec,
        metadata: {
          ...(rec.metadata || {}),
          objective,
          selectedCount: prevCount + 1,
          lastSelectedAt: nowISO,
          isPermanent: isPermanent || Boolean(rec.metadata?.isPermanent),
        },
      };
    }
    return {
      ...rec,
      metadata: {
        ...(rec.metadata || {}),
        objective: typeof rec.metadata?.objective === 'string' ? rec.metadata.objective : objective,
        // If user set a new permanent replacement for this exercise, clear permanent flag on other options
        isPermanent: isPermanent ? false : Boolean(rec.metadata?.isPermanent),
      },
    };
  });

  if (!found && selectedTitle.trim()) {
    updated.unshift({
      title: selectedTitle.trim(),
      reason: selectedReason?.trim() || 'Substituto selecionado pelo atleta com equivalência biomecânica.',
      metadata: {
        objective,
        selectedCount: 1,
        lastSelectedAt: nowISO,
        isPermanent,
      },
    });
  }

  const sorted = sortAndDedupeRecommendations(updated);
  const selectedIndex = Math.max(
    0,
    sorted.findIndex((r) => normalizeTextKey(r.title) === targetKey)
  );

  return {
    updatedRecommendations: sorted,
    selectedIndex,
  };
}

export interface SwapSafetyContext {
  movementRestrictions?: unknown;
  injuryHistory?: unknown;
  availableEquipment?: unknown;
}

export function getBiomechanicalSwapFallback(
  exerciseName: string,
  movementPattern?: string | null,
  objective = '',
  safetyContext?: SwapSafetyContext
): AssistantRecommendation[] {
  const normEx = normalizeTextKey(exerciseName);
  const normPattern = normalizeTextKey(movementPattern);
  const combined = `${normEx} ${normPattern}`;

  let candidates: Array<{ title: string; reason: string }> = [];

  if (
    combined.includes('horizontal push') ||
    combined.includes('chest') ||
    combined.includes('supino') ||
    combined.includes('peito') ||
    combined.includes('crucifixo') ||
    combined.includes('peck deck') ||
    combined.includes('voador') ||
    combined.includes('crossover')
  ) {
    candidates = [
      {
        title: 'Supino Máquina Articulado',
        reason: 'Mesmo vetor de empurrar horizontal com alta estabilidade, excelente relação estímulo-fadiga (SFR) e ajuste imediato por pino.',
      },
      {
        title: 'Supino com Halteres no Banco',
        reason: 'Equivalência biomecânica direta com maior amplitude de alongamento peitoral e independência dos bancos de barra olímpica.',
      },
      {
        title: 'Crossover na Polia Média',
        reason: 'Tensão contínua em todo o arco de adução horizontal do ombro e setup rápido na estação de cabos.',
      },
      {
        title: 'Peck Deck / Voador Máquina',
        reason: 'Isolamento direto de peitoral com estabilidade máxima e transição rápida em horários de pico.',
      },
      {
        title: 'Supino Reto com Barra',
        reason: 'Padrão clássico de empurrar horizontal com alta capacidade de sobrecarga progressiva.',
      },
      {
        title: 'Flexão de Braços com Peso Corporal (Inclinada/Solo)',
        reason: 'Alternativa imediata com peso corporal mantendo o vetor de empurrar horizontal sem depender de equipamentos.',
      },
    ];
  } else if (
    combined.includes('vertical push') ||
    combined.includes('desenvolvimento') ||
    combined.includes('shoulder') ||
    combined.includes('ombro') ||
    combined.includes('elevacao lateral')
  ) {
    if (normEx.includes('lateral')) {
      candidates = [
        {
          title: 'Elevação Lateral na Polia Baixa',
          reason: 'Curva de resistência ascendente com tensão máxima no deltoide lateral desde o alongamento inicial.',
        },
        {
          title: 'Elevação Lateral com Halteres Sentado',
          reason: 'Elimina impulso de quadril, mantendo tensão estrita no deltoide medial com setup imediato.',
        },
        {
          title: 'Elevação Lateral Máquina',
          reason: 'Estabilidade guiada e ajuste rápido de carga para manter a densidade do treino.',
        },
      ];
    } else {
      candidates = [
        {
          title: 'Desenvolvimento Máquina Convergente',
          reason: 'Padrão de empurrar vertical com estabilidade guiada e menor demanda axial na coluna.',
        },
        {
          title: 'Desenvolvimento com Halteres Sentado',
          reason: 'Liberdade articular escapular no plano escapular com ativação equivalente de deltoide anterior e tríceps.',
        },
        {
          title: 'Desenvolvimento no Smith (Barra Guiada)',
          reason: 'Alta estabilidade para sobrecarga progressiva segura no deltoide anterior.',
        },
        {
          title: 'Elevação Frontal na Polia Baixa com Corda',
          reason: 'Opção segura no cabo para deltoide anterior mantendo controle articular contínuo.',
        },
      ];
    }
  } else if (
    combined.includes('vertical pull') ||
    combined.includes('puxada') ||
    combined.includes('pulldown') ||
    combined.includes('pulley') ||
    combined.includes('barra fixa') ||
    combined.includes('gravitron')
  ) {
    candidates = [
      {
        title: 'Puxada Frontal no Pulley (Pegada Aberta)',
        reason: 'Padrão de tração vertical direto para grande dorsal com ajuste rápido de carga na torre de pesos.',
      },
      {
        title: 'Puxada no Pulley com Triângulo (Pegada Neutra)',
        reason: 'Foco em extensão de ombro no plano sagital com excelente alongamento de latíssimo do dorso.',
      },
      {
        title: 'Gravitron (Barra Fixa Assistida)',
        reason: 'Equivalência direta de tração vertical com suporte ajustável e excelente controle de RIR/RPE.',
      },
      {
        title: 'Pulldown na Polia Alta com Corda',
        reason: 'Isolamento de grande dorsal em extensão de ombro com setup rápido em qualquer polia alta.',
      },
      {
        title: 'Barra Fixa (Pull-up / Chin-up)',
        reason: 'Padrão vertical com peso corporal caso não haja estação de polia ou máquinas disponíveis.',
      },
      {
        title: 'Pullover com Halter no Banco',
        reason: 'Trabalho eficaz de extensão de ombro para latíssimo usando apenas halter e banco.',
      },
    ];
  } else if (
    combined.includes('horizontal pull') ||
    combined.includes('remada') ||
    combined.includes('row') ||
    combined.includes('costas')
  ) {
    candidates = [
      {
        title: 'Remada Máquina Articulada (Peito Apoiado)',
        reason: 'Apoio torácico elimina fadiga lombar (alto SFR) mantendo tração horizontal intensa para dorsais e romboides.',
      },
      {
        title: 'Remada Baixa no Cabo com Triângulo',
        reason: 'Tensão constante e excelente fase excêntrica alongada na estação de polia baixa.',
      },
      {
        title: 'Remada Unilateral com Halter (Serrote)',
        reason: 'Setup imediato na área de pesos livres com grande amplitude de retração e extensão escapular.',
      },
      {
        title: 'Remada Peito Apoiado com Halteres no Banco Inclinado',
        reason: 'Zero sobrecarga axial na coluna e alta especificidade para espessura de costas.',
      },
      {
        title: 'Remada Curvada com Barra',
        reason: 'Alternativa livre com barra para tração horizontal de alto recrutamento dorsal.',
      },
    ];
  } else if (
    combined.includes('squat') ||
    combined.includes('knee') ||
    combined.includes('agachamento') ||
    combined.includes('leg press') ||
    combined.includes('hack') ||
    combined.includes('extensora') ||
    combined.includes('quadriceps') ||
    combined.includes('afundo') ||
    combined.includes('bulgaro')
  ) {
    candidates = [
      {
        title: 'Hack Squat Máquina',
        reason: 'Estabilidade máxima de tronco com dominante de joelho puro para quadríceps e menor fadiga sistêmica.',
      },
      {
        title: 'Leg Press 45°',
        reason: 'Alta capacidade de sobrecarga mecânica nos extensores do joelho e glúteos sem compressão axial na coluna.',
      },
      {
        title: 'Agachamento no Smith (Barra Guiada)',
        reason: 'Permite posicionar os pés à frente para enfatizar quadríceps com segurança e estabilidade.',
      },
      {
        title: 'Cadeira Extensora',
        reason: 'Isolamento direto do reto femoral e vastos com ajuste instantâneo por pino.',
      },
      {
        title: 'Afundo Estacionário com Halteres',
        reason: 'Alternativa unilateral com halteres mantendo estímulo de quadríceps e glúteos sem depender de máquinas.',
      },
      {
        title: 'Elevação Pélvica com Halter',
        reason: 'Alternativa com menor estresse patelofemoral para preservar membros inferiores quando há desconforto no joelho.',
      },
    ];
  } else if (
    combined.includes('hinge') ||
    combined.includes('hip') ||
    combined.includes('posterior') ||
    combined.includes('flexora') ||
    combined.includes('stiff') ||
    combined.includes('terra') ||
    combined.includes('pelvica') ||
    combined.includes('gluteo')
  ) {
    candidates = [
      {
        title: 'Cadeira Flexora Sentado',
        reason: 'Trabalha os isquiotibiais em posição alongada (quadril fletido), maximizando hipertrofia mediada pelo alongamento.',
      },
      {
        title: 'Mesa Flexora',
        reason: 'Foco direto em flexão de joelho sem carga axial lombar e com setup imediato.',
      },
      {
        title: 'Stiff com Halteres',
        reason: 'Padrão de dobradiça de quadril com alongamento profundo de posteriores e glúteos, sem depender de gaiola ou barra olímpica.',
      },
      {
        title: 'Elevação Pélvica na Máquina',
        reason: 'Extensão de quadril com foco máximo em glúteo máximo e transição rápida.',
      },
      {
        title: 'Elevação Pélvica com Halter',
        reason: 'Extensão de quadril segura com apoio apenas de banco e halter, zero carga axial lombar.',
      },
    ];
  } else if (
    combined.includes('biceps') ||
    combined.includes('rosca') ||
    combined.includes('elbow flexion') ||
    combined.includes('curl')
  ) {
    candidates = [
      {
        title: 'Rosca Inclinada com Halteres (Banco 45°)',
        reason: 'Coloca a cabeça longa do bíceps em alongamento máximo com excelente estímulo hipertrófico.',
      },
      {
        title: 'Rosca na Polia Baixa com Corda',
        reason: 'Tensão contínua durante toda a curva de flexão de cotovelo com pegada neutra gentil para punhos e cotovelos.',
      },
      {
        title: 'Rosca Scott Máquina',
        reason: 'Estabiliza o úmero impedindo roubo de ombro, isolando o bíceps braquial.',
      },
      {
        title: 'Rosca Martelo com Halteres',
        reason: 'Foco sinergista em braquial e braquiorradial com pegada neutra e setup imediato nos halteres.',
      },
    ];
  } else if (
    combined.includes('triceps') ||
    combined.includes('elbow extension') ||
    combined.includes('frances') ||
    combined.includes('testa')
  ) {
    candidates = [
      {
        title: 'Tríceps Francês na Polia com Corda (Overhead)',
        reason: 'Enfatiza a cabeça longa do tríceps em posição alongada com tensão constante do cabo.',
      },
      {
        title: 'Tríceps Pulley com Corda',
        reason: 'Extensão de cotovelo de alta estabilidade e ajuste instantâneo na estação de cabos com conforto articular.',
      },
      {
        title: 'Tríceps Máquina Guiada',
        reason: 'Sobrecarga progressiva segura para as três cabeças do tríceps com suporte guiado.',
      },
      {
        title: 'Tríceps Coice com Halter',
        reason: 'Alternativa leve para extensão de cotovelo usando apenas halteres com baixo torque articular.',
      },
    ];
  } else {
    candidates = [
      {
        title: 'Variação Equivalente na Máquina Guiada',
        reason: 'Mantém o mesmo grupamento muscular alvo com estabilidade superior e setup rápido.',
      },
      {
        title: 'Variação Equivalente na Polia / Cabo',
        reason: 'Tensão constante em toda a amplitude de movimento sem fila de espera.',
      },
      {
        title: 'Variação Equivalente com Halteres',
        reason: 'Liberdade articular natural e acesso imediato na área de pesos livres.',
      },
      {
        title: 'Variação Equivalente com Peso Corporal',
        reason: 'Execução imediata sem depender de equipamentos ocupados.',
      },
    ];
  }

  const nonDuplicate = candidates.filter((c) => !isSameExerciseName(c.title, exerciseName));

  if (safetyContext) {
    const restrictions = parseRestrictionTags(
      safetyContext.movementRestrictions,
      safetyContext.injuryHistory
    );
    const equipment = parseAvailableEquipment(safetyContext.availableEquipment);
    const { safe } = filterSwapRecommendations(
      nonDuplicate,
      movementPattern,
      restrictions,
      equipment
    );
    if (safe.length > 0) {
      return tagRecommendationsWithObjective(safe.slice(0, 3), objective);
    }
    // Second pass: keep injury restrictions enforced even if equipment has to relax
    const { safe: safeRespectingInjuries } = filterSwapRecommendations(
      nonDuplicate,
      movementPattern,
      restrictions,
      []
    );
    if (safeRespectingInjuries.length > 0) {
      return tagRecommendationsWithObjective(safeRespectingInjuries.slice(0, 3), objective);
    }
  }

  return tagRecommendationsWithObjective(nonDuplicate.slice(0, 3), objective);
}

export function buildExerciseSubstitutionSummary(params: {
  swapSuggestions: SwapHistoryRecord[];
  activeMesocycle?: {
    objective?: string | null;
    workoutDays?: Array<{
      prescriptions?: Array<{
        exerciseName: string;
        movementPattern: string;
        substitutionHints?: unknown;
      }>;
    }>;
  } | null;
  recentWorkouts: Array<{
    date?: string;
    exerciseExecutions?: Array<{
      exerciseName: string;
      movementPattern?: string | null;
      substitutedFrom?: string | null;
    }>;
  }>;
}): ExerciseSubstitutionSummary {
  const { swapSuggestions, activeMesocycle, recentWorkouts } = params;

  const permanentMap = new Map<string, PermanentSwapSummaryItem>();
  const swapCountsMap = new Map<
    string,
    {
      originalExercise: string;
      preferredSubstitute: string;
      movementPattern: string | null;
      swapCount: number;
      objective: string | null;
    }
  >();
  const recentOneOffSwaps: ExerciseSubstitutionSummary['recentOneOffSwaps'] = [];

  // 1. Inspect active mesocycle prescriptions for permanent replacements in substitutionHints
  const activeObjective = activeMesocycle?.objective ?? '';
  if (activeMesocycle?.workoutDays) {
    for (const day of activeMesocycle.workoutDays) {
      for (const rx of day.prescriptions ?? []) {
        const hints = parseSubstitutionHints(rx.substitutionHints);
        if (hints?.permanentReplacement) {
          const key = `${normalizeTextKey(hints.permanentReplacement.fromExercise)}::${normalizeTextKey(
            hints.permanentReplacement.objective || activeObjective
          )}`;
          permanentMap.set(key, {
            originalExercise: hints.permanentReplacement.fromExercise,
            replacementExercise: hints.permanentReplacement.toExercise,
            movementPattern: rx.movementPattern || null,
            objective: hints.permanentReplacement.objective || activeObjective,
            updatedAt: hints.permanentReplacement.updatedAt || null,
          });
        }
      }
    }
  }

  // 2. Inspect ExerciseSwapSuggestion records for permanent flags & selection counts
  for (const row of swapSuggestions) {
    const recs = parseRecommendationsJson(row.suggestions);
    for (const rec of recs) {
      const recObj = typeof rec.metadata?.objective === 'string' ? rec.metadata.objective : activeObjective;
      const count = typeof rec.metadata?.selectedCount === 'number' ? rec.metadata.selectedCount : 0;
      const isPerm = Boolean(rec.metadata?.isPermanent);

      if (isPerm) {
        const permKey = `${normalizeTextKey(row.requestedExercise)}::${normalizeTextKey(recObj)}`;
        if (!permanentMap.has(permKey)) {
          permanentMap.set(permKey, {
            originalExercise: row.requestedExercise,
            replacementExercise: rec.title,
            movementPattern: row.requestedPattern,
            objective: recObj,
            updatedAt: typeof rec.metadata?.lastSelectedAt === 'string' ? rec.metadata.lastSelectedAt : null,
          });
        }
      }

      if (count > 0 || isPerm) {
        const freqKey = `${normalizeTextKey(row.requestedExercise)}->${normalizeTextKey(rec.title)}`;
        const existing = swapCountsMap.get(freqKey);
        if (!existing || count > existing.swapCount) {
          swapCountsMap.set(freqKey, {
            originalExercise: row.requestedExercise,
            preferredSubstitute: rec.title,
            movementPattern: row.requestedPattern,
            swapCount: Math.max(count, isPerm ? 2 : 1),
            objective: recObj || null,
          });
        }
      }
    }
  }

  // 3. Inspect WorkoutExecution.exerciseExecutions for substitutedFrom occurrences
  const executionCounts = new Map<
    string,
    {
      originalExercise: string;
      preferredSubstitute: string;
      movementPattern: string | null;
      count: number;
    }
  >();

  for (const workout of recentWorkouts) {
    for (const ex of workout.exerciseExecutions ?? []) {
      if (!ex.substitutedFrom || isSameExerciseName(ex.substitutedFrom, ex.exerciseName)) continue;

      if (recentOneOffSwaps.length < 15) {
        recentOneOffSwaps.push({
          date: workout.date,
          originalExercise: ex.substitutedFrom,
          substitutedWith: ex.exerciseName,
          movementPattern: ex.movementPattern ?? null,
        });
      }

      const freqKey = `${normalizeTextKey(ex.substitutedFrom)}->${normalizeTextKey(ex.exerciseName)}`;
      const prev = executionCounts.get(freqKey);
      if (prev) {
        prev.count += 1;
      } else {
        executionCounts.set(freqKey, {
          originalExercise: ex.substitutedFrom,
          preferredSubstitute: ex.exerciseName,
          movementPattern: ex.movementPattern ?? null,
          count: 1,
        });
      }
    }
  }

  for (const [freqKey, execItem] of executionCounts.entries()) {
    const existing = swapCountsMap.get(freqKey);
    if (existing) {
      existing.swapCount = Math.max(existing.swapCount, execItem.count);
    } else {
      swapCountsMap.set(freqKey, {
        originalExercise: execItem.originalExercise,
        preferredSubstitute: execItem.preferredSubstitute,
        movementPattern: execItem.movementPattern,
        swapCount: execItem.count,
        objective: activeObjective || null,
      });
    }
  }

  const permanentSwaps = Array.from(permanentMap.values());
  const frequentSwaps = Array.from(swapCountsMap.values()).sort((a, b) => b.swapCount - a.swapCount);

  return {
    permanentSwaps,
    frequentSwaps,
    recentOneOffSwaps,
  };
}
