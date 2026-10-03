import { prisma } from '@/lib/prisma';

export const DEFAULT_ATHLETE_WEIGHT_KG = 75.0;

/**
 * Resolves the athlete's body weight (in kg) for a given date using a deterministic priority chain:
 * 1. WellnessDaily.bodyWeightKg recorded exactly on `targetDate`
 * 2. Most recent WellnessDaily.bodyWeightKg recorded on or before `targetDate`
 * 3. AthleteProfile.bodyWeightKg (baseline profile weight)
 * 4. Fallback default: 75.0 kg
 */
export async function resolveAthleteWeightKg(
  athleteProfileId: string = 'singleton',
  targetDate?: string
): Promise<number> {
  try {
    const dateStr = targetDate || new Date().toISOString().split('T')[0];

    // 1. Direct match on target date
    const exactWellness = await prisma.wellnessDaily.findUnique({
      where: { date: dateStr },
      select: { bodyWeightKg: true },
    });

    if (exactWellness?.bodyWeightKg && exactWellness.bodyWeightKg > 20) {
      return Number(exactWellness.bodyWeightKg);
    }

    // 2. Most recent recorded weight on or before target date
    const recentWellness = await prisma.wellnessDaily.findFirst({
      where: {
        athleteProfileId,
        date: { lte: dateStr },
        bodyWeightKg: { not: null, gt: 20 },
      },
      orderBy: { date: 'desc' },
      select: { bodyWeightKg: true },
    });

    if (recentWellness?.bodyWeightKg && recentWellness.bodyWeightKg > 20) {
      return Number(recentWellness.bodyWeightKg);
    }

    // 3. AthleteProfile baseline weight
    const profile = await prisma.athleteProfile.findUnique({
      where: { id: athleteProfileId },
      select: { bodyWeightKg: true },
    });

    if (profile?.bodyWeightKg && profile.bodyWeightKg > 20) {
      return Number(profile.bodyWeightKg);
    }
  } catch (err) {
    console.warn('[resolveAthleteWeightKg] Erro ao buscar peso do atleta, usando fallback padrão:', err);
  }

  // 4. Default fallback
  return DEFAULT_ATHLETE_WEIGHT_KG;
}
