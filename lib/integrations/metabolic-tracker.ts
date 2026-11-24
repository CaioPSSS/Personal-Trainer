import dns from 'node:dns';
import net from 'node:net';
import { prisma } from '@/lib/prisma';
import { isISODate } from '@/lib/dates';

export interface ActivitySyncPayload {
  date: string; // ISO "YYYY-MM-DD"
  caloriesBurned?: number;
  trainingType?: 'Musculação' | 'Corrida' | 'Híbrido' | 'Cross-Training' | 'Descanso' | string;
  workoutTitle?: string;
  durationMinutes?: number;
  sessionRpe?: number;
  sleepHours?: number | null;
  bodyWeightKg?: number | null;
  stressLevel?: number | null;
}

export interface DailyNutritionData {
  date: string;
  caloriesConsumed: number | null;
  proteinConsumed: number | null;
  currentCalorieTarget: number | null;
  dietGoal: 'loss' | 'maintenance' | 'gain' | string | null;
  weight: number | null;
  sleepHours?: number | null;
  stressLevel?: number | null;
  trainingType?: string | null;
  caloriesBurned?: number | null;
}

export interface SyncResult {
  success: boolean;
  offline?: boolean;
  error?: string;
  nutrition?: DailyNutritionData | null;
}

export interface MetabolicTrackerClientOptions {
  allowInsecureLocalhostForTest?: boolean;
}

export const DEFAULT_METABOLIC_URL = 'https://meu-rastreador-metabolico-p7xl.vercel.app';

function parseIPv4ToUint32(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet < 0 || octet > 255) return null;
    value = ((value << 8) | octet) >>> 0;
  }
  return value;
}

