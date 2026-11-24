import { NextRequest, NextResponse, after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAuthorized, unauthorizedResponse } from '@/lib/auth';
import { Prisma } from '@prisma/client';
import { calculateKarvonenZones } from '@/lib/ai/running-prompts';
import { dayOfWeekName } from '@/lib/dates';

export const dynamic = 'force-dynamic';

function parsePaceToSeconds(val: unknown): number | null {
  if (typeof val === 'number') {
    return isNaN(val) ? null : Math.round(val);
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return null;
    if (trimmed.includes(':')) {
      const parts = trimmed.split(':');
      const min = parseInt(parts[0], 10);
      const sec = parseInt(parts[1], 10);
      if (!isNaN(min) && !isNaN(sec)) {
        return min * 60 + sec;
      }
    }
    const num = parseInt(trimmed, 10);
    if (!isNaN(num)) return num;
  }
  return null;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return unauthorizedResponse();
  }

  try {
    const profile = await prisma.runningProfile.findUnique({
      where: { id: 'singleton' },
      include: {
        runningPlans: {
          where: { status: 'active' },
          include: {
            sessions: {
              orderBy: [
                { weekNumber: 'asc' },
                { scheduledDate: 'asc' },
              ],
              include: {
                executions: {
                  orderBy: { date: 'desc' },
                },
              },
            },
          },
          take: 1,
        },
      },
    });

    if (profile?.runningPlans?.[0]?.sessions?.length) {
      const activeSessions = profile.runningPlans[0].sessions;
      const sessionIds = activeSessions.map((s) => s.id);

      const calendarEvents = await prisma.calendarEvent.findMany({
        where: {
          athleteProfileId: 'singleton',
          referenceModel: 'RunningSession',
          referenceId: { in: sessionIds },
        },
      });

      const eventBySessionId = new Map(calendarEvents.map((ev) => [ev.referenceId, ev]));
      let hasUpdates = false;
      const pendingSessionUpdates: Array<{ id: string; scheduledDate: string; dayOfWeek: string }> = [];
      const pendingMissingCalendarCreates: Array<{
        athleteProfileId: string;
        date: string;
        eventType: string;
        referenceId: string;
        referenceModel: string;
        title: string;
        status: 'planned';
        colorCode: string;
        sortOrder: number;
      }> = [];

      for (const session of activeSessions) {
        const calEvent = eventBySessionId.get(session.id);
        (session as unknown as Record<string, unknown>).calendarEventId = calEvent?.id || null;

        if (calEvent && calEvent.date && calEvent.date !== session.scheduledDate) {
          const newDayOfWeek = dayOfWeekName(calEvent.date);
          pendingSessionUpdates.push({
            id: session.id,
            scheduledDate: calEvent.date,
            dayOfWeek: newDayOfWeek,
          });
          session.scheduledDate = calEvent.date;
          session.dayOfWeek = newDayOfWeek;
          hasUpdates = true;
        } else if (!calEvent && session.status === 'planned') {
          pendingMissingCalendarCreates.push({
            athleteProfileId: 'singleton',
            date: session.scheduledDate,
            eventType: 'running',
            referenceId: session.id,
            referenceModel: 'RunningSession',
            title: session.title,
            status: 'planned',
            colorCode: '#10b981',
            sortOrder: 1,
          });
        }
      }

      if (pendingSessionUpdates.length > 0 || pendingMissingCalendarCreates.length > 0) {
        after(async () => {
          try {
            await prisma.$transaction(async (tx) => {
              for (const upd of pendingSessionUpdates) {
                await tx.runningSession.update({
                  where: { id: upd.id },
                  data: {
                    scheduledDate: upd.scheduledDate,
                    dayOfWeek: upd.dayOfWeek,
                  },
                });
              }
              if (pendingMissingCalendarCreates.length > 0) {
                await tx.calendarEvent.createMany({ data: pendingMissingCalendarCreates });
              }
            });
          } catch (syncErr) {
            console.warn('[Running Profile GET] Falha na reconciliação via after():', syncErr);
          }
        });
      }

      if (hasUpdates) {
        activeSessions.sort((a, b) => {
          if (a.weekNumber !== b.weekNumber) return a.weekNumber - b.weekNumber;
          return a.scheduledDate.localeCompare(b.scheduledDate);
        });
      }
    }

    return NextResponse.json({ profile });
  } catch (error) {
    console.error('[Running Profile] Erro ao buscar perfil:', error);
    return NextResponse.json(
      { error: 'Falha ao buscar perfil de corrida.' },
      { status: 500 }
    );
  }
}

const CANONICAL_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

const DAY_NAME_TO_CANONICAL: Record<string, string> = {
  // Portuguese
  seg: 'monday',
  segunda: 'monday',
  'segunda-feira': 'monday',
  ter: 'tuesday',
  terca: 'tuesday',
  terça: 'tuesday',
  'terca-feira': 'tuesday',
  'terça-feira': 'tuesday',
  qua: 'wednesday',
  quarta: 'wednesday',
  'quarta-feira': 'wednesday',
  qui: 'thursday',
  quinta: 'thursday',
  'quinta-feira': 'thursday',
  sex: 'friday',
  sexta: 'friday',
  'sexta-feira': 'friday',
  sab: 'saturday',
  sabado: 'saturday',
  sábado: 'saturday',
  dom: 'sunday',
  domingo: 'sunday',
  // English
  mon: 'monday',
  monday: 'monday',
  tue: 'tuesday',
  tues: 'tuesday',
  tuesday: 'tuesday',
  wed: 'wednesday',
  wednesday: 'wednesday',
  thu: 'thursday',
  thur: 'thursday',
  thurs: 'thursday',
  thursday: 'thursday',
  fri: 'friday',
  friday: 'friday',
  sat: 'saturday',
  saturday: 'saturday',
  sun: 'sunday',
  sunday: 'sunday',
};

