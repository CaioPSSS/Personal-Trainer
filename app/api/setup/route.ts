import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { rebalanceWeekSchedule } from '@/lib/scheduling/strength-scheduler';

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
      availableDays,
      weeklyWorkoutsTarget,
    } = body;

    // 1. Upsert AthleteProfile for hypertrophy coaching
    const athleteProfile = await prisma.athleteProfile.upsert({
      where: { id: 'singleton' },
      update: {
        displayName: displayName !== undefined ? displayName : undefined,
        trainingAgeYears: trainingAgeYears ? parseFloat(String(trainingAgeYears)) : undefined,
        sessionDurationMin: sessionDurationMin ? parseInt(String(sessionDurationMin), 10) : undefined,
        athleteContext: athleteContext !== undefined ? athleteContext : undefined,
        availableEquipment: availableEquipment ? ((availableEquipment || []) as unknown as Prisma.InputJsonValue) : undefined,
        movementRestrictions: movementRestrictions !== undefined ? movementRestrictions : undefined,
        availableDays: availableDays !== undefined ? (availableDays as unknown as Prisma.InputJsonValue) : undefined,
        weeklyWorkoutsTarget: weeklyWorkoutsTarget !== undefined ? parseInt(String(weeklyWorkoutsTarget), 10) : undefined,
      },
      create: {
        id: 'singleton',
        displayName: displayName || null,
        trainingAgeYears: trainingAgeYears ? parseFloat(String(trainingAgeYears)) : null,
        sessionDurationMin: sessionDurationMin ? parseInt(String(sessionDurationMin), 10) : 60,
        athleteContext: athleteContext || null,
        availableEquipment: (availableEquipment || []) as unknown as Prisma.InputJsonValue,
        movementRestrictions: movementRestrictions || null,
        availableDays: availableDays !== undefined ? (availableDays as unknown as Prisma.InputJsonValue) : undefined,
        weeklyWorkoutsTarget: weeklyWorkoutsTarget !== undefined ? parseInt(String(weeklyWorkoutsTarget), 10) : undefined,
      },
    });

    // 2. Dynamically rebalance current week calendar if availableDays or weeklyWorkoutsTarget was updated
    let rebalanceSummary = null;
    if (availableDays !== undefined || weeklyWorkoutsTarget !== undefined) {
      try {
        rebalanceSummary = await rebalanceWeekSchedule('singleton');
      } catch (err) {
        console.warn('[Setup] Aviso: Falha ao rebalancear semana após atualização:', err);
      }
    }

    return NextResponse.json({
      profile: athleteProfile,
      rebalance: rebalanceSummary,
    });
  } catch (error) {
    console.error('Falha ao configurar perfil do atleta.', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500, statusText: 'Setup Error' }
    );
  }
}