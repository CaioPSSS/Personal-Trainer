/**
 * Helpers de formatação e tradução PT-BR para tokens técnicos de domínio.
 */

const MOVEMENT_PATTERN_LABELS: Record<string, string> = {
  horizontal_push: 'Empurrar Horizontal',
  vertical_push: 'Empurrar Vertical',
  incline_push: 'Empurrar Inclinado',
  decline_push: 'Empurrar Declinado',
  horizontal_pull: 'Puxar Horizontal',
  vertical_pull: 'Puxar Vertical',
  squat: 'Padrão Agachamento',
  hinge: 'Dobradiça de Quadril',
  lunge: 'Avanço / Unilateral',
  quad_isolation: 'Isolamento de Quadríceps',
  hamstring_isolation: 'Isolamento de Posteriores',
  glute: 'Glúteos / Extensão de Quadril',
  glute_isolation: 'Isolamento de Glúteos',
  calf: 'Panturrilha',
  biceps: 'Bíceps',
  biceps_curl: 'Flexão de Cotovelo (Bíceps)',
  triceps: 'Tríceps',
  triceps_extension: 'Extensão de Cotovelo (Tríceps)',
  lateral_raise: 'Elevação Lateral (Deltoide Médio)',
  rear_delt: 'Deltoide Posterior',
  chest_isolation: 'Isolamento de Peitoral',
  adductor: 'Adutores',
  abductor: 'Abdutores',
  core: 'Core / Abdômen',
  carry: 'Transporte / Estabilização',
};

const HR_ZONE_LABELS: Record<string, string> = {
  zone1: 'Zona 1 (Regenerativo)',
  zone2: 'Zona 2 (Aeróbico Base)',
  zone3: 'Zona 3 (Tempo / Moderado)',
  zone4: 'Zona 4 (Limiar)',
  zone5: 'Zona 5 (VO2 Máx)',
  z1: 'Zona 1 (Regenerativo)',
  z2: 'Zona 2 (Aeróbico Base)',
  z3: 'Zona 3 (Tempo / Moderado)',
  z4: 'Zona 4 (Limiar)',
  z5: 'Zona 5 (VO2 Máx)',
};

export function formatMovementPattern(pattern?: string | null): string {
  if (!pattern || !pattern.trim()) return 'Geral';
  const normalized = pattern
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  if (MOVEMENT_PATTERN_LABELS[normalized]) {
    return MOVEMENT_PATTERN_LABELS[normalized];
  }

  return normalized
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function formatHrZone(zone?: string | null, compact = true): string {
  if (!zone || !zone.trim()) return 'Zona 2';
  const normalized = zone
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');

  const full = HR_ZONE_LABELS[normalized];
  if (full) {
    return compact ? full.split(' (')[0] : full;
  }

  const numMatch = normalized.match(/(?:zona?|z)(\d)/);
  if (numMatch) {
    return `Zona ${numMatch[1]}`;
  }

  return zone.trim();
}