function normalizeAvailableDays(val: unknown): { isValid: boolean; days: string[] | null } {
  if (val === undefined || val === null) {
    return { isValid: true, days: null };
  }

  if (!Array.isArray(val)) {
    return { isValid: false, days: null };
  }

  if (val.length === 0) {
    return { isValid: false, days: null };
  }

  const normalized = new Set<string>();
  for (const item of val) {
    if (typeof item === 'number' && item >= 0 && item <= 6) {
      normalized.add(CANONICAL_DAYS[item]);
    } else if (typeof item === 'string') {
      const clean = item.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (DAY_NAME_TO_CANONICAL[clean]) {
        normalized.add(DAY_NAME_TO_CANONICAL[clean]);
      } else if (!isNaN(Number(clean))) {
        const num = Number(clean);
        if (num >= 0 && num <= 6) {
          normalized.add(CANONICAL_DAYS[num]);
        }
      }
    }
  }

  if (normalized.size === 0) {
    return { isValid: false, days: null };
  }

  const sortedDays = CANONICAL_DAYS.filter((d) => normalized.has(d));
  return { isValid: true, days: sortedDays };
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return unauthorizedResponse();
  }

  try {
    const body = await req.json();

    const currentPace5kSec = parsePaceToSeconds(body.currentPace5kSec);
    const currentPace10kSec = parsePaceToSeconds(body.currentPace10kSec);
    const currentPaceHalfSec = parsePaceToSeconds(body.currentPaceHalfSec);
    const targetPaceSec = parsePaceToSeconds(body.targetPaceSec);

    const weeklyVolumeKm = body.weeklyVolumeKm ? Number(body.weeklyVolumeKm) : null;
    const maxHeartRate = body.maxHeartRate ? Number(body.maxHeartRate) : null;
    const restingHeartRate = body.restingHeartRate ? Number(body.restingHeartRate) : null;
    const targetDistanceKm = body.targetDistanceKm ? Number(body.targetDistanceKm) : null;
    const primaryObjective = body.primaryObjective ?? null;
    const primaryTerrain = body.primaryTerrain ?? null;
    const injuryHistory = body.injuryHistory ?? null;

    // Validate and normalize availableDays
    const parsedDays = normalizeAvailableDays(body.availableDays);
    if (!parsedDays.isValid) {
      return NextResponse.json(
        { error: 'Dias disponíveis inválidos. Selecione pelo menos 1 dia válido da semana para correr.' },
        { status: 400 }
      );
    }
    const availableDays = parsedDays.days;

    // Validate weeklyRunsTarget (integer between 2 and 5, or null)
    let weeklyRunsTarget: number | null = null;
    if (body.weeklyRunsTarget !== undefined && body.weeklyRunsTarget !== null && body.weeklyRunsTarget !== '') {
      const numTarget = Number(body.weeklyRunsTarget);
      if (!Number.isInteger(numTarget) || numTarget < 2 || numTarget > 5) {
        return NextResponse.json(
          { error: 'Meta semanal de corridas (weeklyRunsTarget) deve ser um número inteiro entre 2 e 5.' },
          { status: 400 }
        );
      }
      weeklyRunsTarget = numTarget;
    }

    let hrZones: Record<string, unknown> | null = null;
    if (maxHeartRate && restingHeartRate && maxHeartRate > restingHeartRate) {
      hrZones = calculateKarvonenZones(maxHeartRate, restingHeartRate);
    } else if (maxHeartRate && (!restingHeartRate || restingHeartRate <= 0)) {
      // Fallback with standard resting HR of 60 bpm
      hrZones = calculateKarvonenZones(maxHeartRate, 60);
    }

    const dataToSave = {
      currentPace5kSec,
      currentPace10kSec,
      currentPaceHalfSec,
      weeklyVolumeKm,
      maxHeartRate,
      restingHeartRate,
      primaryObjective,
      targetPaceSec,
      targetDistanceKm,
      primaryTerrain,
      availableDays: availableDays as unknown as Prisma.InputJsonValue,
      weeklyRunsTarget,
      injuryHistory: injuryHistory as unknown as Prisma.InputJsonValue,
      ...(hrZones ? { hrZones: hrZones as unknown as Prisma.InputJsonValue } : {}),
    };

    await prisma.athleteProfile.upsert({
      where: { id: 'singleton' },
      update: {},
      create: { id: 'singleton', sessionDurationMin: 60 },
    });

    const profile = await prisma.runningProfile.upsert({
      where: { id: 'singleton' },
      update: {
        athleteProfileId: 'singleton',
        ...dataToSave,
      },
      create: {
        id: 'singleton',
        athleteProfileId: 'singleton',
        ...dataToSave,
      },
      include: {
        runningPlans: {
          where: { status: 'active' },
          include: {
            sessions: true,
          },
          take: 1,
        },
      },
    });

    return NextResponse.json({
      success: true,
      profile,
    });
  } catch (error) {
    console.error('[Running Profile] Erro ao salvar perfil:', error);
    return NextResponse.json(
      { error: 'Falha ao salvar perfil de corrida.' },
      { status: 500 }
    );
  }
}
