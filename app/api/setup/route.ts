import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export async function GET() {
  const profile = await prisma.athleteProfile.findUnique({ where: { id: 'singleton' } });
  return NextResponse.json(profile);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      displayName,
      trainingAgeYears,
      sessionDurationMin,
      athleteContext,
      availableEquipment,
      movementRestrictions,
    } = body;

    // 1. Upsert AthleteProfile for hypertrophy coaching
    const athleteProfile = await prisma.athleteProfile.upsert({
      where: { id: 'singleton' },
      update: {
        displayName: displayName || null,
        trainingAgeYears: trainingAgeYears ? parseFloat(String(trainingAgeYears)) : null,
        sessionDurationMin: sessionDurationMin ? parseInt(String(sessionDurationMin)) : 60,
        athleteContext: athleteContext || null,
        availableEquipment: (availableEquipment || []) as unknown as Prisma.InputJsonValue,
        movementRestrictions: movementRestrictions || null,
      },
      create: {
        id: 'singleton',
        displayName: displayName || null,
        trainingAgeYears: trainingAgeYears ? parseFloat(String(trainingAgeYears)) : null,
        sessionDurationMin: sessionDurationMin ? parseInt(String(sessionDurationMin)) : 60,
        athleteContext: athleteContext || null,
        availableEquipment: (availableEquipment || []) as unknown as Prisma.InputJsonValue,
        movementRestrictions: movementRestrictions || null,
      },
    });

    return NextResponse.json(athleteProfile);
  } catch (error) {
    console.error('Falha ao configurar perfil do atleta.', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500, statusText: 'Setup Error' }
    );
  }
}