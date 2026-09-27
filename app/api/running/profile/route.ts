import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { calculateKarvonenZones } from '@/lib/ai/running-prompts';

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

export async function GET() {
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
            },
          },
          take: 1,
        },
      },
    });

    return NextResponse.json({ profile });
  } catch (error) {
    console.error('[Running Profile] Erro ao buscar perfil:', error);
    return NextResponse.json(
      { error: 'Falha ao buscar perfil de corrida.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
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
    const availableDays = Array.isArray(body.availableDays) ? body.availableDays : null;
    const injuryHistory = body.injuryHistory ?? null;

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
      injuryHistory: injuryHistory as unknown as Prisma.InputJsonValue,
      ...(hrZones ? { hrZones: hrZones as unknown as Prisma.InputJsonValue } : {}),
    };

    const profile = await prisma.runningProfile.upsert({
      where: { id: 'singleton' },
      update: dataToSave,
      create: {
        id: 'singleton',
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
