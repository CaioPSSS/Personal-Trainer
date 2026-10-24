import { prisma } from '@/lib/prisma';
import { calculateRunningCalories, resolveAthleteWeightKg } from '@/lib/calories';
import { syncDayToMetabolicTracker } from '@/lib/integrations/metabolic-tracker';
import { diffISODays, shiftISODate } from '@/lib/dates';

export const STRAVA_CONFIG = {
  clientId: process.env.STRAVA_CLIENT_ID || '282597',
  clientSecret: process.env.STRAVA_CLIENT_SECRET || '08313dc56a1e7c8eed3875718b692f6d5f17f510',
  defaultAccessToken: 'b6e78228c3a7cdcde65cb65c004ebccbaca748a8',
  defaultRefreshToken: 'df5530b3e97651b1fa312cdc0b433fbffcd724fd',
  defaultExpiresAt: 1790536756,
  defaultAthleteId: 129158587,
  scope: 'read,activity:read_all',
  oauthTokenUrl: 'https://www.strava.com/oauth/token',
  oauthAuthorizeUrl: 'https://www.strava.com/oauth/authorize',
  apiBaseUrl: 'https://www.strava.com/api/v3',
};

export interface StravaSplitMetric {
  split: number;
  distance: number;
  elapsed_time: number;
  moving_time: number;
  elevation_difference?: number;
  average_speed: number;
  average_heartrate?: number;
  pace_zone?: number;
}

export interface StravaActivity {
  id: number | string;
  name?: string;
  distance: number; // in meters
  moving_time: number; // in seconds
  elapsed_time?: number; // in seconds
  total_elevation_gain?: number;
  type?: string;
  sport_type?: string;
  workout_type?: number | null;
  start_date?: string;
  start_date_local?: string;
  timezone?: string;
  average_speed?: number; // in m/s
  max_speed?: number;
  has_heartrate?: boolean;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  average_temp?: number;
  description?: string | null;
  splits_metric?: StravaSplitMetric[];
  [key: string]: unknown;
}

export interface MappedRunningExecution {
  stravaActivityId: string;
  date: string;
  source: 'strava';
  distanceKm: number;
  durationSeconds: number;
  avgPaceSec: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  cadenceAvg: number | null;
  elevationGainM: number | null;
  temperature: number | null;
  caloriesBurned: number | null;
  splits: Array<{
    km: number;
    distanceM: number;
    movingTimeSec: number;
    paceSec: number;
    avgHr: number | null;
    elevationDiffM: number | null;
  }> | null;
  title: string;
}

/**
 * Retrieves a valid Strava access token, initializing with default credentials if needed,
 * and refreshing via Strava OAuth if within 5 minutes of expiration.
 */