function isPrivateOrReservedIPv4Uint32(n: number): boolean {
  const b0 = (n >>> 24) & 0xff;
  const b1 = (n >>> 16) & 0xff;
  const b2 = (n >>> 8) & 0xff;

  if (b0 === 0) return true; // 0.0.0.0/8 ("this" network)
  if (b0 === 10) return true; // 10.0.0.0/8 (RFC1918)
  if (b0 === 100 && b1 >= 64 && b1 <= 127) return true; // 100.64.0.0/10 (CGNAT)
  if (b0 === 127) return true; // 127.0.0.0/8 (loopback)
  if (b0 === 169 && b1 === 254) return true; // 169.254.0.0/16 (link-local / cloud metadata)
  if (b0 === 172 && b1 >= 16 && b1 <= 31) return true; // 172.16.0.0/12 (RFC1918)
  if (b0 === 192 && b1 === 0 && b2 === 0) return true; // 192.0.0.0/24 (IETF protocol)
  if (b0 === 192 && b1 === 0 && b2 === 2) return true; // 192.0.2.0/24 (TEST-NET-1)
  if (b0 === 192 && b1 === 168) return true; // 192.168.0.0/16 (RFC1918)
  if (b0 === 198 && (b1 === 18 || b1 === 19)) return true; // 198.18.0.0/15 (benchmarking)
  if (b0 === 198 && b1 === 51 && b2 === 100) return true; // 198.51.100.0/24 (TEST-NET-2)
  if (b0 === 203 && b1 === 0 && b2 === 113) return true; // 203.0.113.0/24 (TEST-NET-3)
  if (b0 >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved/broadcast

  return false;
}

function expandIPv6Groups(rawIp: string): number[] | null {
  const withoutZone = rawIp.split('%')[0].toLowerCase();
  const doubleColonParts = withoutZone.split('::');
  if (doubleColonParts.length > 2) return null;

  const parseSide = (side: string): number[] | null => {
    if (!side) return [];
    const tokens = side.split(':');
    const out: number[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (!tok) return null;
      if (tok.includes('.')) {
        if (i !== tokens.length - 1) return null;
        const ipv4 = parseIPv4ToUint32(tok);
        if (ipv4 === null) return null;
        out.push((ipv4 >>> 16) & 0xffff, ipv4 & 0xffff);
      } else {
        if (!/^[0-9a-f]{1,4}$/.test(tok)) return null;
        out.push(parseInt(tok, 16));
      }
    }
    return out;
  };

  if (doubleColonParts.length === 1) {
    const groups = parseSide(doubleColonParts[0]);
    return groups && groups.length === 8 ? groups : null;
  }

  const left = parseSide(doubleColonParts[0]);
  const right = parseSide(doubleColonParts[1]);
  if (!left || !right || left.length + right.length >= 8) return null;

  const zerosNeeded = 8 - (left.length + right.length);
  return [...left, ...Array<number>(zerosNeeded).fill(0), ...right];
}

export function isPrivateOrReservedIp(ip: string): boolean {
  const cleaned = ip.trim().replace(/^\[|\]$/g, '').split('%')[0];
  const ipVersion = net.isIP(cleaned);

  if (ipVersion === 4) {
    const num = parseIPv4ToUint32(cleaned);
    return num === null ? true : isPrivateOrReservedIPv4Uint32(num);
  }

  if (ipVersion === 6) {
    const groups = expandIPv6Groups(cleaned);
    if (!groups) return true;

    const isAllZero = groups.every((g) => g === 0);
    if (isAllZero) return true; // ::

    const isLoopback = groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1;
    if (isLoopback) return true; // ::1

    const firstPrefixZero = groups.slice(0, 5).every((g) => g === 0);
    // IPv4-mapped (::ffff:a.b.c.d) or IPv4-compatible (::a.b.c.d)
    if (firstPrefixZero && (groups[5] === 0xffff || groups[5] === 0)) {
      const embeddedIpv4 = (((groups[6] & 0xffff) << 16) | (groups[7] & 0xffff)) >>> 0;
      return isPrivateOrReservedIPv4Uint32(embeddedIpv4);
    }

    // NAT64 64:ff9b::/96 & 64:ff9b:1::/48
    if (groups[0] === 0x0064 && groups[1] === 0xff9b) {
      if (groups[2] === 0 && groups[3] === 0 && groups[4] === 0 && groups[5] === 0) {
        const embeddedIpv4 = (((groups[6] & 0xffff) << 16) | (groups[7] & 0xffff)) >>> 0;
        return isPrivateOrReservedIPv4Uint32(embeddedIpv4);
      }
      return true;
    }

    const h0 = groups[0];
    if ((h0 & 0xfe00) === 0xfc00) return true; // fc00::/7 Unique Local
    if ((h0 & 0xffc0) === 0xfe80) return true; // fe80::/10 Link-Local
    if ((h0 & 0xff00) === 0xff00) return true; // ff00::/8 Multicast
    if (h0 === 0x0100 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0) return true; // 100::/64 discard
    if (h0 === 0x2001 && groups[1] === 0x0db8) return true; // 2001:db8::/32 documentation

    return false;
  }

  return true;
}

function isLocalHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return (
    !lower ||
    lower === 'localhost' ||
    lower.endsWith('.localhost') ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal') ||
    lower.endsWith('.home.arpa') ||
    !lower.includes('.') ||
    net.isIP(lower) !== 0
  );
}

export function getAllowedMetabolicHosts(): Set<string> {
  const hosts = new Set<string>([new URL(DEFAULT_METABOLIC_URL).hostname.toLowerCase()]);

  const envUrl = process.env.METABOLIC_TRACKER_URL?.trim();
  if (envUrl) {
    try {
      const parsed = new URL(envUrl);
      const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
      if (parsed.protocol === 'https:' && !isLocalHostname(host) && !host.includes('personal-trainer')) {
        hosts.add(host);
      }
    } catch {
      // Ignore invalid env URL
    }
  }

  const extra = process.env.METABOLIC_TRACKER_ALLOWED_HOSTS?.split(',') || [];
  for (const item of extra) {
    const clean = item.trim().toLowerCase().replace(/^\[|\]$/g, '');
    if (clean && !isLocalHostname(clean) && !clean.includes('personal-trainer')) {
      hosts.add(clean);
    }
  }

  return hosts;
}

