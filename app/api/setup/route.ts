import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { isAuthorized, unauthorizedResponse } from '@/lib/auth';
import { isISODate, shiftISODate, todayISO } from '@/lib/dates';
import { validateMetabolicTrackerUrl } from '@/lib/integrations/metabolic-tracker';
import { rebalanceWeekSchedule } from '@/lib/scheduling/strength-scheduler';

interface ParsedNumberResult {
  provided: boolean;
  value?: number | null;
  error?: string;
}

function parseOptionalBoundedNumber(
  raw: unknown,
  label: string,
  min: number,
  max: number,
  integerOnly: boolean
): ParsedNumberResult {
  if (raw === undefined) {
    return { provided: false };
  }
  if (raw === null || raw === '') {
    return { provided: true, value: null };
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return { provided: true, error: `${label} deve ser um número válido.` };
  }
  if (integerOnly && !Number.isInteger(parsed)) {
    return { provided: true, error: `${label} deve ser um número inteiro.` };
  }
  if (parsed < min || parsed > max) {
    return { provided: true, error: `${label} deve estar entre ${min} e ${max}.` };
  }

  return { provided: true, value: parsed };
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return unauthorizedResponse();
  }

  const profile = await prisma.athleteProfile.findUnique({ where: { id: 'singleton' } });
  return NextResponse.json(profile);
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return unauthorizedResponse();
  }

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
      bodyWeightKg,
      heightCm,
      birthDate,
      biologicalSex,
      bodyFatPercent,
      metabolicTrackerUrl,
    } = body;

    const parsedTrainingAge = parseOptionalBoundedNumber(trainingAgeYears, 'Tempo de treino', 0, 80, false);
    const parsedSessionDuration = parseOptionalBoundedNumber(sessionDurationMin, 'Duração da sessão', 15, 240, true);
    const parsedWeeklyTarget = parseOptionalBoundedNumber(weeklyWorkoutsTarget, 'Meta semanal de treinos', 1, 7, true);
    const parsedWeight = parseOptionalBoundedNumber(bodyWeightKg, 'Peso corporal', 25, 300, false);
    const parsedHeight = parseOptionalBoundedNumber(heightCm, 'Altura', 100, 250, true);
    const parsedBodyFat = parseOptionalBoundedNumber(bodyFatPercent, 'Percentual de gordura', 2, 70, false);

    const numberErrors = [
      parsedTrainingAge,
      parsedSessionDuration,
      parsedWeeklyTarget,
      parsedWeight,
      parsedHeight,
      parsedBodyFat,
    ]
      .map((r) => r.error)
      .filter((e): e is string => Boolean(e));

    if (numberErrors.length > 0) {
      return NextResponse.json({ error: numberErrors[0] }, { status: 400 });
    }

    if (birthDate !== undefined && birthDate !== null && birthDate !== '' && !isISODate(String(birthDate))) {
      return NextResponse.json(
        { error: 'Data de nascimento deve estar no formato YYYY-MM-DD.' },
        { status: 400 }
      );
    }

    let normalizedMetabolicUrl: string | null | undefined;
    if (metabolicTrackerUrl !== undefined) {
      if (metabolicTrackerUrl === null || String(metabolicTrackerUrl).trim() === '') {
        normalizedMetabolicUrl = null;
      } else {
        const validation = validateMetabolicTrackerUrl(String(metabolicTrackerUrl));
        if (!validation.valid) {
          return NextResponse.json({ error: validation.reason }, { status: 400 });
        }
        normalizedMetabolicUrl = validation.normalizedUrl;
      }
    }

    // 1. Upsert AthleteProfile for hypertrophy coaching
    const athleteProfile = await prisma.athleteProfile.upsert({
      where: { id: 'singleton' },
      update: {
        displayName: displayName !== undefined ? displayName : undefined,
        trainingAgeYears: parsedTrainingAge.provided ? parsedTrainingAge.value : undefined,
        sessionDurationMin:
          parsedSessionDuration.provided && parsedSessionDuration.value != null
            ? parsedSessionDuration.value
            : undefined,
        athleteContext: athleteContext !== undefined ? athleteContext : undefined,
        availableEquipment: availableEquipment
          ? ((availableEquipment || []) as unknown as Prisma.InputJsonValue)
          : undefined,
        movementRestrictions: movementRestrictions !== undefined ? movementRestrictions : undefined,
        availableDays: availableDays !== undefined ? (availableDays as unknown as Prisma.InputJsonValue) : undefined,
        weeklyWorkoutsTarget: parsedWeeklyTarget.provided ? parsedWeeklyTarget.value : undefined,
        bodyWeightKg: parsedWeight.provided ? parsedWeight.value : undefined,
        heightCm: parsedHeight.provided ? parsedHeight.value : undefined,
        birthDate: birthDate !== undefined ? (birthDate ? String(birthDate) : null) : undefined,
        biologicalSex: biologicalSex !== undefined ? (biologicalSex ? String(biologicalSex) : null) : undefined,
        bodyFatPercent: parsedBodyFat.provided ? parsedBodyFat.value : undefined,
        metabolicTrackerUrl: normalizedMetabolicUrl,
      },
      create: {
        id: 'singleton',
        displayName: displayName || null,
        trainingAgeYears: parsedTrainingAge.value ?? null,
        sessionDurationMin: parsedSessionDuration.value ?? 60,
        athleteContext: athleteContext || null,
        availableEquipment: (availableEquipment || []) as unknown as Prisma.InputJsonValue,
        movementRestrictions: movementRestrictions || null,
        availableDays: availableDays !== undefined ? (availableDays as unknown as Prisma.InputJsonValue) : undefined,
        weeklyWorkoutsTarget: parsedWeeklyTarget.value ?? undefined,
        bodyWeightKg: parsedWeight.value ?? null,
        heightCm: parsedHeight.value ?? null,
        birthDate: birthDate ? String(birthDate) : null,
        biologicalSex: biologicalSex ? String(biologicalSex) : null,
        bodyFatPercent: parsedBodyFat.value ?? null,
        metabolicTrackerUrl: normalizedMetabolicUrl ?? null,
      },
    });

    // 2. Dynamically rebalance the next 4 calendar weeks if availableDays or weeklyWorkoutsTarget was updated
    let rebalanceSummary = null;
    if (availableDays !== undefined || weeklyWorkoutsTarget !== undefined) {
      try {
        const today = todayISO();
        const weeklyResults = [];
        for (const offset of [0, 7, 14, 21]) {
          weeklyResults.push(await rebalanceWeekSchedule('singleton', shiftISODate(today, offset)));
        }
        rebalanceSummary = {
          ...weeklyResults[0],
          rebalancedCount: weeklyResults.reduce((sum, r) => sum + r.rebalancedCount, 0),
          weeksProcessed: weeklyResults.length,
        };
      } catch (err) {
        console.warn('[Setup] Aviso: Falha ao rebalancear semanas após atualização:', err);
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