export async function getValidAccessToken(): Promise<string> {
  let integration = await prisma.stravaIntegration.findUnique({
    where: { id: 'singleton' },
  });

  if (!integration) {
    integration = await prisma.stravaIntegration.create({
      data: {
        id: 'singleton',
        accessToken: STRAVA_CONFIG.defaultAccessToken,
        refreshToken: STRAVA_CONFIG.defaultRefreshToken,
        expiresAt: STRAVA_CONFIG.defaultExpiresAt,
        athleteStravaId: STRAVA_CONFIG.defaultAthleteId,
        scope: 'read',
      },
    });
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  // Refresh if token has expired or is within 5 minutes (300 seconds) of expiry
  if (integration.expiresAt <= nowSeconds + 300) {
    const res = await fetch(STRAVA_CONFIG.oauthTokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: STRAVA_CONFIG.clientId,
        client_secret: STRAVA_CONFIG.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: integration.refreshToken,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Falha ao renovar token Strava: ${res.status} ${errText}`);
    }

    const data = await res.json();
    const updated = await prisma.stravaIntegration.update({
      where: { id: 'singleton' },
      data: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_at,
      },
    });

    return updated.accessToken;
  }

  return integration.accessToken;
}

/**
 * Generates OAuth2 authorization URL requesting read,activity:read_all permissions.
 */
export function getAuthorizationUrl(origin?: string): string {
  const baseAppUrl = (
    origin ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '');

  const redirectUri = `${baseAppUrl}/api/strava/callback`;
  const params = new URLSearchParams({
    client_id: STRAVA_CONFIG.clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    approval_prompt: 'auto',
    scope: STRAVA_CONFIG.scope,
  });

  return `${STRAVA_CONFIG.oauthAuthorizeUrl}?${params.toString()}`;
}

/**
 * Exchanges authorization code for access and refresh tokens, saving to database.
 */
export async function exchangeToken(code: string) {
  const res = await fetch(STRAVA_CONFIG.oauthTokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: STRAVA_CONFIG.clientId,
      client_secret: STRAVA_CONFIG.clientSecret,
      grant_type: 'authorization_code',
      code,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Strava exchange token failed: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const athleteId = data.athlete?.id ? Number(data.athlete.id) : STRAVA_CONFIG.defaultAthleteId;

  const upserted = await prisma.stravaIntegration.upsert({
    where: { id: 'singleton' },
    update: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_at,
      athleteStravaId: athleteId,
      scope: data.scope ?? STRAVA_CONFIG.scope,
    },
    create: {
      id: 'singleton',
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_at,
      athleteStravaId: athleteId,
      scope: data.scope ?? STRAVA_CONFIG.scope,
    },
  });

  return { tokenData: data, integration: upserted };
}

/**
 * Fetches detailed activity by ID from Strava v3 API.
 */
export async function getActivity(activityId: number | string): Promise<StravaActivity> {
  const token = await getValidAccessToken();
  const res = await fetch(`${STRAVA_CONFIG.apiBaseUrl}/activities/${activityId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Falha ao obter atividade ${activityId} do Strava: ${res.status} ${errText}`);
  }

  return (await res.json()) as StravaActivity;
}

/**
 * Fetches athlete activities list within optional timestamp range.
 */
export async function getAthleteActivities(
  after?: number,
  before?: number,
  perPage = 30
): Promise<StravaActivity[]> {
  const token = await getValidAccessToken();
  const params = new URLSearchParams();
  if (after) params.append('after', String(after));
  if (before) params.append('before', String(before));
  params.append('per_page', String(perPage));

  const res = await fetch(`${STRAVA_CONFIG.apiBaseUrl}/athlete/activities?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Falha ao obter atividades do Strava: ${res.status} ${errText}`);
  }

  return (await res.json()) as StravaActivity[];
}

/**
 * Pure transformation helper mapping Strava API activity payload to internal RunningExecution fields.
 */
export function mapStravaActivityToExecution(activity: StravaActivity): MappedRunningExecution {
  const distanceKm = Number(((activity.distance || 0) / 1000).toFixed(2));
  const durationSeconds = activity.moving_time ?? activity.elapsed_time ?? 0;

  // Pace: average_speed is in meters/second. Pace in sec/km = 1000 / average_speed
  let avgPaceSec: number | null = null;
  if (activity.average_speed && activity.average_speed > 0) {
    avgPaceSec = Math.round(1000 / activity.average_speed);
  } else if (distanceKm > 0 && durationSeconds > 0) {
    avgPaceSec = Math.round(durationSeconds / distanceKm);
  }

  // Heart rate
  const avgHeartRate =
    activity.has_heartrate && activity.average_heartrate != null
      ? Math.round(activity.average_heartrate)
      : null;
  const maxHeartRate =
    activity.has_heartrate && activity.max_heartrate != null
      ? Math.round(activity.max_heartrate)
      : null;

  // Cadence: Strava provides single-leg revolutions. Steps per minute (SPM) = cadence * 2
  const cadenceAvg =
    activity.average_cadence != null ? Math.round(activity.average_cadence * 2) : null;

  const elevationGainM =
    activity.total_elevation_gain != null ? Number(activity.total_elevation_gain) : null;
  const temperature = activity.average_temp != null ? Number(activity.average_temp) : null;

  // Calories extraction: Strava provides calories or kilojoules
  let caloriesBurned: number | null = null;
  if (activity.calories != null && Number(activity.calories) > 0) {
    caloriesBurned = Math.round(Number(activity.calories));
  } else if (activity.kilojoules != null && Number(activity.kilojoules) > 0) {
    caloriesBurned = Math.round(Number(activity.kilojoules));
  }

  // Splits extraction
  let splits: MappedRunningExecution['splits'] = null;
  if (activity.splits_metric && activity.splits_metric.length > 0) {
    splits = activity.splits_metric.map((s) => {
      let paceSec = 0;
      if (s.average_speed && s.average_speed > 0) {
        paceSec = Math.round(1000 / s.average_speed);
      } else if (s.distance > 0 && s.moving_time > 0) {
        paceSec = Math.round(s.moving_time / (s.distance / 1000));
      }
      return {
        km: s.split,
        distanceM: s.distance,
        movingTimeSec: s.moving_time,
        paceSec,
        avgHr: s.average_heartrate != null ? Math.round(s.average_heartrate) : null,
        elevationDiffM:
          s.elevation_difference != null ? Math.round(s.elevation_difference) : null,
      };
    });
  }

  const date = (
    activity.start_date_local ||
    activity.start_date ||
    new Date().toISOString()
  ).split('T')[0];

  return {
    stravaActivityId: String(activity.id),
    date,
    source: 'strava',
    distanceKm,
    durationSeconds,
    avgPaceSec,
    avgHeartRate,
    maxHeartRate,
    cadenceAvg,
    elevationGainM,
    temperature,
    caloriesBurned,
    splits,
    title: activity.name || 'Corrida (Strava)',
  };
}


// ============================================
// SYNC / RECONCILIATION HELPERS
// ============================================

export function isRunActivity(activity: Pick<StravaActivity, 'type' | 'sport_type'>): boolean {
  const runTypes = new Set(['Run', 'VirtualRun', 'TrailRun']);
  return runTypes.has(String(activity.type ?? '')) || runTypes.has(String(activity.sport_type ?? ''));
}

/**
 * Pure heuristic: two run records describe the same physical run when they share the date
 * and their distances differ by at most max(300 m, 10%). Duration (when both present) must
 * be within max(5 min, 20%) to tolerate rough manual logging.
 */
export function isLikelySameRun(
  a: { date: string; distanceKm: number; durationSeconds?: number | null },
  b: { date: string; distanceKm: number; durationSeconds?: number | null }
): boolean {
  if (a.date !== b.date) return false;
  const maxDist = Math.max(a.distanceKm, b.distanceKm);
  const distTolerance = Math.max(0.3, maxDist * 0.1);
  if (Math.abs(a.distanceKm - b.distanceKm) > distTolerance) return false;

  if (a.durationSeconds && b.durationSeconds) {
    const maxDur = Math.max(a.durationSeconds, b.durationSeconds);
    const durTolerance = Math.max(300, maxDur * 0.2);
    if (Math.abs(a.durationSeconds - b.durationSeconds) > durTolerance) return false;
  }
  return true;
}

export interface PlannedSessionCandidate {
  id: string;
  /** Date where the session currently lives on the calendar (reflects drag-and-drop reschedules). */
  effectiveDate: string;
  totalDistanceKm?: number | null;
}

/**
 * Pure selector: prefers a session on the exact activity date; otherwise (when allowed) the
 * closest session within ±1 day. Ties are broken by the closest planned distance.
 */
export function pickBestSessionMatch(
  activityDate: string,
  distanceKm: number,
  candidates: PlannedSessionCandidate[],
  allowAdjacentDays: boolean
): string | null {
  const byDistance = (a: PlannedSessionCandidate, b: PlannedSessionCandidate) =>
    Math.abs((a.totalDistanceKm ?? distanceKm) - distanceKm) -
    Math.abs((b.totalDistanceKm ?? distanceKm) - distanceKm);

  const exact = candidates.filter((c) => c.effectiveDate === activityDate).sort(byDistance);
  if (exact.length > 0) return exact[0].id;
  if (!allowAdjacentDays) return null;

  const adjacent = candidates
    .filter((c) => diffISODays(c.effectiveDate, activityDate) === 1)
    .sort(byDistance);
  return adjacent.length > 0 ? adjacent[0].id : null;
}

/**
 * Loads planned running sessions around a date, using the CalendarEvent date as the
 * effective date (so sessions rescheduled in the calendar are matched where they now live).
 */
export async function findPlannedSessionCandidates(date: string): Promise<PlannedSessionCandidate[]> {
  const window = [shiftISODate(date, -1), date, shiftISODate(date, 1)];

  const [plannedEvents, sessionsByScheduledDate] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: {
        athleteProfileId: 'singleton',
        eventType: 'running',
        referenceModel: 'RunningSession',
        status: 'planned',
        date: { in: window },
      },
      select: { referenceId: true, date: true },
    }),
    prisma.runningSession.findMany({
      where: { status: 'planned', scheduledDate: { in: window } },
      select: { id: true, scheduledDate: true, totalDistanceKm: true },
    }),
  ]);

  const eventDateBySession = new Map<string, string>();
  for (const ev of plannedEvents) {
    if (ev.referenceId) eventDateBySession.set(ev.referenceId, ev.date);
  }

  // Sessions whose calendar event was moved INTO the window but whose scheduledDate is outside it
  const missingIds = Array.from(eventDateBySession.keys()).filter(
    (id) => !sessionsByScheduledDate.some((s) => s.id === id)
  );
  const movedSessions =
    missingIds.length > 0
      ? await prisma.runningSession.findMany({
          where: { id: { in: missingIds }, status: 'planned' },
          select: { id: true, scheduledDate: true, totalDistanceKm: true },
        })
      : [];

  const candidates: PlannedSessionCandidate[] = [];
  for (const s of [...sessionsByScheduledDate, ...movedSessions]) {
    const effectiveDate = eventDateBySession.get(s.id) ?? s.scheduledDate;
    if (!window.includes(effectiveDate)) continue; // session was moved OUT of the window
    candidates.push({ id: s.id, effectiveDate, totalDistanceKm: s.totalDistanceKm });
  }
  return candidates;
}

/**
 * Guarantees exactly ONE completed CalendarEvent for a running execution, absorbing the
 * planned event of the linked session (if any) and deleting every redundant card.
 */
export async function harmonizeRunningCalendarEvents(params: {
  executionId: string;
  sessionId: string | null;
  date: string;
  /** When omitted, the existing card title is preserved. */
  title?: string;
  caloriesBurned: number | null;
}): Promise<void> {
  const { executionId, sessionId, date, title, caloriesBurned } = params;

  const [executionEvents, sessionEvents] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: { athleteProfileId: 'singleton', referenceId: executionId },
      orderBy: { createdAt: 'asc' },
    }),
    sessionId
      ? prisma.calendarEvent.findMany({
          where: {
            athleteProfileId: 'singleton',
            referenceId: sessionId,
            referenceModel: 'RunningSession',
          },
          orderBy: { createdAt: 'asc' },
        })
      : Promise.resolve([]),
  ]);

  const keep = executionEvents[0] ?? sessionEvents[0] ?? null;
  const data = {
    eventType: 'running',
    referenceId: executionId,
    referenceModel: 'RunningExecution',
    title,
    status: 'completed',
    colorCode: '#10b981',
    caloriesBurned,
    date,
  };

  if (keep) {
    await prisma.calendarEvent.update({ where: { id: keep.id }, data });
  } else {
    await prisma.calendarEvent.create({
      data: { ...data, title: title ?? 'Corrida', athleteProfileId: 'singleton', sortOrder: 1 },
    });
  }

  const redundantIds = [...executionEvents, ...sessionEvents]
    .map((e) => e.id)
    .filter((id) => id !== keep?.id);
  if (redundantIds.length > 0) {
    await prisma.calendarEvent.deleteMany({ where: { id: { in: redundantIds } } });
  }
}

/**
 * Fetches the DETAILED activity (`GET /activities/{id}`), which is the only Strava endpoint
 * that returns `calories` and `splits_metric`. The list endpoint (`/athlete/activities`)
 * omits both, which caused the app to fall back to the Margaria estimate.
 * Falls back to the summary payload on failure (e.g. rate limit).
 */
export async function fetchDetailedActivity(summary: StravaActivity): Promise<StravaActivity> {
  try {
    return await getActivity(summary.id);
  } catch (err) {
    console.warn(`[Strava] Falha ao obter detalhes da atividade ${summary.id}; usando resumo:`, err);
    return summary;
  }
}

export interface SyncActivityOutcome {
  execution: Awaited<ReturnType<typeof prisma.runningExecution.update>>;
  status: 'created' | 'updated' | 'merged';
  linkedSessionId: string | null;
  /** Dates whose daily totals changed and must be re-sent to the Metabolic Tracker. */
  affectedDates: string[];
}

export interface SyncActivityOptions {
  /** When true (default), re-sends the consolidated day to the Metabolic Tracker. */
  syncMetabolic?: boolean;
}

/**
 * Synchronizes a Strava activity into RunningExecution and CalendarEvent models (idempotent).
 *
 * - Existing record (same stravaActivityId): metrics are refreshed, the session link is preserved.
 *   It is NEVER re-matched, so re-syncs cannot steal neighbouring planned sessions.
 * - New record: if a manual run of the same day/distance exists, it is upgraded (merged)
 *   instead of creating a duplicate. Otherwise it's linked to the planned session of the day
 *   (honouring calendar reschedules), with ±1 day tolerance.
 * - Strava calories are authoritative; the Margaria estimate is only used when Strava has none
 *   and never overwrites a previously stored Strava value.
 */
export async function syncActivityRecord(
  activity: StravaActivity,
  options: SyncActivityOptions = {},
  attempt = 0
): Promise<SyncActivityOutcome | null> {
  const { syncMetabolic = true } = options;

  if (!isRunActivity(activity)) {
    // Activity changed to a non-run sport on Strava: drop the stale run if we had imported it
    await removeStravaActivity(activity.id, { syncMetabolic });
    return null;
  }

  // Ensure singleton athleteProfile and runningProfile exist
  await prisma.athleteProfile.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton', sessionDurationMin: 60 },
  });

  await prisma.runningProfile.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  });

  const mapped = mapStravaActivityToExecution(activity);

  // 1. Resolve target record: same Strava id, or a manual duplicate of the same run
  let status: SyncActivityOutcome['status'] = 'created';
  let target = await prisma.runningExecution.findUnique({
    where: { stravaActivityId: mapped.stravaActivityId },
  });

  if (target) {
    status = 'updated';
  } else {
    const manualSameDay = await prisma.runningExecution.findMany({
      where: { runningProfileId: 'singleton', date: mapped.date, stravaActivityId: null },
      orderBy: { createdAt: 'asc' },
    });
    const duplicate = manualSameDay.find((m) =>
      isLikelySameRun(
        { date: m.date, distanceKm: m.distanceKm, durationSeconds: m.durationSeconds },
        { date: mapped.date, distanceKm: mapped.distanceKm, durationSeconds: mapped.durationSeconds }
      )
    );
    if (duplicate) {
      target = duplicate;
      status = 'merged';
    }
  }

  // 2. Session link: keep existing; only match brand-new imports
  let linkedSessionId: string | null = target?.runningSessionId ?? null;
  if (!linkedSessionId && status !== 'updated') {
    const candidates = await findPlannedSessionCandidates(mapped.date);
    linkedSessionId = pickBestSessionMatch(mapped.date, mapped.distanceKm, candidates, true);
  } else if (!linkedSessionId && status === 'updated') {
    // Re-sync of an unlinked run: only accept an exact-date planned session (no ±1 day drift)
    const candidates = await findPlannedSessionCandidates(mapped.date);
    linkedSessionId = pickBestSessionMatch(mapped.date, mapped.distanceKm, candidates, false);
  }
  const linkedSession = linkedSessionId
    ? await prisma.runningSession.findUnique({ where: { id: linkedSessionId } })
    : null;
  if (!linkedSession) linkedSessionId = null;

  // 3. Calories: Strava value is authoritative, never overwritten by an estimate
  let finalCalories: number;
  let caloriesSource: 'strava' | 'estimated';
  if (mapped.caloriesBurned && mapped.caloriesBurned > 0) {
    finalCalories = mapped.caloriesBurned;
    caloriesSource = 'strava';
  } else if (target?.caloriesSource === 'strava' && target.caloriesBurned) {
    finalCalories = target.caloriesBurned;
    caloriesSource = 'strava';
  } else {
    const athleteWeight = await resolveAthleteWeightKg('singleton', mapped.date);
    finalCalories = calculateRunningCalories({
      athleteWeightKg: athleteWeight,
      distanceKm: mapped.distanceKm,
      elevationGainM: mapped.elevationGainM,
      durationSeconds: mapped.durationSeconds,
      avgHeartRate: mapped.avgHeartRate,
    }).totalCalories;
    caloriesSource = 'estimated';
  }

  const metrics = {
    source: 'strava',
    stravaActivityId: mapped.stravaActivityId,
    date: mapped.date,
    distanceKm: mapped.distanceKm,
    durationSeconds: mapped.durationSeconds,
    avgPaceSec: mapped.avgPaceSec,
    avgHeartRate: mapped.avgHeartRate,
    maxHeartRate: mapped.maxHeartRate,
    elevationGainM: mapped.elevationGainM,
    cadenceAvg: mapped.cadenceAvg,
    temperature: mapped.temperature,
    caloriesBurned: finalCalories,
    caloriesSource,
    runningSessionId: linkedSessionId,
    // Summary payloads have no splits: keep previously stored splits instead of wiping them
    ...(mapped.splits ? { splits: mapped.splits } : {}),
  };

  const previousDate = target?.date ?? null;
  let execution: SyncActivityOutcome['execution'];
  try {
    execution = target
      ? await prisma.runningExecution.update({
          where: { id: target.id },
          data: {
            ...metrics,
            notes: target.notes ?? (activity.description || activity.name || null),
          },
        })
      : await prisma.runningExecution.create({
          data: {
            ...metrics,
            runningProfileId: 'singleton',
            notes: activity.description || activity.name || null,
          },
        });
  } catch (err) {
    // Webhook and manual sync racing on the same activity: retry once as an update
    const code = (err as { code?: string })?.code;
    if (code === 'P2002' && attempt === 0) {
      return syncActivityRecord(activity, options, attempt + 1);
    }
    throw err;
  }

  // 4. Mark linked planned session as completed
  if (linkedSession && linkedSession.status !== 'completed') {
    await prisma.runningSession.update({
      where: { id: linkedSession.id },
      data: { status: 'completed' },
    });
  }

  // 5. Exactly one completed calendar card for this run
  const eventTitle = linkedSession
    ? `${linkedSession.title} (${mapped.distanceKm.toFixed(1)} km)`
    : `${activity.name || 'Corrida Strava'} (${mapped.distanceKm.toFixed(1)} km)`;

  await harmonizeRunningCalendarEvents({
    executionId: execution.id,
    sessionId: linkedSessionId,
    date: mapped.date,
    title: eventTitle,
    caloriesBurned: finalCalories,
  });

  const affectedDates = Array.from(
    new Set([mapped.date, ...(previousDate && previousDate !== mapped.date ? [previousDate] : [])])
  );

  // 6. Metabolic Tracker receives the consolidated TOTAL of each affected day
  if (syncMetabolic) {
    for (const d of affectedDates) {
      await syncDayToMetabolicTracker(d, { clearIfEmpty: d !== mapped.date });
    }
  }

  return { execution, status, linkedSessionId, affectedDates };
}

/**
 * Removes a Strava-imported run (activity deleted on Strava or changed to another sport),
 * reverting its planned session back to "planned" and restoring the planned calendar card.
 */
export async function removeStravaActivity(
  activityId: number | string,
  options: SyncActivityOptions = {}
): Promise<{ removed: boolean; date: string | null }> {
  const { syncMetabolic = true } = options;
  const execution = await prisma.runningExecution.findUnique({
    where: { stravaActivityId: String(activityId) },
  });
  if (!execution) return { removed: false, date: null };

  await prisma.calendarEvent.deleteMany({
    where: { athleteProfileId: 'singleton', referenceId: execution.id },
  });
  await prisma.runningExecution.delete({ where: { id: execution.id } });

  if (execution.runningSessionId) {
    await restoreSessionIfOrphan(execution.runningSessionId);
  }

  if (syncMetabolic) {
    await syncDayToMetabolicTracker(execution.date, { clearIfEmpty: true });
  }

  return { removed: true, date: execution.date };
}

/**
 * If a session has no executions left, reverts it to "planned" and guarantees a planned card.
 */
export async function restoreSessionIfOrphan(sessionId: string): Promise<boolean> {
  const remaining = await prisma.runningExecution.count({ where: { runningSessionId: sessionId } });
  if (remaining > 0) return false;

  const session = await prisma.runningSession.findUnique({ where: { id: sessionId } });
  if (!session || session.status === 'skipped') return false;

  if (session.status !== 'planned') {
    await prisma.runningSession.update({ where: { id: sessionId }, data: { status: 'planned' } });
  }

  const existing = await prisma.calendarEvent.findFirst({
    where: { athleteProfileId: 'singleton', referenceId: sessionId, referenceModel: 'RunningSession' },
  });
  if (existing) {
    if (existing.status !== 'planned') {
      await prisma.calendarEvent.update({
        where: { id: existing.id },
        data: { status: 'planned', caloriesBurned: null, title: session.title },
      });
    }
  } else {
    await prisma.calendarEvent.create({
      data: {
        athleteProfileId: 'singleton',
        date: session.scheduledDate,
        eventType: 'running',
        referenceId: session.id,
        referenceModel: 'RunningSession',
        title: session.title,
        status: 'planned',
        colorCode: '#10b981',
        sortOrder: 1,
      },
    });
  }
  return true;
}

/**
 * StravaClient class wrapper providing static methods
 */
export class StravaClient {
  static getValidToken = getValidAccessToken;
  static getValidAccessToken = getValidAccessToken;
  static getAuthorizationUrl = getAuthorizationUrl;
  static exchangeToken = exchangeToken;
  static getActivity = getActivity;
  static getAthleteActivities = getAthleteActivities;
  static mapStravaActivityToExecution = mapStravaActivityToExecution;
  static syncActivityRecord = syncActivityRecord;
  static removeStravaActivity = removeStravaActivity;
}