export function validateMetabolicTrackerUrl(
  rawUrl: string,
  options: MetabolicTrackerClientOptions = {}
): { valid: true; normalizedUrl: string; hostname: string } | { valid: false; reason: string } {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return { valid: false, reason: 'URL do Rastreador Metabólico inválida.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { valid: false, reason: 'URL do Rastreador Metabólico malformada.' };
  }

  if (parsed.username || parsed.password) {
    return { valid: false, reason: 'Credenciais embutidas na URL não são permitidas.' };
  }

  if (parsed.search || parsed.hash) {
    return { valid: false, reason: 'A URL base não deve conter query string ou fragmento.' };
  }

  if (parsed.pathname && parsed.pathname !== '/') {
    return { valid: false, reason: 'Informe apenas a origem (domínio) do Rastreador Metabólico, sem caminho.' };
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();

  if (options.allowInsecureLocalhostForTest) {
    const isHttpsOrHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:';
    if (isHttpsOrHttp && (hostname === '127.0.0.1' || hostname === 'localhost')) {
      return { valid: true, normalizedUrl: parsed.origin, hostname };
    }
    return { valid: false, reason: 'Apenas localhost/127.0.0.1 é permitido em modo de teste.' };
  }

  if (parsed.protocol !== 'https:') {
    return { valid: false, reason: 'A URL do Rastreador Metabólico deve usar HTTPS.' };
  }

  if (isLocalHostname(hostname)) {
    return { valid: false, reason: 'Hosts locais, internos ou endereços IP diretos não são permitidos.' };
  }

  if (hostname.includes('personal-trainer')) {
    return { valid: false, reason: 'A URL não pode apontar para o próprio Personal Trainer.' };
  }

  if (!getAllowedMetabolicHosts().has(hostname)) {
    return {
      valid: false,
      reason: 'Domínio não autorizado para sincronização metabólica. Configure METABOLIC_TRACKER_ALLOWED_HOSTS no servidor.',
    };
  }

  return { valid: true, normalizedUrl: parsed.origin, hostname };
}

export async function assertSafeMetabolicUrl(
  rawUrl: string,
  options: MetabolicTrackerClientOptions = {}
): Promise<string> {
  const validated = validateMetabolicTrackerUrl(rawUrl, options);
  if (!validated.valid) {
    throw new Error(validated.reason);
  }

  if (!options.allowInsecureLocalhostForTest) {
    const resolved = await dns.promises.lookup(validated.hostname, { all: true });
    if (resolved.length === 0 || resolved.some((record) => isPrivateOrReservedIp(record.address))) {
      throw new Error('URL do Rastreador Metabólico resolve para endereço IP privado ou reservado.');
    }
  }

  return validated.normalizedUrl;
}

export function getCandidateSyncSecrets(): string[] {
  const candidates = [
    process.env.ECOSYSTEM_SYNC_SECRET,
    process.env.APP_PASSWORD,
    process.env.CRON_SECRET,
  ]
    .filter((v): v is string => Boolean(v && v.trim().length > 0))
    .map((v) => v.trim());

  return Array.from(new Set(candidates));
}

export async function getSyncConfig(options: MetabolicTrackerClientOptions = {}) {
  let url: string | undefined;
  const envUrl = process.env.METABOLIC_TRACKER_URL?.trim();

  if (envUrl) {
    const envCheck = validateMetabolicTrackerUrl(envUrl, options);
    if (envCheck.valid) {
      url = envCheck.normalizedUrl;
    }
  }

  if (!url) {
    try {
      const profile = await prisma.athleteProfile.findUnique({
        where: { id: 'singleton' },
        select: { metabolicTrackerUrl: true },
      });
      if (profile?.metabolicTrackerUrl) {
        const dbCheck = validateMetabolicTrackerUrl(profile.metabolicTrackerUrl, options);
        if (dbCheck.valid) {
          url = dbCheck.normalizedUrl;
        }
      }
    } catch {
      // ignore
    }
  }

  url = url || DEFAULT_METABOLIC_URL;
  const secrets = getCandidateSyncSecrets();
  const secret = secrets[0] ?? null;
  return { url, secret, secrets };
}

/**
 * Executa uma chamada autenticada para o Meu Rastreador Metabólico tentando
 * automaticamente os segredos candidatos configurados no servidor caso receba HTTP 401.
 */
export async function fetchFromMetabolicTracker(
  path: string,
  init: RequestInit = {},
  timeoutMs = 4000,
  options: MetabolicTrackerClientOptions = {}
): Promise<{ response: Response; url: string }> {
  const { url, secrets } = await getSyncConfig(options);
  const safeUrl = await assertSafeMetabolicUrl(url, options);

  if (secrets.length === 0) {
    throw new Error(
      'Nenhum segredo de sincronização metabólica configurado (defina ECOSYSTEM_SYNC_SECRET, APP_PASSWORD ou CRON_SECRET).'
    );
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  let lastResponse: Response | null = null;

  for (const token of secrets) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${token}`);
      headers.set('x-source-app', 'Personal-Trainer');

      const response = await fetch(`${safeUrl}${normalizedPath}`, {
        ...init,
        headers,
        redirect: 'error',
        signal: controller.signal,
      });

      lastResponse = response;

      // Se autenticou (ou deu outro status que não seja 401), retorna imediatamente
      if (response.status !== 401) {
        return { response, url: safeUrl };
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return { response: lastResponse!, url: safeUrl };
}

/**
 * Envia as atividades físicas e calorias gastas para o Meu Rastreador Metabólico.
 * Execução não-bloqueante e segura (timeout de 4s, nunca propaga exceção para a UI).
 */
export async function syncActivityToMetabolicTracker(
  payload: ActivitySyncPayload,
  options: MetabolicTrackerClientOptions = {}
): Promise<SyncResult> {
  try {
    const { response } = await fetchFromMetabolicTracker(
      '/api/integrations/trainer/activity',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
      4000,
      options
    );

    if (!response.ok) {
      console.warn(
        `[MetabolicSync] Falha no endpoint do Rastreador Metabólico (${response.status}): ${response.statusText}`
      );
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();

    // Se o Rastreador devolveu dados de nutrição e recuperação do dia, atualiza o cache local
    if (data.nutrition) {
      const n: DailyNutritionData = data.nutrition;
      try {
        await prisma.wellnessDaily.upsert({
          where: { athleteProfileId_date: { athleteProfileId: 'singleton', date: payload.date } },
          update: {
            caloriesConsumed: n.caloriesConsumed,
            proteinConsumed: n.proteinConsumed,
            calorieTarget: n.currentCalorieTarget,
            dietGoal: n.dietGoal,
            bodyWeightKg: n.weight ?? undefined,
            sleepHours: n.sleepHours ?? undefined,
            stressLevel: n.stressLevel ?? undefined,
          },
          create: {
            date: payload.date,
            athleteProfileId: 'singleton',
            caloriesConsumed: n.caloriesConsumed,
            proteinConsumed: n.proteinConsumed,
            calorieTarget: n.currentCalorieTarget,
            dietGoal: n.dietGoal,
            bodyWeightKg: n.weight,
            sleepHours: n.sleepHours,
            stressLevel: n.stressLevel,
          },
        });
      } catch (cacheErr) {
        console.warn('[MetabolicSync] Falha ao atualizar cache local de nutrição/wellness:', cacheErr);
      }
    }

    return {
      success: true,
      nutrition: data.nutrition || null,
    };
  } catch (err: unknown) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    console.warn(
      `[MetabolicSync] Rastreador Metabólico inacessível (${isAbort ? 'Timeout' : 'Offline'}):`,
      err instanceof Error ? err.message : err
    );
    return { success: false, offline: true };
  }
}

// ============================================
// DAILY AGGREGATE SYNC
// ============================================
//
// O endpoint /api/integrations/trainer/activity do Rastreador faz UPSERT por data e
// SOBRESCREVE `caloriesBurned` e `trainingType`. Portanto, nunca devemos enviar o gasto de
// uma única sessão: cada sync precisa carregar o TOTAL consolidado do dia (musculação +
// corrida + cross-training), senão a última atividade salva apaga as anteriores.

export type DailyActivityKind = 'strength' | 'running' | 'cross';

export interface DailyActivityAggregate {
  date: string;
  caloriesBurned: number;
  trainingType: ActivitySyncPayload['trainingType'];
  workoutTitle: string;
  durationMinutes?: number;
  sessionRpe?: number;
  activityCount: number;
}

/**
 * Pure helper: derives the tracker training type label from the set of activity kinds of the day.
 */
export function deriveDailyTrainingType(kinds: Iterable<DailyActivityKind>): string {
  const set = new Set(kinds);
  if (set.size === 0) return 'Descanso';
  if (set.size > 1) return 'Híbrido';
  const [only] = Array.from(set);
  if (only === 'strength') return 'Musculação';
  if (only === 'running') return 'Corrida';
  return 'Cross-Training';
}

/**
 * Builds the consolidated activity summary for a single day from the source-of-truth tables
 * (WorkoutExecution, RunningExecution, CrossTrainingActivity). Returns null if no activity.
 */
export async function buildDailyActivityAggregate(
  date: string
): Promise<DailyActivityAggregate | null> {
  const [workouts, runs, crossActivities] = await Promise.all([
    prisma.workoutExecution.findMany({
      where: { athleteProfileId: 'singleton', date, status: 'completed' },
      select: { caloriesBurned: true, durationMinutes: true, sessionRpe: true },
    }),
    prisma.runningExecution.findMany({
      where: { runningProfileId: 'singleton', date },
      select: {
        caloriesBurned: true,
        durationSeconds: true,
        sessionRpe: true,
        distanceKm: true,
      },
    }),
    prisma.crossTrainingActivity.findMany({
      where: { athleteProfileId: 'singleton', date, status: 'completed' },
      select: { caloriesBurned: true, durationMinutes: true, sessionRpe: true, title: true },
    }),
  ]);

  const activityCount = workouts.length + runs.length + crossActivities.length;
  if (activityCount === 0) return null;

  const kinds: DailyActivityKind[] = [];
  const titles: string[] = [];
  let calories = 0;
  let duration = 0;
  let rpeWeighted = 0;
  let rpeWeight = 0;

  for (const w of workouts) {
    kinds.push('strength');
    titles.push('Musculação');
    calories += w.caloriesBurned ?? 0;
    duration += w.durationMinutes ?? 0;
    if (w.sessionRpe != null && w.durationMinutes) {
      rpeWeighted += w.sessionRpe * w.durationMinutes;
      rpeWeight += w.durationMinutes;
    }
  }

  for (const r of runs) {
    kinds.push('running');
    titles.push(`Corrida ${r.distanceKm.toFixed(1)} km`);
    calories += r.caloriesBurned ?? 0;
    const min = Math.round(r.durationSeconds / 60);
    duration += min;
    if (r.sessionRpe != null && min > 0) {
      rpeWeighted += r.sessionRpe * min;
      rpeWeight += min;
    }
  }

  for (const c of crossActivities) {
    kinds.push('cross');
    titles.push(c.title || 'Cross-Training');
    calories += c.caloriesBurned ?? 0;
    duration += c.durationMinutes ?? 0;
    if (c.sessionRpe != null && c.durationMinutes) {
      rpeWeighted += c.sessionRpe * c.durationMinutes;
      rpeWeight += c.durationMinutes;
    }
  }

  return {
    date,
    caloriesBurned: Math.round(calories),
    trainingType: deriveDailyTrainingType(kinds),
    workoutTitle: titles.join(' + '),
    durationMinutes: duration > 0 ? duration : undefined,
    sessionRpe: rpeWeight > 0 ? Number((rpeWeighted / rpeWeight).toFixed(1)) : undefined,
    activityCount,
  };
}

export interface DaySyncExtras {
  sleepHours?: number | null;
  bodyWeightKg?: number | null;
  stressLevel?: number | null;
  /**
   * When true and the day has no activity left (e.g. a duplicated run was removed),
   * sends caloriesBurned=0 / 'Descanso' to clear stale values in the tracker.
   */
  clearIfEmpty?: boolean;
}

/**
 * Sends the consolidated (summed) activity of a day to the Metabolic Tracker.
 * Safe to call after any activity is created/updated/deleted. Never throws.
 */
export async function syncDayToMetabolicTracker(
  date: string,
  extras: DaySyncExtras = {}
): Promise<SyncResult> {
  try {
    const aggregate = await buildDailyActivityAggregate(date);
    const recovery = {
      ...(extras.sleepHours != null ? { sleepHours: extras.sleepHours } : {}),
      ...(extras.bodyWeightKg != null ? { bodyWeightKg: extras.bodyWeightKg } : {}),
      ...(extras.stressLevel != null ? { stressLevel: extras.stressLevel } : {}),
    };

    if (!aggregate) {
      if (extras.clearIfEmpty) {
        return await syncActivityToMetabolicTracker({
          date,
          caloriesBurned: 0,
          trainingType: 'Descanso',
          ...recovery,
        });
      }
      if (Object.keys(recovery).length > 0) {
        return await syncActivityToMetabolicTracker({ date, ...recovery });
      }
      return { success: true };
    }

    return await syncActivityToMetabolicTracker({
      date,
      caloriesBurned: aggregate.caloriesBurned,
      trainingType: aggregate.trainingType,
      workoutTitle: aggregate.workoutTitle,
      durationMinutes: aggregate.durationMinutes,
      sessionRpe: aggregate.sessionRpe,
      ...recovery,
    });
  } catch (err) {
    console.warn(`[MetabolicSync] Falha ao consolidar/sincronizar o dia ${date}:`, err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Sequentially syncs several days (deduplicated) to the Metabolic Tracker.
 */
export async function syncDaysToMetabolicTracker(
  dates: Iterable<string>,
  extras: Omit<DaySyncExtras, 'sleepHours' | 'bodyWeightKg' | 'stressLevel'> = {}
): Promise<number> {
  let ok = 0;
  for (const date of Array.from(new Set(dates)).sort()) {
    const res = await syncDayToMetabolicTracker(date, extras);
    if (res.success) ok++;
  }
  return ok;
}

/**
 * Consulta os dados de nutrição e recuperação de um dia específico no Rastreador Metabólico.
 */
export async function fetchDailyNutrition(
  date: string
): Promise<DailyNutritionData | null> {
  if (!isISODate(date)) {
    return null;
  }

  try {
    const { response } = await fetchFromMetabolicTracker(
      `/api/integrations/trainer/nutrition?date=${encodeURIComponent(date)}`,
      { method: 'GET' },
      4000
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (data.nutrition) {
      const n: DailyNutritionData = data.nutrition;
      // Atualiza cache local com nutrição e métricas de recuperação
      await prisma.wellnessDaily.upsert({
        where: { athleteProfileId_date: { athleteProfileId: 'singleton', date } },
        update: {
          caloriesConsumed: n.caloriesConsumed,
          proteinConsumed: n.proteinConsumed,
          calorieTarget: n.currentCalorieTarget,
          dietGoal: n.dietGoal,
          bodyWeightKg: n.weight ?? undefined,
          sleepHours: n.sleepHours ?? undefined,
          stressLevel: n.stressLevel ?? undefined,
        },
        create: {
          date,
          athleteProfileId: 'singleton',
          caloriesConsumed: n.caloriesConsumed,
          proteinConsumed: n.proteinConsumed,
          calorieTarget: n.currentCalorieTarget,
          dietGoal: n.dietGoal,
          bodyWeightKg: n.weight,
          sleepHours: n.sleepHours,
          stressLevel: n.stressLevel,
        },
      });
      return n;
    }
    return null;
  } catch {
    // Retorna do cache se o Rastreador estiver offline
    const cached = await prisma.wellnessDaily.findUnique({
      where: { athleteProfileId_date: { athleteProfileId: 'singleton', date } },
    });
    if (cached) {
      return {
        date,
        caloriesConsumed: cached.caloriesConsumed,
        proteinConsumed: cached.proteinConsumed,
        currentCalorieTarget: cached.calorieTarget,
        dietGoal: cached.dietGoal,
        weight: cached.bodyWeightKg,
        sleepHours: cached.sleepHours,
        stressLevel: cached.stressLevel,
      };
    }
    return null;
  }
}

/**
 * Reconcilia um período (ex: últimos 14 dias), enviando treinos pendentes
 * e importando dados de nutrição correspondentes.
 */
export async function reconcileEcosystemRange(
  startDate: string,
  endDate: string
): Promise<{
  syncedDaysCount: number;
  nutritionDaysImported: number;
  errors: string[];
}> {
  if (!isISODate(startDate) || !isISODate(endDate)) {
    return {
      syncedDaysCount: 0,
      nutritionDaysImported: 0,
      errors: ['Período inválido: datas devem estar no formato YYYY-MM-DD.'],
    };
  }

  const errors: string[] = [];
  let nutritionDaysImported = 0;
  let syncedDaysCount = 0;

  // 1. Descobre todos os dias com atividade no período (fontes de verdade, não o cache do calendário)
  const [workoutDays, runDays, crossDays, wellnessList] = await Promise.all([
    prisma.workoutExecution.findMany({
      where: { athleteProfileId: 'singleton', date: { gte: startDate, lte: endDate }, status: 'completed' },
      select: { date: true },
    }),
    prisma.runningExecution.findMany({
      where: { runningProfileId: 'singleton', date: { gte: startDate, lte: endDate } },
      select: { date: true },
    }),
    prisma.crossTrainingActivity.findMany({
      where: { athleteProfileId: 'singleton', date: { gte: startDate, lte: endDate }, status: 'completed' },
      select: { date: true },
    }),
    prisma.wellnessDaily.findMany({
      where: {
        athleteProfileId: 'singleton',
        date: { gte: startDate, lte: endDate },
      },
    }),
  ]);

  const wellnessMap = new Map(wellnessList.map((w) => [w.date, w]));
  const activeDates = new Set<string>([
    ...workoutDays.map((d) => d.date),
    ...runDays.map((d) => d.date),
    ...crossDays.map((d) => d.date),
  ]);

  // 2. Envia o total consolidado (soma de todas as atividades) de cada dia para o Rastreador
  for (const date of Array.from(activeDates).sort()) {
    const w = wellnessMap.get(date);
    const result = await syncDayToMetabolicTracker(date, {
      sleepHours: w?.sleepHours,
      bodyWeightKg: w?.bodyWeightKg,
      stressLevel: w?.stressLevel,
    });

    if (result.success) {
      syncedDaysCount++;
    } else if (result.error) {
      errors.push(`${date}: ${result.error}`);
    }
  }

  // 3. Pede ao Rastreador o bloco de nutrição do intervalo
  try {
    const { response: res } = await fetchFromMetabolicTracker(
      `/api/integrations/trainer/nutrition?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
      { method: 'GET' },
      5000
    );

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.items)) {
        for (const item of data.items as DailyNutritionData[]) {
          await prisma.wellnessDaily.upsert({
            where: { athleteProfileId_date: { athleteProfileId: 'singleton', date: item.date } },
            update: {
              caloriesConsumed: item.caloriesConsumed,
              proteinConsumed: item.proteinConsumed,
              calorieTarget: item.currentCalorieTarget,
              dietGoal: item.dietGoal,
              bodyWeightKg: item.weight ?? undefined,
              sleepHours: item.sleepHours ?? undefined,
              stressLevel: item.stressLevel ?? undefined,
            },
            create: {
              date: item.date,
              athleteProfileId: 'singleton',
              caloriesConsumed: item.caloriesConsumed,
              proteinConsumed: item.proteinConsumed,
              calorieTarget: item.currentCalorieTarget,
              dietGoal: item.dietGoal,
              bodyWeightKg: item.weight,
              sleepHours: item.sleepHours,
              stressLevel: item.stressLevel,
            },
          });
          nutritionDaysImported++;
        }
      }
    } else {
      errors.push(`Nutrição: HTTP ${res.status}`);
    }
  } catch (err) {
    errors.push(`Falha ao importar nutrição: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    syncedDaysCount,
    nutritionDaysImported,
    errors,
  };
}
