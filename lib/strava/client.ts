import { prisma } from '@/lib/prisma';

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
    splits,
    title: activity.name || 'Corrida (Strava)',
  };
}

/**
 * Synchronizes a Strava activity into RunningExecution and CalendarEvent models.
 * Filters to Run or VirtualRun. Links and completes planned RunningSession if dates match.
 */
export async function syncActivityRecord(activity: StravaActivity) {
  const isRun =
    activity.type === 'Run' ||
    activity.type === 'VirtualRun' ||
    activity.sport_type === 'Run' ||
    activity.sport_type === 'TrailRun' ||
    activity.sport_type === 'VirtualRun';

  if (!isRun) {
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

  // Match planned session if date aligns
  const matchedSession = await prisma.runningSession.findFirst({
    where: {
      scheduledDate: mapped.date,
      status: 'planned',
    },
    orderBy: { createdAt: 'desc' },
  });

  const execution = await prisma.runningExecution.upsert({
    where: { stravaActivityId: mapped.stravaActivityId },
    update: {
      distanceKm: mapped.distanceKm,
      durationSeconds: mapped.durationSeconds,
      avgPaceSec: mapped.avgPaceSec,
      avgHeartRate: mapped.avgHeartRate,
      maxHeartRate: mapped.maxHeartRate,
      elevationGainM: mapped.elevationGainM,
      cadenceAvg: mapped.cadenceAvg,
      temperature: mapped.temperature,
      splits: mapped.splits ?? undefined,
      date: mapped.date,
      runningSessionId: matchedSession ? matchedSession.id : undefined,
    },
    create: {
      runningProfileId: 'singleton',
      runningSessionId: matchedSession ? matchedSession.id : null,
      date: mapped.date,
      source: 'strava',
      stravaActivityId: mapped.stravaActivityId,
      distanceKm: mapped.distanceKm,
      durationSeconds: mapped.durationSeconds,
      avgPaceSec: mapped.avgPaceSec,
      avgHeartRate: mapped.avgHeartRate,
      maxHeartRate: mapped.maxHeartRate,
      elevationGainM: mapped.elevationGainM,
      cadenceAvg: mapped.cadenceAvg,
      temperature: mapped.temperature,
      splits: mapped.splits ?? undefined,
      notes: activity.description || activity.name || null,
    },
  });

  // If matched planned session, mark session as completed
  if (matchedSession) {
    await prisma.runningSession.update({
      where: { id: matchedSession.id },
      data: { status: 'completed' },
    });
  }

  // Check if calendar event exists for this execution or matched session
  const existingEvent = await prisma.calendarEvent.findFirst({
    where: {
      OR: [
        { referenceId: execution.id, referenceModel: 'RunningExecution' },
        ...(matchedSession
          ? [{ referenceId: matchedSession.id, referenceModel: 'RunningSession' }]
          : []),
      ],
    },
  });

  const eventTitle = activity.name
    ? activity.name
    : matchedSession
    ? `${matchedSession.title} (${mapped.distanceKm.toFixed(1)} km)`
    : `Corrida Strava (${mapped.distanceKm.toFixed(1)} km)`;

  if (existingEvent) {
    await prisma.calendarEvent.update({
      where: { id: existingEvent.id },
      data: {
        eventType: 'running',
        referenceId: execution.id,
        referenceModel: 'RunningExecution',
        title: eventTitle,
        status: 'completed',
        colorCode: '#10b981',
      },
    });
  } else {
    await prisma.calendarEvent.create({
      data: {
        athleteProfileId: 'singleton',
        date: mapped.date,
        eventType: 'running',
        referenceId: execution.id,
        referenceModel: 'RunningExecution',
        title: eventTitle,
        status: 'completed',
        colorCode: '#10b981',
        sortOrder: 1,
      },
    });
  }

  return execution;
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
}
